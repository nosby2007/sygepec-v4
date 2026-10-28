import "server-only";
import crypto from "node:crypto";
import { loadBusinessTaxCase } from "@/lib/business-admin";
import {
  ENTITY_TYPES, RETURN_FLOW, canMove, computeReturn, diagnostics, dueDate, linesFor, validSubmissionId,
} from "@/lib/business-return";
import { commitWrites, createWrite, getDocument, isConflict, queryCollection, replaceWrite, TAX_TENANT } from "@/lib/firebase";
import { cleanText, safeId } from "@/lib/security";

//   taxBusinessReturns/{caseId}       the return working papers and filing record
//   taxBusinessReturnEvents/{id}      append-only audit trail

export class ReturnError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const RECEIPT_THRESHOLD_CENTS = 7_500;

function booksFor(record) {
  const byCategory = {};
  for (const e of record.entries) {
    if (!["income", "expense"].includes(e.kind) || !Number.isSafeInteger(e.amountCents)) continue;
    const key = `${e.kind}:${e.category}`;
    byCategory[key] = (byCategory[key] || 0) + e.amountCents;
  }
  return {
    byCategory,
    entryCount: record.entries.length,
    matchedCount: record.entries.filter((e) => e.matched).length,
    largeWithoutReceipt: record.entries.filter((e) => e.kind === "expense" && e.amountCents >= RECEIPT_THRESHOLD_CENTS && !e.hasReceipt).length,
  };
}

const blank = (record) => ({
  tenantId: TAX_TENANT,
  caseId: record.report.id,
  clientId: record.report.clientId,
  taxYear: record.report.taxYear,
  entityType: null,
  entity: { legalName: record.user?.name || "", einLast4: "", accountingMethod: "CASH", stateCode: "", businessCode: "" },
  owners: [],
  adjustments: [],
  extended: false,
  status: "PREPARING",
  preparedBy: null, preparedByName: null,
  reviewedBy: null, reviewedByName: null, reviewedAt: null,
  signature: null,
  filing: null,
  approvedSnapshot: null,
  version: 0,
});

export async function loadReturn(session, caseId) {
  const record = await loadBusinessTaxCase(session, caseId);
  if (!record) return null;
  const stored = await getDocument(`taxBusinessReturns/${record.report.id}`, session.idToken).catch(() => null);
  const ret = stored ? { ...blank(record), ...stored } : blank(record);
  const books = booksFor(record);
  const computed = ret.entityType ? computeReturn({ entityType: ret.entityType, taxYear: ret.taxYear, byCategory: books.byCategory, adjustments: ret.adjustments, owners: ret.owners }) : null;
  const events = stored
    ? (await queryCollection("taxBusinessReturnEvents", session.idToken, { filters: [["caseId", "EQUAL", record.report.id], ["tenantId", "EQUAL", TAX_TENANT]], limit: 300 }).catch(() => []))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    : [];
  return {
    record,
    ret,
    updateTime: stored?.updateTime || null,
    books,
    computed,
    diagnostics: diagnostics({ entityType: ret.entityType, entity: ret.entity, owners: ret.owners, books, computed, review: { adjustments: ret.adjustments } }),
    due: ret.entityType ? { original: dueDate(ret.entityType, ret.taxYear), extended: dueDate(ret.entityType, ret.taxYear, { extended: true }) } : null,
    events,
  };
}

