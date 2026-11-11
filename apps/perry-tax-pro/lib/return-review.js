import "server-only";
import crypto from "node:crypto";
import { audit } from "@/lib/audit";
import { FROZEN_REVIEW } from "@/lib/constants";
import { listClientReturns, listDocuments } from "@/lib/data";
import { getDocument, mergeDocument, setDocument, TAX_TENANT } from "@/lib/firebase";
import { compareYears } from "@/lib/intake-checks";
import { sanitizeIntake } from "@/lib/intake-schema";
import { cleanText } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { buildChecklist, intakeToEstimate } from "@/lib/tax";
import { doubleCheck, filingBlockers } from "@/lib/tax-engine/checks";
import { computeReturn, estimateFromReturn } from "@/lib/tax-engine/index";
import { sanitizeSupplement } from "@/lib/tax-engine/model";
import { answersFingerprintSource, approvalProblems, checklistFor, transitionError } from "@/lib/review-rules";

// Preparer review of an individual return.
//
//   taxReviews/{returnId}  checklist, internal notes, resolved double-check items and the
//                          approval snapshot. Server-only: no security rules let a client
//                          read it, because the notes are internal.
//   taxReturns/{id}.reviewStatus  the status the client may see; it also freezes answers.

export class ReviewError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const fingerprint = (intake) => crypto.createHash("sha256").update(answersFingerprintSource(intake)).digest("hex");

async function getReview(returnId) {
  return (await getDocument(`taxReviews/${returnId}`, await serviceToken()).catch(() => null)) || null;
}

async function saveReview(returnId, data) {
  const { id: _i, createTime: _c, updateTime: _u, ...rest } = data;
  await setDocument(`taxReviews/${returnId}`, { tenantId: TAX_TENANT, returnId, ...rest, updatedAt: new Date().toISOString() }, await serviceToken());
}

// Everything the review page shows, computed from the stored answers.
export async function reviewContext(r) {
  const intake = sanitizeIntake(r.intake);
  const taxYear = Number(r.tax_year) || 2026;
  const [stored, documents, history] = await Promise.all([
    getReview(r.id),
    listDocuments(r.id).catch(() => []),
    listClientReturns(r.client_id).catch(() => []),
  ]);
  const priorReturn = history.find((x) => Number(x.tax_year) === taxYear - 1) || null;
  const prior = priorReturn ? sanitizeIntake(priorReturn.intake) : null;
  // Facts only a preparer adds (carryovers, allocations between states...).
  const supplement = sanitizeSupplement(stored?.supplement);
  const result = computeReturn(intake, taxYear, supplement);
  const estimate = estimateFromReturn(result);
  const comparison = prior ? compareYears(intake, prior, { currentEstimate: estimate, priorEstimate: intakeToEstimate(prior, taxYear - 1) }) : null;
  const checklist = buildChecklist(intake);
  const issues = doubleCheck(intake, { result, estimate, documents, checklist, comparison, taxYear });
  const review = {
    status: r.review_status || "NOT_STARTED",
    checklist: stored?.checklist || {},
    resolved: stored?.resolved || {},
    notes: stored?.notes || [],
    snapshot: stored?.snapshot || null,
    history: stored?.history || [],
  };
  const changedSinceApproval = review.snapshot && FROZEN_REVIEW.includes(review.status) ? review.snapshot.fingerprint !== fingerprint(intake) : false;
  return {
    intake, taxYear, estimate, comparison, issues, documents, checklist, review, changedSinceApproval,
    states: result.states,
    supplement,
    calculation: {
      federal: { ruleSet: result.federal.ruleSet, lines: result.federal.lines, trace: result.federal.trace, forms: result.federal.forms, unsupported: result.federal.unsupported, notes: result.federal.notes, summary: result.federal.summary, carryovers: result.federal.carryovers },
      modules: result.modules,
      readiness: result.readiness,
    },
    filingBlockers: filingBlockers(issues, review.resolved),
    reviewChecklist: checklistFor(intake),
    problems: approvalProblems({ intake, issues, resolved: review.resolved, checklist: review.checklist }),
    priorYear: priorReturn ? priorReturn.tax_year : null,
  };
}

const event = (session, type, details = {}) => ({ at: new Date().toISOString(), by: session.uid, byName: session.name || session.email || "Preparer", type, ...details });

