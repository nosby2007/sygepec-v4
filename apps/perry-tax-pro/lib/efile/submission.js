// Submission records and e-file readiness. Pure functions: the service (lib/efile/service.js)
// reads and writes Firestore, the tests drive these directly.
//
//   taxSubmissions/{key}   one record per return, year, jurisdiction and approved answers
//                          (key = idempotencyKey). Server-only: no security rules open it.
//
// A record never goes back: a correction after a rejection, or after new answers, is a new
// record with its own key, which names the record it supersedes.
import { EFILE_LABEL, FINAL_STATES, IN_FLIGHT, transition } from "@/lib/efile/states";
import { parseAcknowledgement, stepForLine } from "@/lib/efile/package";

const HISTORY_MAX = 200;

// ---- Readiness ---------------------------------------------------------------------------

// Was Form 8879 signed for these exact approved figures? A signature request records the
// approval fingerprint it was sent for; older requests (before this field existed) count
// only when signed after the approval.
export function signatureMatches({ snapshot, signature, signatureStatus, signedAt }) {
  if (!snapshot) return false;
  if (signatureStatus !== "SIGNED") return false;
  if (signature?.fingerprint) return signature.status === "COMPLETED" && signature.fingerprint === snapshot.fingerprint;
  return Boolean(signedAt) && Date.parse(signedAt) >= Date.parse(snapshot.at);
}

// Layer-4 Double-Check items. Each one is blocking unless marked otherwise.
export function readinessIssues({ reviewStatus, snapshot, changedSinceApproval, signature, signatureStatus, signedAt, filingBlockers = [], paymentBlock = "", manualSubmissionStatus, pkg = null, jurisdiction = "US", stateCalculated = true, production = false }) {
  const out = [];
  const add = (code, message, action, extra = {}) => out.push({ code, message, action, blocking: true, form: "", field: "", source: "InnovaTax e-file readiness", ...extra });
  if (!["READY_TO_SIGN", "APPROVED"].includes(reviewStatus) || !snapshot) add("EFILE_NOT_APPROVED", "The preparer review has not frozen the figures.", "Preparer: finish the review and mark it Ready to sign.");
  if (changedSinceApproval) add("EFILE_CHANGED_SINCE_APPROVAL", "The answers changed after the figures were approved.", "Preparer: reopen the review, approve again and collect a new Form 8879.");
  if (snapshot && !signatureMatches({ snapshot, signature, signatureStatus, signedAt })) add("EFILE_8879_MISSING", signatureStatus === "SIGNED" ? "Form 8879 was signed for different figures." : "Form 8879 is not signed.", "Send Form 8879 for the approved figures and wait for every signature.", { form: "Form 8879" });
  // The rules ladder (lib/tax-engine/registry.js): only FILING_READY figures may reach a
  // real receiver. The sandbox accepts any approved figures and says so.
  const calcStatus = snapshot?.calculation?.status || "PENDING";
  if (snapshot && calcStatus !== "FILING_READY") add("EFILE_CALCULATION_NOT_FILING_READY", `The approved figures come from rules that are ${calcStatus.toLowerCase().replace("_", " ")}, not filing-ready.`, production ? "Validate and approve every rule module used before filing." : "Sandbox only: this does not stop a test transmission.", { blocking: production });
  if (jurisdiction !== "US" && !stateCalculated) add("EFILE_STATE_NOT_CALCULATED", `There is no approved ${jurisdiction} calculation.`, "Prepare this state return separately.");
  for (const b of filingBlockers) add(`EFILE_BLOCKER_${b.code}`, `Unresolved: ${b.message}`, b.action || "Resolve this Double-Check item.", { form: b.form || "", field: b.field || "", step: b.step || "" });
  if (paymentBlock) add("EFILE_PAYMENT", paymentBlock, "Collect or record the payment.");
  if (["SUBMITTED", "ACCEPTED"].includes(manualSubmissionStatus)) add("EFILE_RECORDED_ELSEWHERE", "This return is already recorded as filed through other software.", "Do not file twice. Clear the manual record only if that filing did not happen.");
  if (pkg) for (const e of pkg.errors) add(`EFILE_${e.kind}_${e.code}`, e.message, e.step ? "Correct the answer on the linked screen." : "Preparer: correct the figures.", { field: e.path || "", step: e.step || stepForLine(e.lineId) || "", lineId: e.lineId || "" });
  return out;
}

// ---- Records -----------------------------------------------------------------------------

const entry = (at, by, event, from, to, detail) => ({ at, by: by || "SYSTEM", event, from: from || null, to, ...(detail ? { detail: String(detail).slice(0, 300) } : {}) });

// A new record for a package. It moves straight through validation and signature checks,
// so it lands on NOT_READY, SIGNATURE_PENDING or READY_TO_TRANSMIT.
export function newRecord({ pkg, returnId, clientId, fingerprint, signaturesComplete, blocking, supersedes = null, by, at = new Date().toISOString(), tenantId }) {
  const history = [];
  let state = "NOT_READY";
  const go = (event, detail) => { const to = transition(state, event); history.push(entry(at, by, event, state, to, detail)); state = to; };
  history.push(entry(at, by, "CREATED", null, state));
  if (pkg.valid && !blocking) {
    go("VALIDATION_PASSED", `${pkg.adapterId}, ${pkg.forms.length} forms`);
    go(signaturesComplete ? "SIGNATURES_COMPLETE" : "SIGNATURES_MISSING");
  }
  return {
    tenantId, key: pkg.key, returnId, clientId, taxYear: pkg.taxYear, jurisdiction: pkg.jurisdiction, fingerprint,
    submissionRef: pkg.submissionRef, adapterId: pkg.adapterId, official: pkg.official, hash: pkg.hash, xml: pkg.xml, forms: pkg.forms,
    validationErrors: pkg.errors.map(({ code, message, path, kind, step, lineId }) => ({ code, message, path: path || "", kind, step: step || stepForLine(lineId) || "", lineId: lineId || "" })),
    state, attempts: 0, receiptId: null, transportId: null, authoritative: false, scenario: null, ack: null,
    supersedes, createdAt: at, updatedAt: at, history,
  };
}

