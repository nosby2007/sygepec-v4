import { test } from "node:test";
import assert from "node:assert/strict";
import { bracketTax, computeEstimate, intakeToEstimate, standardDeduction, buildChecklist, marginalRate } from "./tax.js";
import { federalRules } from "./tax-rules.js";
import { sanitizeIntake, incomeTotals, withLegacyTotals, carryForward, ageAtYearEnd, ATTESTATION_VERSION } from "./intake-schema.js";
import { buildSteps, progressFor, formTypesNeeded } from "./intake-flow.js";
import { runDiagnostics, blockers, openIssues, stateFilings, compareYears } from "./intake-checks.js";

const R = federalRules(2026);

// ---- Rule set (Rev. Proc. 2025-32) -------------------------------------------------------

test("2026 rule set names its source and status", () => {
  assert.equal(R.id, "US-FED-2026");
  assert.equal(R.status, "ESTIMATE");
  assert.match(R.sources[0].url, /rp-25-32\.pdf$/);
  assert.equal(federalRules(2019), null);
});

test("bracket tax matches the Rev. Proc. 2025-32 tables at every boundary", () => {
  // Single (Table 3)
  assert.equal(bracketTax(12400, "SINGLE"), 1240);
  assert.equal(bracketTax(50400, "SINGLE"), 5800);
  assert.equal(bracketTax(105700, "SINGLE"), 17966);
  assert.equal(bracketTax(201775, "SINGLE"), 41024);
  assert.equal(bracketTax(256225, "SINGLE"), 58448);
  assert.equal(bracketTax(640600, "SINGLE"), 192979.25);
  // Married filing jointly (Table 1)
  assert.equal(bracketTax(24800, "MFJ"), 2480);
  assert.equal(bracketTax(100800, "MFJ"), 11600);
  assert.equal(bracketTax(211400, "MFJ"), 35932);
  assert.equal(bracketTax(403550, "MFJ"), 82048);
  assert.equal(bracketTax(512450, "MFJ"), 116896);
  assert.equal(bracketTax(768700, "MFJ"), 206583.5);
  // Head of household (Table 2)
  assert.equal(bracketTax(17700, "HOH"), 1770);
  assert.equal(bracketTax(67450, "HOH"), 7740);
  assert.equal(bracketTax(105700, "HOH"), 16155);
  assert.equal(bracketTax(201750, "HOH"), 39207);
  assert.equal(bracketTax(256200, "HOH"), 56631);
  assert.equal(bracketTax(640600, "HOH"), 191171);
  // Married filing separately (Table 4) differs from single only at the top
  assert.equal(bracketTax(384350, "MFS"), 103291.75);
  // Surviving spouse uses the joint table
  assert.equal(bracketTax(100800, "QSS"), 11600);
});

test("zero, negative and one dollar above a boundary", () => {
  assert.equal(bracketTax(0, "SINGLE"), 0);
  assert.equal(bracketTax(-500, "SINGLE"), 0);
  assert.equal(bracketTax(12401, "SINGLE"), 1240.12);
  assert.equal(marginalRate(12400, "SINGLE"), 0.1);
  assert.equal(marginalRate(12401, "SINGLE"), 0.12);
  assert.equal(marginalRate(1e9, "MFJ"), 0.37);
});

test("standard deduction, dependent limit and age or blindness additions", () => {
  assert.equal(standardDeduction({ filingStatus: "SINGLE" }), 16100);
  assert.equal(standardDeduction({ filingStatus: "MFJ" }), 32200);
  assert.equal(standardDeduction({ filingStatus: "HOH" }), 24150);
  assert.equal(standardDeduction({ filingStatus: "MFS" }), 16100);
  assert.equal(standardDeduction({ filingStatus: "QSS" }), 32200);
  // Sec. 4.14(2): greater of $1,350 or earned income + $450, capped at the regular amount
  assert.equal(standardDeduction({ filingStatus: "SINGLE", canBeClaimed: true, earned: 0 }), 1350);
  assert.equal(standardDeduction({ filingStatus: "SINGLE", canBeClaimed: true, earned: 5000 }), 5450);
  assert.equal(standardDeduction({ filingStatus: "SINGLE", canBeClaimed: true, earned: 40000 }), 16100);
  // Sec. 4.14(3): $2,050 unmarried, $1,650 married, per condition
  assert.equal(standardDeduction({ filingStatus: "SINGLE", age65: 1, blind: 1 }), 16100 + 4100);
  assert.equal(standardDeduction({ filingStatus: "MFJ", age65: 2 }), 32200 + 3300);
});

