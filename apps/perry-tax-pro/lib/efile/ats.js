// Assurance testing: run test returns through the whole chain (questionnaire ->
// calculation -> package -> schema check -> consistency rules) and compare the figures
// with the expected ones.
//
// Two kinds of scenario, never mixed up:
//   IRS_ATS              the official scenarios of IRS Publication 1436 for the tax year.
//                        They are released to e-file applicants and are not in this
//                        repository; nothing here reproduces them from memory. Once
//                        obtained, each is entered as a JSON file (format below) and
//                        loaded with loadScenarios().
//   INNOVATAX_REFERENCE  InnovaTax's own cases. Their expected figures are worked by hand
//                        in lib/tax-engine/engine.test.mjs from Rev. Proc. 2025-32 and the
//                        Georgia IT-511. Passing them proves the chain, not IRS approval.
//
// Scenario: { id, source, title, taxYear, intake, supplement?, jurisdictions: ["US", "GA"],
//             expected: { US: { "1040.15": 43900, ... }, GA: { ... } }, notes? }
import { buildPackage, sandboxAdapter } from "@/lib/efile/package";
import { computeReturn } from "@/lib/tax-engine/index";
import { sanitizeIntake } from "@/lib/intake-schema";

export const SOURCES = { IRS_ATS: "IRS ATS (Pub. 1436)", INNOVATAX_REFERENCE: "InnovaTax reference case" };
const TEST_FINGERPRINT = "0".repeat(64);

const person = (extra = {}) => ({ firstName: "Test", lastName: "Filer", dob: "1986-05-02", ssnLast4: "0000", phone: "000", address: "1 Test St", city: "Atlanta", state: "GA", zip: "30301", ...extra });
const answered = { canBeClaimed: "no", supportsOthers: "no", other: { marketplace: "no", digitalAssets: "no", ipPin: "no" } };

export const REFERENCE_SCENARIOS = [
  {
    id: "IX-2026-01", source: "INNOVATAX_REFERENCE", taxYear: 2026, jurisdictions: ["US", "GA"],
    title: "Single, one W-2, Georgia resident",
    intake: { personal: person(), maritalStatus: "SINGLE", filingStatus: "SINGLE", ...answered, forms: [{ id: "w1", type: "W2", issuer: "Employer A", wages: "60000", fedWithheld: "7000", state: "GA", stateWithheld: "2500" }] },
    expected: {
      US: { "1040.11": 60000, "1040.12": 16100, "1040.15": 43900, "1040.16": 5023, "1040.24": 5023, "1040.34": 1977, "1040.37": 0 },
      GA: { "500.8": 60000, "500.11": 15000, "500.15": 45000, "500.16": 2246, "500.23": 2500 },
    },
    notes: "engine.test.mjs: single wage earner; Georgia resident return.",
  },
  {
    id: "IX-2026-02", source: "INNOVATAX_REFERENCE", taxYear: 2026, jurisdictions: ["US"],
    title: "Married filing jointly, two W-2s, two children",
    intake: {
      personal: person({ dob: "1986-01-01" }), maritalStatus: "MARRIED", filingStatus: "MFJ", spouse: { name: "Test Spouse", dob: "1992-01-01", ssnLast4: "0001" }, ...answered,
      dependents: [{ name: "Child A", relationship: "son", age: "5", months: "12", ssnLast4: "0002" }, { name: "Child B", relationship: "daughter", age: "8", months: "12", ssnLast4: "0003" }],
      forms: [
        { id: "w1", type: "W2", owner: "taxpayer", issuer: "Employer A", wages: "50000", fedWithheld: "4000", state: "GA" },
        { id: "w2", type: "W2", owner: "spouse", issuer: "Employer B", wages: "30000", fedWithheld: "2000", state: "GA" },
      ],
    },
    expected: { US: { "1040.15": 47800, "1040.16": 5243, "1040.19": 4400, "1040.24": 843, "1040.27": 0, "1040.34": 5157 } },
    notes: "engine.test.mjs: joint return with two children.",
  },
];

