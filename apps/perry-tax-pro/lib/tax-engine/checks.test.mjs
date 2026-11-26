import { test } from "node:test";
import assert from "node:assert/strict";
import { doubleCheck, filingBlockers, LAYERS } from "./checks.js";
import { computeReturn, estimateFromReturn } from "./index.js";
import { reconcileDocuments } from "../document-reconcile.js";
import { cleanReading, readingSchema } from "../document-reading-shared.js";
import { sanitizeIntake } from "../intake-schema.js";
import { LEVELS } from "../intake-checks.js";

const base = (extra = {}) => sanitizeIntake({
  personal: { firstName: "Ama", lastName: "Doe", dob: "1986-05-02", ssnLast4: "1234", phone: "404", address: "1 Main St", city: "Atlanta", state: "GA", zip: "30301" },
  maritalStatus: "SINGLE", filingStatus: "SINGLE", canBeClaimed: "no", supportsOthers: "no",
  other: { marketplace: "no", digitalAssets: "no", ipPin: "no" },
  forms: [{ id: "w1", type: "W2", issuer: "Acme", wages: "60000", fedWithheld: "7000", state: "GA", stateWithheld: "2500", documentId: "d1" }],
  ...extra,
});
const check = (intake, opts = {}) => {
  const result = computeReturn(intake, 2026, opts.supplement);
  return doubleCheck(intake, { result, estimate: estimateFromReturn(result), taxYear: 2026, ...opts });
};
const codes = (issues) => issues.map((i) => i.code);

