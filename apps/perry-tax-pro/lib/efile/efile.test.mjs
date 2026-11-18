import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, EFILE_STATES, EfileError, transition } from "./states.js";
import { buildPackage, idempotencyKey, parseAcknowledgement, renderXml, runBusinessRules, sandboxAdapter, schemaPackageStatus, validateXml, buildReturnData } from "./package.js";
import { afterAck, afterSend, applyEvent, newRecord, readinessIssues, recordView, refreshRecord, returnStatusFor, signatureMatches } from "./submission.js";
import { efileConfig, memoryStore, productionGaps, sandboxTransport, transportFor } from "./transport.js";
import { computeReturn } from "../tax-engine/index.js";
import { sanitizeIntake } from "../intake-schema.js";

const FP = "a".repeat(64);
const intake = sanitizeIntake({
  personal: { firstName: "Ama", lastName: "Doe", dob: "1986-05-02", ssnLast4: "1234", phone: "404", address: "1 Main St", city: "Atlanta", state: "GA", zip: "30301" },
  maritalStatus: "SINGLE", filingStatus: "SINGLE", canBeClaimed: "no", supportsOthers: "no",
  other: { marketplace: "no", digitalAssets: "no", ipPin: "no" },
  forms: [{ id: "w1", type: "W2", issuer: "Acme", wages: "60000", fedWithheld: "7000", state: "GA", stateWithheld: "2500" }],
});
const result = computeReturn(intake, 2026);
// The calculation as the review freezes it.
const calculation = {
  status: result.readiness.calculationStatus,
  federal: { ruleSet: result.federal.ruleSet, forms: result.federal.forms, lines: result.federal.lines },
  states: result.states.filter((s) => s.calculation === "AVAILABLE").map((s) => ({ code: s.code, kind: s.kind, form: s.form, ruleSet: s.ruleSet, lines: s.lines })),
};
const input = (extra = {}) => ({ returnId: "ret1", taxYear: 2026, intake, calculation, fingerprint: FP, ...extra });
const snapshot = { fingerprint: FP, at: "2027-02-01T10:00:00.000Z", calculation };
const opts = { by: "prep1", at: "2027-02-02T10:00:00.000Z" };
const readyRecord = (pkg = buildPackage(input())) => newRecord({ pkg, returnId: "ret1", clientId: "c1", fingerprint: FP, signaturesComplete: true, blocking: false, ...opts, tenantId: "t" });

// ---- States -------------------------------------------------------------------------------

test("the state machine follows the filing path and nothing else", () => {
  let s = "NOT_READY";
  for (const e of ["VALIDATION_PASSED", "SIGNATURES_COMPLETE", "SEND_STARTED", "RECEIPT", "AWAITING_ACK", "ACK_ACCEPTED"]) s = transition(s, e);
  assert.equal(s, "ACCEPTED");
  // A receipt is never an acceptance, and final states are final.
  assert.equal(canTransition("TRANSMITTING", "ACK_ACCEPTED"), false);
  assert.equal(canTransition("TRANSMITTED", "ACK_ACCEPTED"), false);
  for (const e of ["SEND_STARTED", "INVALIDATED", "ACK_REJECTED"]) assert.equal(canTransition("ACCEPTED", e), false);
  for (const e of ["SEND_STARTED", "INVALIDATED"]) assert.equal(canTransition("REJECTED", e), false);
  // An unknown outcome cannot be resent before it is reconciled.
  assert.equal(canTransition("INDETERMINATE", "SEND_STARTED"), false);
  assert.throws(() => transition("INDETERMINATE", "SEND_STARTED"), (e) => e instanceof EfileError && e.status === 409);
  assert.equal(EFILE_STATES.length, 11);
});

// ---- Package ------------------------------------------------------------------------------