test("child tax credit: amounts, refundable cap and phase-out", () => {
  const two = computeEstimate({ filingStatus: "MFJ", wages: 80000, childrenUnder17: 2 });
  assert.equal(two.nonRefundableCredits, 4400);
  assert.equal(two.refundableCredits, 0);
  // Low income: refundable part limited to 15% of earned income above $2,500, max $1,700 each
  const low = computeEstimate({ filingStatus: "HOH", wages: 20000, childrenUnder17: 1 });
  assert.equal(low.incomeTax, 0);
  assert.equal(low.refundableCredits, 1700);
  const lower = computeEstimate({ filingStatus: "HOH", wages: 10000, childrenUnder17: 1 });
  assert.equal(lower.refundableCredits, 1125);
  // $50 per $1,000 or part over $200,000
  const high = computeEstimate({ filingStatus: "SINGLE", wages: 216100 + 1, childrenUnder17: 1 });
  assert.equal(high.agi, 216101);
  assert.equal(high.nonRefundableCredits, 2200 - 17 * 50);
});

test("self-employment tax, its half deduction and the $400 floor", () => {
  const se = computeEstimate({ filingStatus: "SINGLE", selfEmployment: 50000 });
  assert.equal(se.seTax, 7064.78);
  assert.equal(se.adjustments, 3532.39);
  assert.equal(computeEstimate({ filingStatus: "SINGLE", selfEmployment: 400 }).seTax, 0);
  assert.ok(computeEstimate({ filingStatus: "SINGLE", selfEmployment: 434 }).seTax > 0);
});

test("student loan interest: $2,500 cap and income phase-out", () => {
  assert.equal(computeEstimate({ filingStatus: "SINGLE", wages: 50000, studentLoan: 4000 }).studentLoan, 2500);
  assert.equal(computeEstimate({ filingStatus: "SINGLE", wages: 92500, studentLoan: 2500 }).studentLoan, 1250);
  assert.equal(computeEstimate({ filingStatus: "SINGLE", wages: 100000, studentLoan: 2500 }).studentLoan, 0);
  assert.equal(computeEstimate({ filingStatus: "MFS", wages: 40000, studentLoan: 2500 }).studentLoan, 0);
  assert.equal(computeEstimate({ filingStatus: "MFJ", wages: 175000, studentLoan: 2500 }).studentLoan, 2500);
});

test("itemized versus standard, medical floor and an explicit choice", () => {
  const auto = computeEstimate({ filingStatus: "SINGLE", wages: 100000, mortgageInterest: 12000, salt: 8000 });
  assert.equal(auto.deductionType, "Itemized");
  assert.equal(auto.deduction, 20000);
  const medical = computeEstimate({ filingStatus: "SINGLE", wages: 40000, medical: 5000, itemized: undefined });
  assert.equal(medical.itemizedDeduction, 2000);
  const forced = computeEstimate({ filingStatus: "SINGLE", wages: 100000, mortgageInterest: 12000, salt: 8000, deductionChoice: "standard" });
  assert.equal(forced.deduction, 16100);
});

test("every estimate exposes the full breakdown and its rule set", () => {
  const e = computeEstimate({ filingStatus: "SINGLE", wages: 60000, withheld: 7000 });
  for (const k of ["income", "adjustments", "agi", "deduction", "taxable", "incomeTax", "nonRefundableCredits", "refundableCredits", "totalTax", "withholding", "payments", "refund", "ruleSet", "notComputed"]) assert.ok(k in e, k);
  assert.equal(e.taxable, 43900);
  assert.equal(e.incomeTax, 1240 + (43900 - 12400) * 0.12);
  assert.equal(e.refund, 7000 - e.totalTax);
  assert.equal(e.ruleSet.id, "US-FED-2026");
});

// ---- Schema ----------------------------------------------------------------------------