function parseWorkingPapers(input, entityType) {
  const errors = [];
  const type = ENTITY_TYPES[input.entityType] ? input.entityType : null;
  if (!type) errors.push("Choose the entity type.");
  const e = input.entity || {};
  const entity = {
    legalName: cleanText(e.legalName, 120),
    einLast4: /^\d{4}$/.test(String(e.einLast4 || "")) ? String(e.einLast4) : "",
    accountingMethod: ["CASH", "ACCRUAL"].includes(e.accountingMethod) ? e.accountingMethod : "CASH",
    stateCode: cleanText(e.stateCode, 2).toUpperCase(),
    businessCode: /^\d{6}$/.test(String(e.businessCode || "")) ? String(e.businessCode) : "",
  };
  if (e.einLast4 && !entity.einLast4) errors.push("Enter only the last 4 digits of the EIN.");
  const owners = (Array.isArray(input.owners) ? input.owners : []).slice(0, 25).map((o) => ({
    name: cleanText(o?.name, 100),
    title: cleanText(o?.title, 60),
    percent: Math.round(Number(o?.percent) * 1000) / 1000,
  })).filter((o) => o.name || o.percent);
  if (owners.some((o) => !Number.isFinite(o.percent) || o.percent < 0 || o.percent > 100)) errors.push("Ownership must be between 0 and 100%.");
  const lineKeys = new Set(linesFor(type || entityType).map((l) => l.key));
  const adjustments = (Array.isArray(input.adjustments) ? input.adjustments : []).slice(0, 50).map((a) => ({
    line: String(a?.line || ""),
    amountCents: Number(a?.amountCents),
    description: cleanText(a?.description, 200),
  }));
  if (adjustments.some((a) => !lineKeys.has(a.line))) errors.push("An adjustment points to a line this form does not have.");
  if (adjustments.some((a) => !Number.isSafeInteger(a.amountCents) || a.amountCents === 0 || Math.abs(a.amountCents) > 99_999_999_999))
    errors.push("Adjustment amounts must be non-zero whole cents.");
  return { errors, data: { entityType: type, entity, owners, adjustments, extended: input.extended === true } };
}

function event(ret, session, action, detail = "") {
  return createWrite(`taxBusinessReturnEvents/${crypto.randomUUID()}`, {
    tenantId: TAX_TENANT, caseId: ret.caseId, clientId: ret.clientId, action, detail: cleanText(detail, 500),
    actorId: session.uid, actorName: session.name, createdAt: new Date().toISOString(),
  });
}

const EDITABLE = new Set(["PREPARING", "IN_REVIEW", "REJECTED"]);