test("a valid package is built, validated and keyed deterministically", () => {
  const a = buildPackage(input());
  const b = buildPackage(input());
  assert.equal(a.valid, true, JSON.stringify(a.errors));
  assert.equal(a.official, false);
  assert.match(a.submissionRef, /^SBX-/);
  assert.equal(a.key, b.key, "same answers, same key");
  assert.equal(a.hash, b.hash);
  assert.ok(a.forms.includes("Form 1040"));
  assert.notEqual(buildPackage(input({ fingerprint: "b".repeat(64) })).key, a.key, "new answers, new submission");
  assert.notEqual(idempotencyKey({ returnId: "ret1", taxYear: 2026, jurisdiction: "GA", fingerprint: FP }), a.key);
  assert.throws(() => idempotencyKey({ returnId: "ret1", taxYear: 2026 }), /fingerprint/);
});

test("the Georgia package is separate from the federal one", () => {
  const ga = buildPackage(input({ jurisdiction: "GA" }));
  assert.equal(ga.jurisdiction, "GA");
  assert.equal(ga.valid, true, JSON.stringify(ga.errors));
  assert.notEqual(ga.key, buildPackage(input()).key);
  assert.throws(() => buildPackage(input({ jurisdiction: "AL" })), (e) => e.code === "EFILE_NO_CALCULATION");
});

test("no package without an approved calculation, and no year mismatch", () => {
  assert.throws(() => buildPackage(input({ calculation: null })), (e) => e.code === "EFILE_NO_CALCULATION");
  const data = buildReturnData(input());
  assert.throws(() => renderXml(data, sandboxAdapter(2025)), (e) => e.code === "EFILE_YEAR_MISMATCH");
});

test("schema validation rejects malformed and non-conforming XML", () => {
  const adapter = sandboxAdapter(2026);
  const { xml } = buildPackage(input());
  assert.equal(validateXml(xml, adapter).ok, true);
  const codes = (x) => validateXml(x, adapter).errors.map((e) => e.code);
  assert.deepEqual(codes(xml.replace("</SandboxReturn>", "")), ["XML_MALFORMED"]);
  assert.ok(codes(xml.replace(adapter.namespace, "urn:other")).includes("SCHEMA_NAMESPACE"));
  assert.ok(codes(xml.replace(/<Line_1040_1a>\d+<\/Line_1040_1a>/, "<Line_1040_1a>12.5</Line_1040_1a>")).includes("SCHEMA_TYPE"));
  assert.ok(codes(xml.replace("</Form>", "<Bogus>1</Bogus></Form>")).includes("SCHEMA_UNKNOWN_ELEMENT"));
  assert.ok(codes(xml.replace(/<fingerprint>[^<]*<\/fingerprint>/, "")).includes("SCHEMA_REQUIRED"));
});

test("business rules catch identity gaps and figures that do not add up", () => {
  const data = buildReturnData(input());
  assert.equal(runBusinessRules(data).ok, true, JSON.stringify(runBusinessRules(data).errors));
  const broken = structuredClone(data);
  broken.header.filer.firstName = "";
  broken.header.filer.idLast4 = "12";
  broken.forms.flatMap((f) => f.lines).find((l) => l.id === "1040.9").value += 100;
  const codes = runBusinessRules(broken).errors.map((e) => e.code);
  for (const c of ["IX-ID-001", "IX-ID-002", "IX-MATH-001", "IX-MATH-002"]) assert.ok(codes.includes(c), c);
  // A package with rule errors is not valid and cannot become ready.
  const pkg = buildPackage(input({ intake: { ...intake, personal: { ...intake.personal, lastName: "" } } }));
  assert.equal(pkg.valid, false);
  assert.ok(pkg.errors.some((e) => e.kind === "RULE" && e.code === "IX-ID-001"));
  const rec = newRecord({ pkg, returnId: "ret1", clientId: "c1", fingerprint: FP, signaturesComplete: true, blocking: false, ...opts, tenantId: "t" });
  assert.equal(rec.state, "NOT_READY");
  assert.equal(refreshRecord(rec, { signaturesComplete: true, blocking: false, ...opts }).state, "NOT_READY");
});