// Applies one event; returns a new record (the input is not changed).
export function applyEvent(record, event, { by, at = new Date().toISOString(), detail, changes = {} } = {}) {
  const to = transition(record.state, event);
  return { ...record, ...changes, state: to, updatedAt: at, history: [...(record.history || []), entry(at, by, event, record.state, to, detail)].slice(-HISTORY_MAX) };
}

// Re-checks signatures and readiness on a record that has not been sent.
export function refreshRecord(record, { signaturesComplete, blocking, by, at }) {
  if (IN_FLIGHT.includes(record.state) || FINAL_STATES.includes(record.state)) return record;
  let next = record;
  const step = (event, detail) => { next = applyEvent(next, event, { by, at, detail }); };
  if (blocking && next.state !== "NOT_READY") step("INVALIDATED", "A readiness check failed.");
  else if (!blocking && next.state === "NOT_READY" && !next.validationErrors.length) step("VALIDATION_PASSED");
  if (["VALIDATED", "SIGNATURE_PENDING", "READY_TO_TRANSMIT"].includes(next.state)) {
    if (signaturesComplete && next.state !== "READY_TO_TRANSMIT") step("SIGNATURES_COMPLETE");
    else if (!signaturesComplete && next.state !== "SIGNATURE_PENDING") step("SIGNATURES_MISSING");
  }
  return next;
}

// What a send attempt produced, as the next record.
export function afterSend(record, result, transport, { by, at }) {
  const changes = { attempts: (record.attempts || 0) + 1, transportId: transport.id, authoritative: Boolean(transport.authoritative) };
  if (result?.outcome === "RECEIPT") {
    const sent = applyEvent(record, "RECEIPT", { by, at, detail: `Receipt ${result.receiptId}${result.duplicate ? " (already received)" : ""}`, changes: { ...changes, receiptId: result.receiptId || null, transmittedAt: at } });
    return applyEvent(sent, "AWAITING_ACK", { by, at });
  }
  if (result?.outcome === "FAILED") return applyEvent(record, "SEND_FAILED", { by, at, detail: result.message, changes });
  return applyEvent(record, "OUTCOME_UNKNOWN", { by, at, detail: result?.message || "No answer: the receiver may or may not have the package.", changes });
}

// An acknowledgement, verified against the record, as the next record. An unverified or
// foreign acknowledgement leaves the record waiting and is logged.
export function afterAck(record, raw, transport, adapter, { by, at }) {
  const ack = parseAcknowledgement(raw, { expected: { submissionRef: record.submissionRef, hash: record.hash }, adapter, authoritative: Boolean(transport.authoritative) });
  if (!ack.verified) return { record: { ...record, updatedAt: at, history: [...record.history, entry(at, by, "ACK_UNVERIFIED", record.state, record.state, ack.reason)].slice(-HISTORY_MAX) }, ack };
  const event = ack.status === "ACCEPTED" ? "ACK_ACCEPTED" : "ACK_REJECTED";
  const next = applyEvent(record, event, { by, at, detail: ack.errors.map((e) => e.code).join(", ") || (transport.authoritative ? "" : "Sandbox acknowledgement"), changes: { ack: { status: ack.status, authoritative: ack.authoritative, receivedAt: ack.receivedAt || at, errors: ack.errors } } });
  return { record: next, ack };
}

// What clients and the queue may see of a record: no XML, no hash, no history detail.
export function recordView(record, { staff = false } = {}) {
  if (!record) return null;
  const view = {
    key: record.key, jurisdiction: record.jurisdiction, taxYear: record.taxYear, state: record.state, stateLabel: EFILE_LABEL[record.state] || record.state,
    sandbox: !record.official, authoritative: Boolean(record.authoritative), submissionRef: record.submissionRef,
    createdAt: record.createdAt, updatedAt: record.updatedAt, transmittedAt: record.transmittedAt || null,
    ack: record.ack ? { status: record.ack.status, authoritative: record.ack.authoritative, receivedAt: record.ack.receivedAt, errors: record.ack.errors.map(({ code, message, step, lineId }) => ({ code, message, step, lineId })) } : null,
  };
  if (!staff) return view;
  return {
    ...view, returnId: record.returnId, adapterId: record.adapterId, forms: record.forms, attempts: record.attempts, receiptId: record.receiptId,
    transportId: record.transportId, scenario: record.scenario, supersedes: record.supersedes, validationErrors: record.validationErrors, hash: record.hash,
    history: (record.history || []).slice(-30),
  };
}

// The status the return itself shows. Only an authoritative acknowledgement moves the
// return to ACCEPTED or REJECTED; a sandbox run never changes the filing status.
export function returnStatusFor(record) {
  if (!record?.authoritative) return null;
  if (record.state === "ACCEPTED") return "ACCEPTED";
  if (record.state === "REJECTED") return "REJECTED";
  if (["TRANSMITTED", "ACK_PENDING", "INDETERMINATE"].includes(record.state)) return "SUBMITTED";
  return null;
}