test("sanitizing drops unknown and sensitive fields and keeps structured forms", () => {
  const clean = sanitizeIntake({
    personal: { firstName: " Ana\u0007 ", ssn: "123-45-6789", ssnLast4: "123-45-6789", state: "tx" },
    ipPinValue: "123456",
    forms: [{ type: "W2", issuer: "Acme", wages: "52,000.50", fedWithheld: "abc", state: "TX", routing: "x" }, { type: "BOGUS" }],
    topics: { income: ["W2", "HACK"] },
    filingStatus: "WHATEVER",
  });
  assert.equal(clean.schemaVersion, 2);
  assert.equal(clean.personal.firstName, "Ana");
  assert.equal(clean.personal.ssnLast4, "6789");
  assert.equal(clean.personal.state, "TX");
  assert.equal("ssn" in clean.personal, false);
  assert.equal("ipPinValue" in clean, false);
  assert.equal(clean.forms.length, 1);
  assert.equal(clean.forms[0].wages, "52000.50");
  assert.equal(clean.forms[0].fedWithheld, "");
  assert.equal("routing" in clean.forms[0], false);
  assert.deepEqual(clean.topics.income, ["W2"]);
  assert.equal(clean.filingStatus, "");
});

test("several forms of the same type never collide", () => {
  const clean = sanitizeIntake({ forms: [{ id: "a1", type: "W2", wages: "1000" }, { id: "a1", type: "W2", wages: "2000" }, { type: "W2", wages: "3000" }] });
  assert.equal(new Set(clean.forms.map((f) => f.id)).size, 3);
  assert.equal(incomeTotals(clean).wages, 6000);
});

test("version 1 answers stay readable and keep their totals", () => {
  const v1 = { personal: { firstName: "Old" }, filingStatus: "SINGLE", income: { w2Wages: "40000", w2Withheld: "3000" }, deductions: { charity: "500" }, submitted: true };
  const clean = sanitizeIntake(v1);
  assert.equal(clean.income.w2Wages, "40000");
  assert.equal(clean.submitted, true);
  const t = incomeTotals(clean);
  assert.equal(t.structured, false);
  assert.equal(t.wages, 40000);
  assert.equal(intakeToEstimate(v1).agi, 40000);
  assert.deepEqual(buildChecklist(v1), ["ID", "SSN", "W2", "CHARITY", "PRIOR"]);
});

test("structured forms rewrite the version 1 totals", () => {
  const intake = withLegacyTotals(sanitizeIntake({
    forms: [
      { type: "W2", wages: "50000", fedWithheld: "5000" },
      { type: "1099NEC", compensation: "12000", expenses: "2000", fedWithheld: "0" },
      { type: "1099K", gross: "800", costs: "1000", personal: true },
      { type: "1099B", proceeds: "5000", basis: "3000" },
    ],
    income: { w2Wages: "999999" },
  }));
  assert.equal(intake.income.w2Wages, "50000");
  assert.equal(intake.income.selfEmployment, "10000");
  assert.equal(intake.income.w2Withheld, "5000");
  assert.equal(intake.income.other, "2000");
});

test("age on December 31 follows the IRS January 1 rule", () => {
  assert.equal(ageAtYearEnd("1961-06-30", 2026), 65);
  assert.equal(ageAtYearEnd("1962-01-01", 2026), 65);
  assert.equal(ageAtYearEnd("1962-01-02", 2026), 64);
  assert.equal(ageAtYearEnd("", 2026), null);
});

test("a new year carries identity forward but never amounts", () => {
  const next = carryForward({ personal: { firstName: "Ana", state: "TX" }, filingStatus: "HOH", dependents: [{ name: "Leo", age: "7" }], forms: [{ type: "W2", wages: "50000" }], income: { w2Wages: "50000" }, deductions: { charity: "900" }, submitted: true, topics: { income: ["W2"] } });
  assert.equal(next.personal.firstName, "Ana");
  assert.equal(next.dependents[0].age, "8");
  assert.equal(next.forms.length, 0);
  assert.equal(next.income.w2Wages, "");
  assert.equal(next.deductions.charity, "");
  assert.deepEqual(next.topics.income, []);
  assert.equal(next.submitted, false);
});

// ---- Steps -----------------------------------------------------------------------------