test("the official IRS schema package is reported as not installed", () => {
  const s = schemaPackageStatus(2026);
  assert.equal(s.installed, false);
  assert.match(s.note, /e-Services/);
});

// ---- Readiness and signatures ---------------------------------------------------------------

test("Form 8879 counts only for the approved figures", () => {
  const signed = { status: "COMPLETED", fingerprint: FP };
  assert.equal(signatureMatches({ snapshot, signature: signed, signatureStatus: "SIGNED" }), true);
  assert.equal(signatureMatches({ snapshot, signature: { ...signed, fingerprint: "c".repeat(64) }, signatureStatus: "SIGNED" }), false);
  assert.equal(signatureMatches({ snapshot, signature: signed, signatureStatus: "REQUESTED" }), false);
  // In person, or a request older than the fingerprint field: signed after approval.
  assert.equal(signatureMatches({ snapshot, signature: null, signatureStatus: "SIGNED", signedAt: "2027-02-03T00:00:00Z" }), true);
  assert.equal(signatureMatches({ snapshot, signature: null, signatureStatus: "SIGNED", signedAt: "2027-01-03T00:00:00Z" }), false);
  assert.equal(signatureMatches({ snapshot: null, signature: signed, signatureStatus: "SIGNED" }), false);
});

test("readiness lists every reason the return cannot be transmitted", () => {
  const codes = (x) => readinessIssues(x).filter((i) => i.blocking).map((i) => i.code);
  const ok = { reviewStatus: "APPROVED", snapshot, signature: { status: "COMPLETED", fingerprint: FP }, signatureStatus: "SIGNED" };
  assert.deepEqual(codes(ok), []);
  assert.deepEqual(codes({ ...ok, reviewStatus: "IN_PROGRESS" }), ["EFILE_NOT_APPROVED"]);
  assert.ok(codes({ ...ok, changedSinceApproval: true }).includes("EFILE_CHANGED_SINCE_APPROVAL"));
  assert.ok(codes({ ...ok, signatureStatus: "REQUESTED" }).includes("EFILE_8879_MISSING"));
  assert.ok(codes({ ...ok, paymentBlock: "Fee unpaid." }).includes("EFILE_PAYMENT"));
  assert.ok(codes({ ...ok, manualSubmissionStatus: "SUBMITTED" }).includes("EFILE_RECORDED_ELSEWHERE"));
  assert.ok(codes({ ...ok, filingBlockers: [{ code: "FED_HOH_NO_QUALIFYING_PERSON", message: "x", step: "filing-status" }] }).includes("EFILE_BLOCKER_FED_HOH_NO_QUALIFYING_PERSON"));
  // Figures from rules below FILING_READY: reported in the sandbox, blocking in production.
  assert.notEqual(calculation.status, "FILING_READY");
  const calc = readinessIssues(ok).find((i) => i.code === "EFILE_CALCULATION_NOT_FILING_READY");
  assert.equal(calc.blocking, false);
  assert.ok(codes({ ...ok, production: true }).includes("EFILE_CALCULATION_NOT_FILING_READY"));
});

test("records follow signatures and readiness until they are sent", () => {
  const pkg = buildPackage(input());
  const waiting = newRecord({ pkg, returnId: "ret1", clientId: "c1", fingerprint: FP, signaturesComplete: false, blocking: false, ...opts, tenantId: "t" });
  assert.equal(waiting.state, "SIGNATURE_PENDING");
  const ready = refreshRecord(waiting, { signaturesComplete: true, blocking: false, ...opts });
  assert.equal(ready.state, "READY_TO_TRANSMIT");
  // A signature withdrawn, or a readiness item reopened, takes it back.
  assert.equal(refreshRecord(ready, { signaturesComplete: false, blocking: false, ...opts }).state, "SIGNATURE_PENDING");
  const blocked = refreshRecord(ready, { signaturesComplete: true, blocking: true, ...opts });
  assert.equal(blocked.state, "NOT_READY");
  assert.equal(refreshRecord(blocked, { signaturesComplete: true, blocking: false, ...opts }).state, "READY_TO_TRANSMIT");
  assert.ok(ready.history.length > waiting.history.length);
  assert.equal(waiting.state, "SIGNATURE_PENDING", "inputs are not changed");
});