// action: save | move | sign | transmit | acknowledge
export async function updateReturn(session, rawCaseId, action, input = {}) {
  if (session?.role !== "PREPARER") throw new ReturnError("Preparer access required.", 403);
  const caseId = safeId(rawCaseId);
  const loaded = caseId ? await loadReturn(session, caseId) : null;
  if (!loaded) throw new ReturnError("Business tax case not found.", 404);
  const { ret, updateTime } = loaded;
  const now = new Date().toISOString();
  const next = { ...ret, updatedAt: now, updatedBy: session.uid, updatedByName: session.name, version: (ret.version || 0) + 1 };
  delete next.id; delete next.createTime; delete next.updateTime;
  if (!updateTime) Object.assign(next, { createdAt: now, preparedBy: session.uid, preparedByName: session.name });
  const events = [];

  if (action === "save") {
    if (!EDITABLE.has(ret.status)) throw new ReturnError(`The return is ${RETURN_FLOW[ret.status].label.toLowerCase()}. Send it back to preparation to edit it.`, 409);
    const { errors, data } = parseWorkingPapers(input, ret.entityType);
    if (errors.length) throw new ReturnError(errors.join(" "));
    Object.assign(next, data, { preparedBy: next.preparedBy || session.uid, preparedByName: next.preparedByName || session.name });
    if (ret.status === "REJECTED") next.status = "PREPARING";
    events.push(["SAVED", `${ENTITY_TYPES[data.entityType].form}: ${data.adjustments.length} adjustment(s)`]);
  } else if (action === "move") {
    const to = String(input.to || "");
    if (!canMove(ret.status, to)) throw new ReturnError(`Cannot move from ${RETURN_FLOW[ret.status]?.label || ret.status} to ${RETURN_FLOW[to]?.label || to}.`, 409);
    if (["IN_REVIEW", "APPROVED", "AWAITING_SIGNATURE"].includes(to) && !loaded.diagnostics.ready)
      throw new ReturnError(`Fix the blocking items first: ${loaded.diagnostics.errors.join(" ")}`, 409);
    if (to === "APPROVED") {
      if (input.confirmReview !== true) throw new ReturnError("Confirm that you reviewed the return against the source records.");
      Object.assign(next, {
        reviewedBy: session.uid, reviewedByName: session.name, reviewedAt: now,
        approvedSnapshot: { incomeCents: loaded.computed.incomeCents, deductionCents: loaded.computed.deductionCents, netCents: loaded.computed.netCents, entityTaxCents: loaded.computed.entityTaxCents ?? null, version: next.version },
      });
    }
    if (to === "PREPARING") Object.assign(next, { reviewedBy: null, reviewedByName: null, reviewedAt: null, approvedSnapshot: null, signature: null });
    next.status = to;
    events.push(["STATUS", `${RETURN_FLOW[ret.status].label} → ${RETURN_FLOW[to].label}${input.note ? `: ${cleanText(input.note, 300)}` : ""}`]);
  } else if (action === "sign") {
    if (ret.status !== "AWAITING_SIGNATURE") throw new ReturnError("Request the signature first.", 409);
    const signedAt = cleanText(input.signedAt, 10);
    const signature = {
      form: ENTITY_TYPES[ret.entityType].signatureForm,
      method: ["ELECTRONIC", "WET_INK"].includes(input.method) ? input.method : null,
      signerName: cleanText(input.signerName, 100),
      signerTitle: cleanText(input.signerTitle, 60),
      signedAt,
      evidence: cleanText(input.evidence, 300),
      recordedBy: session.uid, recordedByName: session.name, recordedAt: now,
    };
    if (!signature.method || !signature.signerName || !/^\d{4}-\d{2}-\d{2}$/.test(signedAt) || !signature.evidence)
      throw new ReturnError(`Record how ${signature.form} was signed, by whom, when, and where the signed copy is kept.`);
    if (signedAt > now.slice(0, 10)) throw new ReturnError("The signature date cannot be in the future.");
    Object.assign(next, { signature, status: "SIGNED" });
    events.push(["SIGNED", `${signature.form} signed by ${signature.signerName}${signature.signerTitle ? `, ${signature.signerTitle}` : ""} on ${signedAt}`]);
  } else if (action === "transmit") {
    if (ret.status !== "SIGNED" || !ret.signature) throw new ReturnError("The signature authorization must be recorded before transmission.", 409);
    const submissionId = cleanText(input.submissionId, 20);
    if (!validSubmissionId(submissionId)) throw new ReturnError("Enter the 20-character MeF submission ID from your e-file software.");
    const software = cleanText(input.software, 80);
    if (!software) throw new ReturnError("Name the e-file software used to transmit.");
    next.filing = { submissionId, software, transmittedAt: now, transmittedBy: session.uid, transmittedByName: session.name, ackStatus: null, ackAt: null, rejectCodes: [] };
    next.status = "TRANSMITTED";
    events.push(["TRANSMITTED", `Submission ${submissionId} via ${software}`]);
  } else if (action === "acknowledge") {
    if (ret.status !== "TRANSMITTED") throw new ReturnError("Only transmitted returns can be acknowledged.", 409);
    const accepted = input.result === "ACCEPTED";
    const rejectCodes = accepted ? [] : (Array.isArray(input.rejectCodes) ? input.rejectCodes : String(input.rejectCodes || "").split(/[\s,]+/)).map((c) => cleanText(c, 30)).filter(Boolean).slice(0, 20);
    if (!accepted && !rejectCodes.length) throw new ReturnError("Enter the IRS reject code(s).");
    const ackAt = cleanText(input.ackAt, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ackAt)) throw new ReturnError("Enter the acknowledgement date.");
    next.filing = { ...ret.filing, ackStatus: accepted ? "ACCEPTED" : "REJECTED", ackAt, rejectCodes };
    next.status = accepted ? "ACCEPTED" : "REJECTED";
    events.push([next.status, accepted ? `Accepted ${ackAt}` : `Rejected ${ackAt}: ${rejectCodes.join(", ")}`]);
  } else {
    throw new ReturnError("Unsupported action.");
  }

  const path = `taxBusinessReturns/${ret.caseId}`;
  try {
    await commitWrites([
      updateTime ? replaceWrite(path, next, updateTime) : createWrite(path, next),
      ...events.map(([a, d]) => event(next, session, a, d)),
    ], session.idToken);
  } catch (error) {
    if (isConflict(error)) throw new ReturnError("Someone else changed this return. Reload and try again.", 409);
    throw error;
  }
  return next;
}