test("screens follow the answers and keep stable ids", () => {
  const base = buildSteps({});
  assert.equal(base[0].id, "welcome");
  assert.ok(!base.some((s) => s.id === "spouse"));
  assert.ok(!base.some((s) => s.id === "compare"));
  const rich = buildSteps({ maritalStatus: "MARRIED", supportsOthers: "yes", topics: { income: ["W2", "SELF_EMPLOYED"], expenses: ["HOME", "EDUCATION"] }, other: { marketplace: "yes" } }, { hasPrior: true });
  const ids = rich.map((s) => s.id);
  for (const id of ["spouse", "dependents", "forms-W2", "forms-1099NEC", "forms-1098", "forms-1098E", "forms-1098T", "forms-1095A", "expense-amounts", "compare"]) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.indexOf("forms-W2") < ids.indexOf("income-summary"));
  const p = progressFor(rich, "forms-W2");
  assert.equal(p.section, "income");
  assert.ok(p.overall > 0 && p.overall < 1);
});

test("an entered form keeps its screen even if the topic is unticked", () => {
  assert.deepEqual(formTypesNeeded({ topics: { income: [] }, forms: [{ type: "1099INT" }] }), ["1099INT"]);
});

// ---- Double-check ----------------------------------------------------------------------

const complete = () => sanitizeIntake({
  personal: { firstName: "Ana", lastName: "Diaz", dob: "1990-04-02", ssnLast4: "1234", phone: "555", address: "1 Main", zip: "75001", state: "TX" },
  maritalStatus: "SINGLE", filingStatus: "SINGLE", canBeClaimed: "no", supportsOthers: "no",
  topics: { income: ["W2"] },
  forms: [{ type: "W2", issuer: "Acme", wages: "50000", fedWithheld: "5000", state: "TX" }],
  other: { marketplace: "no", digitalAssets: "no", ipPin: "no", presidentialFund: "no" },
});

test("a complete return has no blockers or alerts", () => {
  const issues = runDiagnostics(complete());
  assert.deepEqual(blockers(issues), []);
  assert.deepEqual(issues.filter((i) => i.level === "ALERT"), []);
});

test("empty answers raise blockers that point at the screen to fix", () => {
  const issues = runDiagnostics(sanitizeIntake({}));
  const codes = blockers(issues).map((i) => i.code);
  assert.deepEqual(codes.sort(), ["FILING_STATUS_MISSING", "IDENTITY_INCOMPLETE", "MARITAL_MISSING", "RESIDENCE_STATE_MISSING"]);
  for (const i of issues) assert.ok(i.step && i.why && i.message, i.code);
});

test("inconsistent answers are caught", () => {
  const i = complete();
  i.filingStatus = "HOH";
  i.supportsOthers = "yes";
  i.topics.income.push("SELF_EMPLOYED");
  i.forms[0].fedWithheld = "60000";
  i.forms.push({ id: "x", type: "1099NEC", issuer: "Gig", compensation: "100", stateWithheld: "5", state: "" });
  i.residence.moved = true;
  i.other.marketplace = "yes";
  i.other.digitalAssets = "";
  const codes = runDiagnostics(i).map((x) => x.code);
  for (const c of ["HOH_WITHOUT_DEPENDENT", "DEPENDENTS_EMPTY", "WITHHOLDING_EXCEEDS_" + i.forms[0].id, "STATE_MISSING_x", "MOVE_WITHOUT_PRIOR_STATE", "MARKETPLACE_NO_1095A", "DIGITAL_ASSETS_UNANSWERED"]) assert.ok(codes.includes(c), c);
  const j = complete();
  j.topics.income.push("RETIREMENT");
  assert.ok(runDiagnostics(j).some((x) => x.code === "FORM_MISSING_1099R"));
});

test("warnings can be set aside, blockers cannot", () => {
  const issues = [{ level: "BLOCKER", code: "A" }, { level: "WARNING", code: "B" }, { level: "INFO", code: "C" }];
  assert.deepEqual(openIssues(issues, ["A", "B"]).map((i) => i.code), ["A", "C"]);
});