// ---- Transmission ---------------------------------------------------------------------------

async function send(record, transport) {
  const sending = applyEvent(record, "SEND_STARTED", opts);
  const res = await transport.send({ submissionRef: record.submissionRef, hash: record.hash, valid: !record.validationErrors.length, errors: record.validationErrors });
  return afterSend(sending, res, transport, opts);
}

test("sandbox acceptance: verified, but never an IRS acceptance", async () => {
  const transport = sandboxTransport({ store: memoryStore() });
  const sent = await send(readyRecord(), transport);
  assert.equal(sent.state, "ACK_PENDING");
  assert.match(sent.receiptId, /^SBXR-/);
  assert.equal(returnStatusFor(sent), null, "a sandbox receipt does not mark the return filed");
  const raw = await transport.fetchAck({ submissionRef: sent.submissionRef });
  const { record, ack } = afterAck(sent, raw, transport, sandboxAdapter(2026), opts);
  assert.equal(ack.verified, true);
  assert.equal(ack.authoritative, false);
  assert.equal(record.state, "ACCEPTED");
  assert.equal(returnStatusFor(record), null, "a sandbox acceptance does not change the filing status");
  assert.equal(recordView(record).sandbox, true);
  assert.equal(recordView(record).xml, undefined, "clients never see the package");
});

test("a rejection maps each error to the field and screen that fix it", async () => {
  const transport = sandboxTransport({ scenario: "REJECT", store: memoryStore() });
  const sent = await send(readyRecord(), transport);
  const { record } = afterAck(sent, await transport.fetchAck({ submissionRef: sent.submissionRef }), transport, sandboxAdapter(2026), opts);
  assert.equal(record.state, "REJECTED");
  assert.equal(record.ack.errors[0].lineId, "1040.1a");
  assert.equal(record.ack.errors[0].step, "forms-W2");
  // A rejected submission is final; the correction is a new package with a new key.
  assert.equal(canTransition(record.state, "SEND_STARTED"), false);
  const corrected = buildPackage(input({ fingerprint: "d".repeat(64) }));
  assert.notEqual(corrected.key, record.key);
  const next = newRecord({ pkg: corrected, returnId: "ret1", clientId: "c1", fingerprint: "d".repeat(64), signaturesComplete: true, blocking: false, supersedes: record.key, ...opts, tenantId: "t" });
  assert.equal(next.supersedes, record.key);
  assert.equal(next.state, "READY_TO_TRANSMIT");
});

test("a network failure can be retried; a timeout must be reconciled first", async () => {
  const store = memoryStore();
  const failed = await send(readyRecord(), sandboxTransport({ scenario: "NETWORK_ERROR", store }));
  assert.equal(failed.state, "FAILED_RETRYABLE");
  assert.equal(failed.attempts, 1);
  const retried = await send(failed, sandboxTransport({ store }));
  assert.equal(retried.state, "ACK_PENDING");
  assert.equal(retried.attempts, 2);

  const store2 = memoryStore();
  const unknown = await send(readyRecord(), sandboxTransport({ scenario: "TIMEOUT", store: store2 }));
  assert.equal(unknown.state, "INDETERMINATE");
  assert.throws(() => applyEvent(unknown, "SEND_STARTED", opts), /cannot take the step/);
  // The receiver did get it: reconcile to waiting for the acknowledgement, never resend.
  const found = await sandboxTransport({ store: store2 }).lookup({ submissionRef: unknown.submissionRef });
  assert.equal(found, "RECEIVED");
  assert.equal(applyEvent(unknown, "RECONCILED_RECEIVED", opts).state, "ACK_PENDING");
  // Not received: it may be sent again.
  assert.equal(await sandboxTransport({ store: memoryStore() }).lookup({ submissionRef: unknown.submissionRef }), "NOT_RECEIVED");
  assert.equal(applyEvent(unknown, "RECONCILED_NOT_RECEIVED", opts).state, "FAILED_RETRYABLE");
});

