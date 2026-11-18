import "server-only";
import { audit } from "@/lib/audit";
import { getSignature } from "@/lib/esign";
import { federalLinkIssue } from "@/lib/efile/georgia";
import { buildPackage, sandboxAdapterFor, officialAdapter, schemaPackageStatus } from "@/lib/efile/package";
import { EfileError, FINAL_STATES, IN_FLIGHT } from "@/lib/efile/states";
import { afterAck, afterSend, applyEvent, newRecord, readinessIssues, recordView, refreshRecord, returnStatusFor, signatureMatches } from "@/lib/efile/submission";
import { efileConfig, productionGaps, SANDBOX_SCENARIOS, transportFor } from "@/lib/efile/transport";
import { commitWrites, getDocument, isConflict, patchFields, queryCollection, replaceWrite, setDocument, TAX_TENANT } from "@/lib/firebase";
import { paymentGate } from "@/lib/payments";
import { reviewContext } from "@/lib/return-review";
import { serviceToken } from "@/lib/service-identity";
import { isGeneralAdmin } from "@/lib/staff";

// Electronic filing of an approved return.
//
//   prepare   approved snapshot -> package -> taxSubmissions/{key} (idempotent)
//   transmit  READY_TO_TRANSMIT / FAILED_RETRYABLE -> TRANSMITTING -> receipt | failure | unknown
//   poll      ACK_PENDING -> verified acknowledgement -> ACCEPTED / REJECTED
//   reconcile INDETERMINATE -> asks the receiver whether it has the package
//
// Reviewing a return and transmitting it are separate permissions: transmitting takes the
// general admin role or a uid listed in EFILE_TRANSMITTER_UIDS.
//
// Georgia (lib/efile/georgia.js) has its own package, its own sandbox receiver and its own
// production gate. A Georgia submission is linked to the federal submission for the same
// approved figures and is sent only after that federal submission.

const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;
const now = () => new Date().toISOString();

async function token() { return serviceToken(); }

// The sandbox receiver, kept in Firestore so every server instance sees the same one.
const sandboxStore = {
  get: async (ref) => {
    const doc = await getDocument(`taxEfileSandbox/${ref}`, await token()).catch(() => null);
    return doc ? strip(doc) : null;
  },
  set: async (ref, value) => { await setDocument(`taxEfileSandbox/${ref}`, { tenantId: TAX_TENANT, ...value }, await token()); },
};

export async function mayTransmit(session, config = efileConfig()) {
  if (session?.role !== "PREPARER") return false;
  return config.transmitters.includes(session.uid) || isGeneralAdmin(session);
}

function adapterFor(taxYear, config, jurisdiction = "US") {
  if (config.mode !== "production") return sandboxAdapterFor(jurisdiction, taxYear);
  const official = officialAdapter(taxYear, jurisdiction);
  if (!official) throw new EfileError(jurisdiction === "GA" ? `The Georgia schema package for ${taxYear} is not installed.` : `The IRS schema package for ${taxYear} is not installed.`, 409, "EFILE_NO_SCHEMA");
  return official;
}

const adapterOfRecord = (record) => (record.official ? officialAdapter(record.taxYear, record.jurisdiction) : sandboxAdapterFor(record.jurisdiction, record.taxYear));