test("state list names each possible return and never invents an amount", () => {
  const i = complete();
  i.residence.moved = true;
  i.residence.priorState = "OK";
  i.forms.push({ id: "y", type: "W2", issuer: "Remote Co", wages: "1000", stateWithheld: "40", state: "NY" });
  const states = stateFilings(i);
  assert.deepEqual(states.map((s) => [s.code, s.kind]), [["TX", "PART_YEAR"], ["OK", "PART_YEAR"], ["NY", "NONRESIDENT"]]);
  assert.ok(states.every((s) => s.calculation === "PENDING_RULES" && s.ruleSetId === null));
  assert.equal(states.find((s) => s.code === "NY").withheld, 40);
});

test("prior-year comparison flags large changes only", () => {
  const prior = complete();
  const current = complete();
  current.forms[0].wages = "52000";
  let cmp = compareYears(current, prior);
  assert.equal(cmp.rows.find((r) => r.key === "WAGES").flag, false);
  current.forms[0].wages = "90000";
  current.filingStatus = "HOH";
  cmp = compareYears(current, prior);
  assert.equal(cmp.rows.find((r) => r.key === "WAGES").flag, true);
  assert.equal(cmp.rows.find((r) => r.key === "FILING_STATUS").flag, true);
  assert.equal(compareYears(current, null), null);
  assert.ok(runDiagnostics(current, { comparison: cmp }).some((x) => x.code === "PRIOR_YEAR_WAGES"));
});

test("checklist follows forms and topics", () => {
  const list = buildChecklist({ topics: { income: ["SELF_EMPLOYED"], expenses: ["EDUCATION", "CHARITY"] }, forms: [{ type: "1099INT" }], other: { marketplace: "yes" } });
  for (const k of ["ID", "SSN", "1099NEC", "BIZEXP", "1099INT", "1098T", "CHARITY", "1095A", "PRIOR"]) assert.ok(list.includes(k), k);
});

test("attestation keeps only the current version", () => {
  assert.equal(sanitizeIntake({ attestation: { version: "old", at: "2026-01-01T00:00:00Z" } }).attestation, null);
  assert.equal(sanitizeIntake({ attestation: { version: ATTESTATION_VERSION, at: "2026-11-11T10:00:00Z" } }).attestation.version, ATTESTATION_VERSION);
});

// ---- Preparer review -------------------------------------------------------------------

import { approvalProblems, checklistFor, transitionError, answersFingerprintSource } from "./review-rules.js";

test("review checklist adds bank verification only for direct deposit", () => {
  assert.ok(checklistFor({ refund: { method: "direct_deposit" } }).some((c) => c.key === "BANK"));
  assert.ok(!checklistFor({ refund: { method: "check" } }).some((c) => c.key === "BANK"));
});

test("figures cannot be frozen while anything is open", () => {
  const intake = { ...complete(), refund: { method: "check" } };
  const issues = runDiagnostics(intake);
  assert.match(approvalProblems({ intake, issues }).join(" "), /not submitted/);
  intake.submitted = true;
  const all = Object.fromEntries(checklistFor(intake).map((c) => [c.key, { at: "x" }]));
  assert.deepEqual(approvalProblems({ intake, issues, checklist: all }), []);
  const withAlert = [...issues, { level: "ALERT", code: "Z" }];
  assert.equal(approvalProblems({ intake, issues: withAlert, checklist: all }).length, 1);
  assert.deepEqual(approvalProblems({ intake, issues: withAlert, checklist: all, resolved: { Z: { status: "IGNORED" } } }), []);
});

test("review transitions: freeze, approve, audited reopen", () => {
  assert.equal(transitionError({ from: "IN_PROGRESS", to: "READY_TO_SIGN", problems: [] }), null);
  assert.match(transitionError({ from: "IN_PROGRESS", to: "READY_TO_SIGN", problems: ["x"] }), /x/);
  assert.match(transitionError({ from: "IN_PROGRESS", to: "APPROVED", problems: [] }), /Ready to sign first/);
  assert.equal(transitionError({ from: "READY_TO_SIGN", to: "APPROVED", problems: [] }), null);
  assert.match(transitionError({ from: "APPROVED", to: "IN_PROGRESS", problems: [] }), /why/);
  assert.equal(transitionError({ from: "APPROVED", to: "CHANGES_REQUESTED", reason: "W-2 corrected", problems: [] }), null);
  assert.match(transitionError({ from: "READY_TO_SIGN", to: "IN_PROGRESS", reason: "x", signatureStatus: "REQUESTED", problems: [] }), /Withdraw/);
  assert.equal(transitionError({ from: "APPROVED", to: "IN_PROGRESS", reason: "rejected", signatureStatus: "SIGNED", submissionStatus: "REJECTED", problems: [] }), null);
  assert.match(transitionError({ from: "IN_PROGRESS", to: "NOT_STARTED", problems: [] }), /Choose/);
});