test("every issue carries the full Double-Check shape", () => {
  const issues = check(base({ filingStatus: "HOH", forms: [{ id: "k", type: "K1", issuer: "LLC", amount: "5000" }, { id: "r", type: "1099R", gross: "8000", taxable: "8000", code: "1" }] }), { documents: [] });
  assert.ok(issues.length > 4);
  assert.equal(new Set(codes(issues)).size, issues.length, "codes are unique");
  for (const i of issues) {
    assert.match(i.code, /^[A-Z0-9_]+$/i, i.code);
    assert.ok(LEVELS.includes(i.level), i.code);
    assert.ok(LAYERS[i.layer] && i.layerLabel === LAYERS[i.layer], i.code);
    assert.ok(i.message && i.why, i.code);
    for (const k of ["form", "field", "source", "action", "link"]) assert.equal(typeof i[k], "string", `${i.code}.${k}`);
    assert.equal(typeof i.blocksFiling, "boolean", i.code);
    if (i.step) assert.equal(i.link, `/portal/intake?step=${encodeURIComponent(i.step)}`);
  }
  // Sorted by severity first.
  const order = issues.map((i) => LEVELS.indexOf(i.level));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("federal rules layer flags what blocks filing", () => {
  const issues = check(base({ filingStatus: "HOH", forms: [{ id: "k", type: "K1", issuer: "LLC", amount: "5000" }, { id: "r", type: "1099R", gross: "8000", taxable: "8000", code: "1" }] }));
  const by = Object.fromEntries(issues.map((i) => [i.code, i]));
  assert.equal(by.FED_K1_REVIEW.blocksFiling, true);
  assert.equal(by.FED_K1_REVIEW.layer, 2);
  assert.equal(by.FED_HOH_NO_QUALIFYING_PERSON.blocksFiling, true);
  assert.equal(by.FED_EARLY_DISTRIBUTION.level, "WARNING");
  assert.ok(by.PREPARER_DUE_DILIGENCE_8867, "head of household needs Form 8867");
  // Resolving a filing blocker clears it from the blocker list; ignoring it does not.
  const blockers = filingBlockers(issues);
  assert.ok(blockers.length >= 2);
  assert.equal(filingBlockers(issues, { FED_K1_REVIEW: { status: "IGNORED" } }).length, blockers.length);
  assert.equal(filingBlockers(issues, { FED_K1_REVIEW: { status: "RESOLVED" } }).length, blockers.length - 1);
});

test("a simple return raises no federal or state alert", () => {
  const issues = check(base());
  assert.deepEqual(issues.filter((i) => ["BLOCKER", "ALERT"].includes(i.level)).map((i) => i.code), []);
  assert.deepEqual(filingBlockers(issues), []);
});

test("state layer: a state without an engine blocks filing, Georgia is calculated", () => {
  const issues = check(base({ forms: [{ id: "a", type: "W2", wages: "60000", state: "GA" }, { id: "b", type: "W2", wages: "20000", state: "AL", stateWithheld: "500" }] }));
  const by = Object.fromEntries(issues.map((i) => [i.code, i]));
  assert.equal(by.STATE_NO_ENGINE_AL.layer, 3);
  assert.equal(by.STATE_NO_ENGINE_AL.blocksFiling, true);
  assert.ok(!by.STATE_NO_ENGINE_GA && !by.STATE_PENDING_GA && !by.STATE_PENDING_AL);
  assert.ok(by.GA_OTHER_STATE_CREDIT, "another state withheld tax and no credit is claimed");
  assert.ok(!check(base({ forms: [{ id: "a", type: "W2", wages: "60000", state: "GA" }, { id: "b", type: "W2", wages: "20000", state: "AL", stateWithheld: "500" }] }), { supplement: { otherStateTaxPaid: "400", otherStateIncome: "20000" } }).some((i) => i.code === "GA_OTHER_STATE_CREDIT"));
  assert.ok(check(base({ forms: [{ id: "a", type: "W2", wages: "60000", state: "GA" }] })).some((i) => i.code === "GA_NO_WITHHOLDING"));
});

test("premium tax credit and unusual amounts", () => {
  const noForm = check(base({ other: { marketplace: "yes", digitalAssets: "no", ipPin: "no" } }));
  assert.ok(noForm.some((i) => i.code === "FED_8962_MISSING_1095A" && i.blocksFiling));
  const repay = check(base({ other: { marketplace: "yes", digitalAssets: "no", ipPin: "no" }, forms: [{ id: "w1", type: "W2", wages: "70000", fedWithheld: "9000", state: "GA", stateWithheld: "2500" }, { id: "m", type: "1095A", premium: "5500", slcsp: "6000", aptc: "4500" }] }));
  assert.ok(repay.some((i) => i.code === "FED_APTC_REPAYMENT"));
  const gifts = check(base({ deductions: { charity: "20000" } }));
  assert.ok(gifts.some((i) => i.code === "UNUSUAL_CHARITY" && i.layer === 5));
  assert.ok(check(base({ forms: [{ id: "w1", type: "W2", wages: "60000", state: "GA", stateWithheld: "2500" }] })).some((i) => i.code === "UNUSUAL_NO_WITHHOLDING"));
});

test("e-file findings join the list as layer 4", () => {
  const issues = check(base(), { efile: [{ code: "EFILE_SIGNATURE_MISSING", message: "Form 8879 is not signed.", blocking: true, action: "Request the signature." }] });
  const e = issues.find((i) => i.code === "EFILE_SIGNATURE_MISSING");
  assert.equal(e.layer, 4);
  assert.equal(e.blocksFiling, true);
  assert.equal(e.level, "ALERT");
});

// ---- Documents -----------------------------------------------------------------------------

const doc = (id, type, extra = {}) => ({ id, type, filename: `${id}.pdf`, size: 1000 + id.length, ...extra });

test("document reconciliation reports differences and never changes an answer", () => {
  const intake = base({ forms: [
    { id: "w1", type: "W2", issuer: "Acme", wages: "60000", fedWithheld: "7000", state: "GA", documentId: "d1" },
    { id: "w2", type: "W2", issuer: "ACME", wages: "60000", fedWithheld: "7000", state: "GA" },
    { id: "i1", type: "1099INT", issuer: "Bank", interest: "300", documentId: "d2" },
  ] });
  const before = JSON.stringify(intake);
  const documents = [
    doc("d1", "W2", { reading: { formType: "W2", taxYear: "2026", confidence: "high", values: { wages: "61000", fedWithheld: "7000", stateWithheld: "" } } }),
    doc("d2", "1099INT", { reading: { formType: "1099INT", taxYear: "2025", confidence: "low", values: { interest: "300" } } }),
    doc("d3", "1099DIV"),
    doc("d4", "ID"),
  ];
  const found = codes(reconcileDocuments(intake, documents, { taxYear: 2026 }));
  assert.ok(found.includes("FORM_DUPLICATE_w2"), "same employer and amount twice");
  assert.ok(found.includes("DOCUMENT_MISMATCH_w1_wages"), "document reads another amount");
  assert.ok(!found.includes("DOCUMENT_MISMATCH_w1_fedWithheld"));
  assert.ok(!found.includes("DOCUMENT_MISMATCH_w1_stateWithheld"), "a blank box in the reading is not a mismatch");
  assert.ok(found.includes("DOCUMENT_WRONG_YEAR_i1"));
  assert.ok(found.includes("DOCUMENT_LOW_CONFIDENCE_i1"));
  assert.ok(found.includes("FORM_NO_DOCUMENT_w2"));
  assert.ok(found.includes("DOCUMENT_NOT_ENTERED_d3"), "an uploaded tax form nobody entered");
  assert.ok(!found.includes("DOCUMENT_NOT_ENTERED_d4"), "identity documents are not tax forms");
  assert.equal(JSON.stringify(intake), before, "answers are never modified");
  // A document read as another form than the entry it is linked to.
  const wrong = reconcileDocuments(base(), [doc("d1", "W2", { reading: { formType: "1099NEC", values: { compensation: "5" } } })]);
  assert.deepEqual(codes(wrong), ["DOCUMENT_WRONG_FORM_w1"]);
  // The same file uploaded twice.
  assert.ok(codes(reconcileDocuments(base(), [doc("d1", "W2"), { ...doc("d9", "W2"), filename: "d1.pdf", size: 1002 }])).includes("DOCUMENT_DUPLICATE_d9"));
});

test("the reader reports the form year and how legible the document was", () => {
  const schema = readingSchema("W2");
  assert.ok(schema.properties.taxYear && schema.properties.confidence);
  assert.deepEqual(schema.properties.confidence.enum, ["high", "medium", "low"]);
  assert.ok(schema.properties.ssWages && schema.properties.tips, "the extra W-2 boxes are read too");
  const r = cleanReading("W2", { isThisForm: true, wages: "50,000.00", fedWithheld: "5000", taxYear: "2026", confidence: "medium", ssWages: "50000" });
  assert.equal(r.taxYear, "2026");
  assert.equal(r.confidence, "medium");
  assert.equal(r.values.ssWages, "50000");
  assert.equal(cleanReading("W2", { taxYear: "26", confidence: "certain" }).taxYear, "");
  assert.equal(cleanReading("W2", { taxYear: "26", confidence: "certain" }).confidence, "");
});