// Everything the preparer's e-file software needs, without the full EIN or SSNs.
export function exportPackage(loaded) {
  const { ret, computed, record, due } = loaded;
  return {
    generatedAt: new Date().toISOString(),
    notice: "Working papers for an IRS-authorized e-file provider. Not a filed return. Enter the full EIN and owner taxpayer IDs in your e-file software.",
    form: computed?.form,
    taxYear: ret.taxYear,
    entityType: ret.entityType,
    entity: ret.entity,
    owners: ret.owners,
    accountingPeriod: `${ret.taxYear}-01-01 to ${ret.taxYear}-12-31`,
    dueDate: ret.extended ? due?.extended : due?.original,
    extended: ret.extended,
    lines: computed?.lines.filter((l) => l.cents !== 0).map(({ line, label, cents }) => ({ line, label, amount: cents / 100 })),
    otherDeductionsStatement: computed?.statement.map((s) => ({ description: s.label, amount: s.cents / 100 })),
    totals: computed && { income: computed.incomeCents / 100, deductions: computed.deductionCents / 100, ordinaryBusinessIncome: computed.netCents / 100 },
    entityTax: computed?.entityTaxCents != null ? computed.entityTaxCents / 100 : undefined,
    k1Allocations: computed?.allocations?.map((a) => ({ owner: a.name, percent: a.percent, ordinaryBusinessIncome: a.cents / 100 })),
    selfEmploymentTaxEstimate: computed?.seTax?.available ? computed.seTax.taxCents / 100 : undefined,
    adjustments: ret.adjustments.map((a) => ({ line: a.line, amount: a.amountCents / 100, explanation: a.description })),
    review: { preparedBy: ret.preparedByName, reviewedBy: ret.reviewedByName, reviewedAt: ret.reviewedAt },
    signature: ret.signature,
    sourceBooks: { entries: record.entries.length, bankMatched: record.entries.filter((e) => e.matched).length, receipts: record.receipts.length },
  };
}

export function exportCsv(pkg) {
  const rows = [["Section", "Line", "Description", "Amount"]];
  for (const l of pkg.lines || []) rows.push(["Form", l.line, l.label, l.amount.toFixed(2)]);
  for (const s of pkg.otherDeductionsStatement || []) rows.push(["Other deductions statement", "", s.description, s.amount.toFixed(2)]);
  for (const k of pkg.k1Allocations || []) rows.push(["Schedule K-1", "1", `${k.owner} (${k.percent}%)`, k.ordinaryBusinessIncome.toFixed(2)]);
  if (pkg.totals) rows.push(["Total", "", "Ordinary business income", pkg.totals.ordinaryBusinessIncome.toFixed(2)]);
  // Leading =, +, - or @ would be read as a spreadsheet formula.
  const cell = (v) => {
    const text = String(v);
    const safe = /^-?\d+(\.\d+)?$/.test(text) ? text : text.replace(/^([=+\-@])/, "'$1");
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