test("answer fingerprint ignores progress but not figures", () => {
  const a = complete();
  const b = { ...a, progress: { stepId: "ssn", completed: [] }, rev: 9 };
  assert.equal(answersFingerprintSource(a), answersFingerprintSource(b));
  b.forms = [{ ...b.forms[0], id: a.forms[0].id, wages: "50001" }];
  assert.notEqual(answersFingerprintSource({ ...a, forms: [{ ...a.forms[0] }] }), answersFingerprintSource(b));
});

// ---- Client save (the logic behind PUT /api/returns/[id]) --------------------------------

import { prepareClientSave } from "./intake-save.js";

test("save: frozen, filed and signing returns refuse changes", () => {
  assert.equal(prepareClientSave({ returnStatus: "FILED", storedIntake: {}, body: {} }).status, 400);
  assert.equal(prepareClientSave({ returnStatus: "READY_TO_SIGN", storedIntake: {}, body: {} }).status, 409);
  assert.equal(prepareClientSave({ returnStatus: "IN_REVIEW", reviewStatus: "APPROVED", storedIntake: {}, body: {} }).status, 409);
  assert.equal(prepareClientSave({ returnStatus: "IN_REVIEW", reviewStatus: "CHANGES_REQUESTED", storedIntake: {}, body: { intake: { schemaVersion: 2, rev: 0 } } }).ok, true);
});

test("save: revision check stops a stale screen and bumps the revision", () => {
  const stored = { ...complete(), rev: 3 };
  const stale = prepareClientSave({ returnStatus: "INTAKE", storedIntake: stored, body: { intake: { ...stored, rev: 2 } } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.conflict, true);
  assert.equal(stale.body.rev, 3);
  const fresh = prepareClientSave({ returnStatus: "INTAKE", storedIntake: stored, body: { intake: { ...stored, rev: 3, personal: { ...stored.personal, phone: "777" } } } });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.intake.rev, 4);
  assert.equal(fresh.intake.personal.phone, "777");
  assert.equal(fresh.intake.income.w2Wages, "50000");
});

test("save: an older screen keeps the structured answers", () => {
  const stored = { ...complete(), rev: 5 };
  const r = prepareClientSave({ returnStatus: "INTAKE", storedIntake: stored, body: { intake: { personal: { ...stored.personal, phone: "888" } } } });
  assert.equal(r.ok, true);
  assert.equal(r.intake.forms.length, 1);
  assert.equal(r.intake.personal.phone, "888");
  assert.equal(r.intake.rev, 6);
});

test("save: submission needs no blockers and the attestation, then moves to documents", () => {
  const empty = prepareClientSave({ returnStatus: "INTAKE", storedIntake: {}, body: { intake: { schemaVersion: 2, rev: 0, submitted: true } } });
  assert.equal(empty.status, 422);
  assert.ok(empty.body.blockers.length >= 1);
  const stored = complete();
  const noAttest = prepareClientSave({ returnStatus: "INTAKE", storedIntake: stored, body: { intake: { ...stored, submitted: true } } });
  assert.equal(noAttest.status, 422);
  assert.match(noAttest.body.error, /confirm/);
  const ok = prepareClientSave({ returnStatus: "INTAKE", storedIntake: stored, body: { intake: { ...stored, submitted: true, attestation: { version: ATTESTATION_VERSION, at: "2026-11-11T10:00:00Z" } } } });
  assert.equal(ok.ok, true);
  assert.equal(ok.submitting, true);
  assert.equal(ok.status, "DOCS_PENDING");
  const again = prepareClientSave({ returnStatus: "DOCS_PENDING", storedIntake: ok.intake, body: { intake: { ...ok.intake, submitted: false } } });
  assert.equal(again.intake.submitted, true);
  assert.equal(again.submitting, false);
});