export async function updateReview(session, r, body) {
  if (session?.role !== "PREPARER") throw new ReviewError("Preparer access required.", 403);
  const ctx = await reviewContext(r);
  const stored = (await getReview(r.id)) || {};
  const next = {
    checklist: { ...(stored.checklist || {}) },
    resolved: { ...(stored.resolved || {}) },
    notes: [...(stored.notes || [])],
    history: [...(stored.history || [])].slice(-200),
    snapshot: stored.snapshot || null,
    supplement: stored.supplement || {},
  };
  const action = String(body?.action || "");
  const target = `taxReturns/${r.id}`;

  if (action === "checklist") {
    const item = ctx.reviewChecklist.find((c) => c.key === body.key);
    if (!item) throw new ReviewError("Unknown checklist item.");
    if (FROZEN_REVIEW.includes(ctx.review.status)) throw new ReviewError("Reopen the review to change the checklist.", 409);
    next.checklist[item.key] = body.done ? { by: session.uid, at: new Date().toISOString() } : false;
    next.history.push(event(session, "CHECKLIST", { key: item.key, done: Boolean(body.done) }));
    await saveReview(r.id, next);
    await audit(session, "REVIEW_UPDATED", { target, details: { checklist: item.key, done: Boolean(body.done) } });
  } else if (action === "note") {
    const text = cleanText(body.text, 2000);
    if (!text) throw new ReviewError("Write a note first.");
    next.notes.push({ at: new Date().toISOString(), by: session.uid, byName: session.name || "Preparer", text });
    next.notes = next.notes.slice(-100);
    await saveReview(r.id, next);
    await audit(session, "REVIEW_UPDATED", { target, details: { note: true } });
  } else if (action === "supplement") {
    if (FROZEN_REVIEW.includes(ctx.review.status)) throw new ReviewError("Reopen the review to change the preparer entries: the figures are frozen.", 409);
    next.supplement = sanitizeSupplement(body.supplement);
    next.history.push(event(session, "SUPPLEMENT", { fields: Object.keys(next.supplement) }));
    await saveReview(r.id, next);
    await audit(session, "REVIEW_UPDATED", { target, details: { supplement: Object.keys(next.supplement) } });
  } else if (action === "resolve") {
    const code = cleanText(body.code, 80);
    if (!ctx.issues.some((i) => i.code === code)) throw new ReviewError("This item is no longer raised.");
    const status = ["RESOLVED", "IGNORED", "OPEN"].includes(body.status) ? body.status : "";
    if (!status) throw new ReviewError("Choose resolved, ignored or open.");
    const note = cleanText(body.note, 500);
    if (status === "IGNORED" && !note) throw new ReviewError("Explain why this item is ignored.");
    if (status === "OPEN") delete next.resolved[code];
    else next.resolved[code] = { status, note, by: session.uid, byName: session.name || "Preparer", at: new Date().toISOString() };
    next.history.push(event(session, "RESOLVE", { code, status }));
    await saveReview(r.id, next);
    await audit(session, "DIAGNOSTIC_RESOLVED", { target, details: { code, status } });
  } else if (action === "status") {
    const to = String(body.status || "");
    const from = ctx.review.status;
    const reason = cleanText(body.reason, 500);
    const error = transitionError({ from, to, reason, signatureStatus: r.signature_status, submissionStatus: r.submission_status, problems: ctx.problems });
    if (error) throw new ReviewError(error, 409);
    if (to === from) return reviewContext(r);
    const now = new Date().toISOString();
    const freezing = FROZEN_REVIEW.includes(to) && !FROZEN_REVIEW.includes(from);
    const reopening = FROZEN_REVIEW.includes(from) && !FROZEN_REVIEW.includes(to);
    if (freezing) {
      const e = ctx.estimate;
      next.snapshot = {
        fingerprint: fingerprint(ctx.intake), rev: ctx.intake.rev, ruleSet: e.ruleSet, at: now, by: session.uid, byName: session.name || "Preparer",
        figures: { agi: e.agi, deduction: e.deduction, taxable: e.taxable, totalTax: e.totalTax, credits: e.credits, payments: e.payments, refund: e.refund },
        // The whole calculation as approved: never recomputed, even when rules change later.
        calculation: {
          status: ctx.calculation.readiness.calculationStatus,
          supplement: ctx.supplement,
          federal: { ruleSet: ctx.calculation.federal.ruleSet, forms: ctx.calculation.federal.forms, lines: ctx.calculation.federal.lines },
          states: ctx.states.filter((s) => s.calculation === "AVAILABLE").map((s) => ({ code: s.code, kind: s.kind, form: s.form, ruleSet: s.ruleSet, lines: s.lines })),
        },
      };
    }
    next.history.push(event(session, "STATUS", { from, to, reason: reason || null }));
    await saveReview(r.id, next);
    // The client-visible status: this is what freezes the client's answers.
    await mergeDocument(target, { reviewStatus: to, reviewUpdatedAt: now, updatedAt: now }, session.idToken);
    const kind = reopening ? "REVIEW_REOPENED" : to === "APPROVED" || freezing ? "REVIEW_APPROVED" : "REVIEW_UPDATED";
    await audit(session, kind, { target, details: { from, to, reason: reason || null, fingerprint: next.snapshot?.fingerprint || null } });
    return reviewContext({ ...r, review_status: to });
  } else {
    throw new ReviewError("Unsupported action.");
  }
  return reviewContext(r);
}