test("the receiver never takes the same submission twice", async () => {
  const store = memoryStore();
  const t = sandboxTransport({ store });
  const pkg = buildPackage(input());
  const first = await t.send(pkg);
  const second = await t.send(pkg);
  assert.equal(second.duplicate, true);
  assert.equal(second.receiptId, first.receiptId);
});

test("a delayed acknowledgement leaves the submission waiting", async () => {
  const transport = sandboxTransport({ scenario: "ACK_DELAYED", store: memoryStore() });
  const sent = await send(readyRecord(), transport);
  assert.equal(await transport.fetchAck({ submissionRef: sent.submissionRef }), null);
  assert.ok(await transport.fetchAck({ submissionRef: sent.submissionRef }));
});

test("foreign, tampered or empty acknowledgements establish nothing", async () => {
  const transport = sandboxTransport({ store: memoryStore() });
  const sent = await send(readyRecord(), transport);
  const adapter = sandboxAdapter(2026);
  const good = await transport.fetchAck({ submissionRef: sent.submissionRef });
  const check = (raw) => afterAck(sent, raw, transport, adapter, opts);
  for (const raw of [good.replace(sent.submissionRef, "SBX-other"), good.replace(sent.hash, "f".repeat(64)), "<Acknowledgement", good.replace('status="Accepted"', 'status="Maybe"'), "HTTP 200 OK"]) {
    const { record, ack } = check(raw);
    assert.equal(ack.verified, false, raw.slice(0, 40));
    assert.equal(record.state, "ACK_PENDING");
    assert.equal(record.history.at(-1).event, "ACK_UNVERIFIED");
  }
  const noErrors = parseAcknowledgement(`<Acknowledgement submissionRef="${sent.submissionRef}" status="Rejected"></Acknowledgement>`, { expected: sent, adapter });
  assert.equal(noErrors.verified, false);
});

test("only an authoritative acknowledgement moves the return's filing status", async () => {
  const store = memoryStore();
  const real = { ...sandboxTransport({ store }), id: "TEST-AUTHORITATIVE", authoritative: true };
  const sent = await send(readyRecord(), real);
  assert.equal(returnStatusFor(sent), "SUBMITTED");
  const { record } = afterAck(sent, await real.fetchAck({ submissionRef: sent.submissionRef }), real, sandboxAdapter(2026), opts);
  assert.equal(returnStatusFor(record), "ACCEPTED");
});

// ---- Authorization ---------------------------------------------------------------------------

test("production transmission is refused until it really exists and is authorized", () => {
  assert.equal(efileConfig({}).mode, "off");
  assert.throws(() => transportFor({ config: efileConfig({}) }), (e) => e.code === "EFILE_OFF");
  assert.equal(transportFor({ config: efileConfig({ EFILE_MODE: "sandbox" }) }).authoritative, false);
  // Every switch on: still no IRS transport installed, so still refused.
  const all = efileConfig({ EFILE_MODE: "production", EFILE_PRODUCTION_AUTHORIZED: "true", MEF_ETIN: "x", MEF_EFIN: "x", MEF_A2A_CERT_SECRET: "x" });
  assert.throws(() => transportFor({ config: all }), (e) => e.code === "EFILE_NOT_AUTHORIZED" && e.status === 403);
  assert.deepEqual(productionGaps(all).length, 1);
  assert.match(productionGaps(all, "GA")[0], /own approval/);
  // An EFIN alone is far from enough.
  assert.ok(productionGaps(efileConfig({ EFILE_MODE: "production", MEF_EFIN: "x" })).length >= 4);
  assert.deepEqual(efileConfig({ EFILE_TRANSMITTER_UIDS: " a, b ,," }).transmitters, ["a", "b"]);
});