async function listForReturn(returnId) {
  const rows = await queryCollection("taxSubmissions", await token(), { filters: [["returnId", "EQUAL", returnId]], limit: 50 }).catch(() => []);
  return rows.filter((x) => x.tenantId === TAX_TENANT).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getRecord(key) {
  if (!/^[0-9a-f]{64}$/.test(String(key || ""))) throw new EfileError("Unknown submission.", 404, "EFILE_NOT_FOUND");
  const doc = await getDocument(`taxSubmissions/${key}`, await token()).catch(() => null);
  if (!doc || doc.tenantId !== TAX_TENANT) throw new EfileError("Unknown submission.", 404, "EFILE_NOT_FOUND");
  return doc;
}

// Writes the record only if nobody changed it since it was read: two clicks on
// "Transmit" can never both send.
async function saveRecord(previous, next) {
  try {
    await commitWrites([replaceWrite(`taxSubmissions/${next.key}`, strip(next), previous.updateTime)], await token());
  } catch (error) {
    if (isConflict(error)) throw new EfileError("This submission changed in the meantime. Refresh and try again.", 409, "EFILE_CONFLICT");
    throw error;
  }
  return { ...next, updateTime: undefined };
}

// The return shows the electronic filing state; the filing status itself moves only on
// an authoritative acknowledgement, with the same effects as recording it by hand.
async function reflectOnReturn(r, record) {
  // Georgia is shown on its own and never moves the return's federal filing status.
  if (record.jurisdiction !== "US") {
    const key = `efile${record.jurisdiction === "GA" ? "Ga" : record.jurisdiction}`;
    const value = {
      state: record.state, sandbox: !record.official, updatedAt: record.updatedAt, submissionRef: record.submissionRef, status: returnStatusFor(record) || "",
      rejections: record.state === "REJECTED" ? (record.ack?.errors || []).slice(0, 20).map(({ code, message, step }) => ({ code, message: String(message).slice(0, 300), step: step || "" })) : [],
    };
    await patchFields(`taxReturns/${r.id}`, { [key]: value, updatedAt: now() }, await token()).catch(() => null);
    return;
  }
  const fields = {
    efileState: record.state, efileJurisdiction: record.jurisdiction, efileSandbox: !record.official, efileUpdatedAt: record.updatedAt,
    efileRejections: record.state === "REJECTED" ? (record.ack?.errors || []).slice(0, 20).map(({ code, message, step }) => ({ code, message: String(message).slice(0, 300), step: step || "" })) : [],
  };
  const status = record.jurisdiction === "US" ? returnStatusFor(record) : null;
  if (status === "SUBMITTED") Object.assign(fields, { submissionStatus: "SUBMITTED", submissionReference: record.submissionRef, submittedAt: record.transmittedAt || record.updatedAt, status: "FILED" });
  if (status === "ACCEPTED") Object.assign(fields, { submissionStatus: "ACCEPTED", acceptedAt: record.ack.receivedAt, status: "ACCEPTED" });
  if (status === "REJECTED") Object.assign(fields, { submissionStatus: "REJECTED", status: "IN_REVIEW", reviewStatus: "CHANGES_REQUESTED", reviewUpdatedAt: record.updatedAt });
  await patchFields(`taxReturns/${r.id}`, { ...fields, updatedAt: now() }, await token()).catch(() => null);
}

// Everything the readiness checks need, for one jurisdiction.
async function readiness(r, jurisdiction, ctx, records = null) {
  const snapshot = ctx.review.snapshot;
  // The federal submission a state return is linked to: same approved figures.
  let federalLink = null;
  if (jurisdiction !== "US" && snapshot) {
    const rows = records || await listForReturn(r.id);
    const federal = rows.find((x) => x.jurisdiction === "US" && x.fingerprint === snapshot.fingerprint) || null;
    federalLink = federalLinkIssue({ federal, federalFiledElsewhere: ["SUBMITTED", "ACCEPTED"].includes(r.submission_status) });
  }
  const signature = await getSignature(r.id);
  const payment = await paymentGate("TAX_RETURN", r.id, "FILE").catch(() => "");
  const stateCalculated = jurisdiction === "US" || Boolean(snapshot?.calculation?.states?.some((s) => s.code === jurisdiction));
  const issues = readinessIssues({
    reviewStatus: ctx.review.status, snapshot, changedSinceApproval: ctx.changedSinceApproval, signature,
    signatureStatus: r.signature_status, signedAt: r.signed_at,
    filingBlockers: ctx.filingBlockers.filter((b) => !b.jurisdiction || b.jurisdiction === jurisdiction),
    paymentBlock: payment || "", manualSubmissionStatus: jurisdiction === "US" ? r.submission_status : "", jurisdiction, stateCalculated,
    production: efileConfig().mode === "production", federalLink,
  });
  const signaturesComplete = signatureMatches({ snapshot, signature, signatureStatus: r.signature_status, signedAt: r.signed_at });
  // Missing signatures leave the submission waiting; every other item blocks it.
  const blocking = issues.filter((i) => i.blocking && i.code !== "EFILE_8879_MISSING");
  // Waiting for the federal return to be sent: the package stays ready, but is not sent.
  const waiting = issues.filter((i) => i.waitsFor === "FEDERAL");
  return { issues, blocking, waiting, signaturesComplete, snapshot };
}

const jurisdictionsOf = (snapshot) => ["US", ...((snapshot?.calculation?.states || []).map((s) => s.code))];

// The e-file panel: configuration, readiness per jurisdiction and every submission.
export async function efileStatus(session, r) {
  const config = efileConfig();
  const ctx = await reviewContext(r);
  const taxYear = Number(r.tax_year) || 2026;
  const records = await listForReturn(r.id);
  const jurisdictions = [];
  for (const code of jurisdictionsOf(ctx.review.snapshot)) {
    const ready = await readiness(r, code, ctx, records);
    jurisdictions.push({ code, issues: ready.issues, signaturesComplete: ready.signaturesComplete, waitingForFederal: ready.waiting.length > 0, schema: schemaPackageStatus(taxYear, code) });
  }
  return {
    mode: config.mode,
    canTransmit: await mayTransmit(session, config),
    scenarios: config.mode === "sandbox" ? SANDBOX_SCENARIOS : null,
    schema: schemaPackageStatus(taxYear),
    production: { federal: productionGaps(config, "US"), georgia: productionGaps(config, "GA") },
    jurisdictions,
    submissions: records.map((x) => recordView(x, { staff: true })),
  };
}

export async function prepareSubmission(session, r, rawJurisdiction = "US") {
  if (session?.role !== "PREPARER") throw new EfileError("Preparer access required.", 403, "EFILE_FORBIDDEN");
  const config = efileConfig();
  if (config.mode === "off") throw new EfileError("Electronic filing is turned off on this server.", 409, "EFILE_OFF");
  const ctx = await reviewContext(r);
  const snapshot = ctx.review.snapshot;
  const jurisdiction = String(rawJurisdiction || "US").toUpperCase();
  if (!jurisdictionsOf(snapshot).includes(jurisdiction)) throw new EfileError(snapshot ? `There is no approved ${jurisdiction} calculation.` : "Approve the review before preparing a submission.", 409, "EFILE_NO_CALCULATION");
  const all = await listForReturn(r.id);
  const ready = await readiness(r, jurisdiction, ctx, all);
  const taxYear = Number(r.tax_year) || 2026;
  const pkg = buildPackage({ returnId: r.id, taxYear, intake: ctx.intake, calculation: snapshot.calculation, fingerprint: snapshot.fingerprint, jurisdiction }, adapterFor(taxYear, config, jurisdiction));
  const at = now();
  const existing = all.filter((x) => x.jurisdiction === jurisdiction);

  // Same package: same record.
  const same = existing.find((x) => x.key === pkg.key);
  if (same) {
    const next = refreshRecord(same, { signaturesComplete: ready.signaturesComplete, blocking: ready.blocking.length > 0, by: session.uid, at });
    const saved = next === same ? same : await saveRecord(same, next);
    return recordView(saved, { staff: true });
  }
  // Another package while one is with the receiver: wait for its acknowledgement.
  const inFlight = existing.find((x) => IN_FLIGHT.includes(x.state));
  if (inFlight) throw new EfileError(inFlight.state === "ACCEPTED" ? "This return was already accepted. File an amended return instead." : `Submission ${inFlight.submissionRef} is "${inFlight.state}". Wait for its acknowledgement (or reconcile it) before preparing another.`, 409, "EFILE_IN_FLIGHT");
  // Older packages that were never sent are withdrawn.
  for (const old of existing.filter((x) => !FINAL_STATES.includes(x.state) && x.state !== "NOT_READY")) {
    await saveRecord(old, applyEvent(old, "INVALIDATED", { by: session.uid, at, detail: "Replaced by a newer package." })).catch(() => null);
  }
  const supersedes = existing.find((x) => x.state === "REJECTED")?.key || null;
  const record = newRecord({ pkg, returnId: r.id, clientId: r.client_id, fingerprint: snapshot.fingerprint, signaturesComplete: ready.signaturesComplete, blocking: ready.blocking.length > 0, supersedes, by: session.uid, at, tenantId: TAX_TENANT });
  try {
    await setDocument(`taxSubmissions/${record.key}`, record, await token(), { createOnly: true });
  } catch (error) {
    // Created by a parallel request: that record is the one.
    if (isConflict(error)) return recordView(await getRecord(record.key), { staff: true });
    throw error;
  }
  await audit(session, "EFILE_PREPARED", { target: `taxReturns/${r.id}`, details: { key: record.key, jurisdiction, state: record.state, adapter: pkg.adapterId, errors: pkg.errors.length, supersedes: supersedes || "" } });
  await reflectOnReturn(r, record);
  return recordView(record, { staff: true });
}

export async function transmitSubmission(session, r, key, { scenario } = {}) {
  const config = efileConfig();
  if (!await mayTransmit(session, config)) {
    await audit(session, "EFILE_REFUSED", { target: `taxReturns/${r.id}`, outcome: "DENIED", details: { key: String(key).slice(0, 64), reason: "not a transmitter" } });
    throw new EfileError("You may review returns but not transmit them. Ask the general admin.", 403, "EFILE_FORBIDDEN");
  }
  const record = await getRecord(key);
  if (record.returnId !== r.id) throw new EfileError("Unknown submission.", 404, "EFILE_NOT_FOUND");
  if (!["READY_TO_TRANSMIT", "FAILED_RETRYABLE"].includes(record.state)) throw new EfileError(`A submission that is "${record.state}" cannot be transmitted.`, 409, "EFILE_BAD_TRANSITION");
  // Checked again at the last moment: signatures, answers and payment may have changed.
  const ctx = await reviewContext(r);
  const ready = await readiness(r, record.jurisdiction, ctx);
  if (ctx.review.snapshot?.fingerprint !== record.fingerprint || ready.blocking.length || !ready.signaturesComplete) {
    const at = now();
    const next = applyEvent(record, "INVALIDATED", { by: session.uid, at, detail: (ready.issues[0]?.message || "The approved figures changed.") });
    await saveRecord(record, next);
    await reflectOnReturn(r, next);
    throw new EfileError(`Not transmitted: ${ready.issues.map((i) => i.message).join(" ") || "the approved figures changed."}`, 409, "EFILE_NOT_READY");
  }
  // A linked state return waits for its federal return; the package stays ready.
  if (ready.waiting.length) throw new EfileError(`Not transmitted yet: ${ready.waiting.map((i) => `${i.message} ${i.action}`).join(" ")}`, 409, "EFILE_WAITING_FOR_FEDERAL");
  const chosen = config.mode === "sandbox" ? (SANDBOX_SCENARIOS[scenario] ? scenario : "ACCEPT") : null;
  const transport = transportFor({ jurisdiction: record.jurisdiction, config, scenario: chosen || undefined, store: sandboxStore });
  // Claim the record first. If the claim fails, someone else is sending it.
  await saveRecord(record, applyEvent(record, "SEND_STARTED", { by: session.uid, detail: transport.label, changes: { scenario: chosen } }));
  const current = await getRecord(key);
  let result;
  try {
    result = await transport.send({ submissionRef: record.submissionRef, linkedFederalRef: record.linkedFederalRef || null, hash: record.hash, xml: record.xml, valid: record.validationErrors.length === 0, errors: record.validationErrors });
  } catch (error) {
    result = { outcome: "UNKNOWN", message: `The transport failed during sending: ${String(error?.message || error).slice(0, 200)}` };
  }
  const next = afterSend(current, result, transport, { by: session.uid, at: now() });
  const saved = await saveRecord(current, next);
  await audit(session, "EFILE_TRANSMITTED", { target: `taxReturns/${r.id}`, outcome: result.outcome, details: { key, jurisdiction: record.jurisdiction, transport: transport.id, receipt: result.receiptId || "", state: next.state, attempt: next.attempts } });
  await reflectOnReturn(r, saved);
  return recordView(saved, { staff: true });
}

export async function pollAcknowledgement(session, r, key) {
  if (session?.role !== "PREPARER") throw new EfileError("Preparer access required.", 403, "EFILE_FORBIDDEN");
  const config = efileConfig();
  const record = await getRecord(key);
  if (record.returnId !== r.id) throw new EfileError("Unknown submission.", 404, "EFILE_NOT_FOUND");
  if (record.state !== "ACK_PENDING") throw new EfileError("This submission is not waiting for an acknowledgement.", 409, "EFILE_BAD_TRANSITION");
  const transport = transportFor({ jurisdiction: record.jurisdiction, config, scenario: record.scenario || undefined, store: sandboxStore });
  if (transport.authoritative !== Boolean(record.authoritative)) throw new EfileError("This submission was sent through another transport; its acknowledgement cannot be read here.", 409, "EFILE_TRANSPORT_MISMATCH");
  const raw = await transport.fetchAck({ submissionRef: record.submissionRef, hash: record.hash });
  if (!raw) return { waiting: true, submission: recordView(record, { staff: true }) };
  const adapter = adapterOfRecord(record);
  const { record: next, ack } = afterAck(record, raw, transport, adapter, { by: session.uid, at: now() });
  const saved = await saveRecord(record, next);
  await audit(session, ack.verified ? "EFILE_ACKNOWLEDGED" : "EFILE_ACK_UNVERIFIED", { target: `taxReturns/${r.id}`, outcome: ack.status || "UNVERIFIED", details: { key, jurisdiction: record.jurisdiction, authoritative: String(ack.authoritative || false), errors: (ack.errors || []).map((e) => e.code).join(",") || (ack.reason || "") } });
  await reflectOnReturn(r, saved);
  return { waiting: !ack.verified, reason: ack.verified ? "" : ack.reason, submission: recordView(saved, { staff: true }) };
}

export async function reconcileSubmission(session, r, key) {
  if (!await mayTransmit(session)) throw new EfileError("Only a transmitter can reconcile a submission.", 403, "EFILE_FORBIDDEN");
  const record = await getRecord(key);
  if (record.returnId !== r.id) throw new EfileError("Unknown submission.", 404, "EFILE_NOT_FOUND");
  if (record.state !== "INDETERMINATE") throw new EfileError("Only a submission with an unknown outcome is reconciled.", 409, "EFILE_BAD_TRANSITION");
  const transport = transportFor({ jurisdiction: record.jurisdiction, scenario: record.scenario || undefined, store: sandboxStore });
  const found = await transport.lookup({ submissionRef: record.submissionRef, hash: record.hash }).catch(() => "UNKNOWN");
  if (found === "UNKNOWN") return { unresolved: true, submission: recordView(record, { staff: true }) };
  const next = applyEvent(record, found === "RECEIVED" ? "RECONCILED_RECEIVED" : "RECONCILED_NOT_RECEIVED", { by: session.uid, at: now(), detail: `Receiver says ${found}.` });
  const saved = await saveRecord(record, next);
  await audit(session, "EFILE_RECONCILED", { target: `taxReturns/${r.id}`, details: { key, jurisdiction: record.jurisdiction, found, state: next.state } });
  await reflectOnReturn(r, saved);
  return { unresolved: false, submission: recordView(saved, { staff: true }) };
}

// The client's view: their submissions, without internal details.
export async function clientEfileView(r) {
  const records = await listForReturn(r.id);
  return records.map((x) => recordView(x));
}

// Every submission, for the transmission queue.
export async function listSubmissions() {
  const rows = await queryCollection("taxSubmissions", await token(), { filters: [["tenantId", "EQUAL", TAX_TENANT]], limit: 500 }).catch(() => []);
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map((x) => recordView(x, { staff: true }));
}