// Reads scenario files (already parsed JSON). Rejects anything malformed instead of
// guessing, and refuses an IRS_ATS scenario that does not say where it came from.
export function loadScenarios(list) {
  const errors = [];
  const ok = [];
  for (const [i, s] of (list || []).entries()) {
    const where = s?.id || `#${i + 1}`;
    if (!s || typeof s !== "object") { errors.push(`${where}: not an object.`); continue; }
    if (!/^[A-Za-z0-9-]{3,40}$/.test(String(s.id || ""))) errors.push(`${where}: id is missing or invalid.`);
    if (!SOURCES[s.source]) errors.push(`${where}: source must be IRS_ATS or INNOVATAX_REFERENCE.`);
    if (s.source === "IRS_ATS" && !String(s.reference || "").trim()) errors.push(`${where}: an IRS ATS scenario needs a reference (publication, revision and scenario number).`);
    if (!Number.isInteger(s.taxYear)) errors.push(`${where}: taxYear must be a year.`);
    if (!s.intake || typeof s.intake !== "object") errors.push(`${where}: intake is missing.`);
    const juris = Array.isArray(s.jurisdictions) && s.jurisdictions.length ? s.jurisdictions : ["US"];
    for (const j of juris) if (s.expected?.[j] && Object.values(s.expected[j]).some((v) => !Number.isFinite(v))) errors.push(`${where}: expected ${j} figures must be numbers.`);
    if (!errors.some((e) => e.startsWith(`${where}:`))) ok.push({ ...s, jurisdictions: juris, expected: s.expected || {} });
  }
  return { scenarios: ok, errors };
}

// Runs one scenario and reports, per jurisdiction, the package check and every expected
// figure that differs.
export function runScenario(s) {
  const intake = sanitizeIntake({ ...s.intake, submitted: true });
  const result = computeReturn(intake, s.taxYear, s.supplement);
  const calculation = {
    status: result.readiness.calculationStatus,
    federal: { ruleSet: result.federal.ruleSet, forms: result.federal.forms, lines: result.federal.lines },
    states: result.states.filter((x) => x.calculation === "AVAILABLE").map((x) => ({ code: x.code, kind: x.kind, form: x.form, ruleSet: x.ruleSet, lines: x.lines })),
  };
  const jurisdictions = s.jurisdictions.map((j) => {
    const lines = j === "US" ? calculation.federal.lines : calculation.states.find((x) => x.code === j)?.lines;
    if (!lines) return { code: j, ok: false, error: `No ${j} calculation for this scenario.`, mismatches: [], packageErrors: [] };
    let pkg;
    try {
      pkg = buildPackage({ returnId: `ATS-${s.id}`, taxYear: s.taxYear, intake, calculation, fingerprint: TEST_FINGERPRINT, jurisdiction: j }, sandboxAdapter(s.taxYear));
    } catch (e) {
      return { code: j, ok: false, error: e.message, mismatches: [], packageErrors: [] };
    }
    const mismatches = Object.entries(s.expected[j] || {})
      .filter(([line, want]) => Math.round(lines[line] ?? NaN) !== Math.round(want))
      .map(([line, want]) => ({ line, expected: want, actual: Number.isFinite(lines[line]) ? Math.round(lines[line]) : null }));
    return {
      code: j, ok: pkg.valid && mismatches.length === 0, checked: Object.keys(s.expected[j] || {}).length, mismatches,
      packageErrors: pkg.errors.map(({ code, message }) => ({ code, message })), forms: pkg.forms, hash: pkg.hash, xml: pkg.xml,
    };
  });
  return {
    id: s.id, source: s.source, sourceLabel: SOURCES[s.source], title: s.title || s.id, taxYear: s.taxYear,
    calculationStatus: calculation.status, ok: jurisdictions.every((j) => j.ok), jurisdictions,
  };
}

export function runAll(scenarios = REFERENCE_SCENARIOS) {
  const results = scenarios.map(runScenario);
  const official = results.filter((r) => r.source === "IRS_ATS");
  return {
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    officialScenarios: official.length,
    // Passing reference cases never amounts to ATS: that needs the official scenarios,
    // transmitted to the IRS ATS environment, with IRS acknowledgements.
    atsComplete: false,
  };
}
