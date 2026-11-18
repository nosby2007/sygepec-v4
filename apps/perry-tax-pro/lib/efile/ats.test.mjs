import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScenarios, REFERENCE_SCENARIOS, runAll, runScenario } from "./ats.js";
import { ONBOARDING_STEPS, onboardingChangeError, onboardingView } from "./onboarding.js";

test("reference cases pass through the questionnaire, the engines and the package", () => {
  const report = runAll();
  assert.equal(report.failed, 0, JSON.stringify(report.results.map((r) => r.jurisdictions.map((j) => j.mismatches.concat(j.packageErrors)))));
  assert.equal(report.passed, REFERENCE_SCENARIOS.length);
  assert.equal(report.officialScenarios, 0);
  assert.equal(report.atsComplete, false, "reference cases are never ATS");
  for (const r of report.results) {
    assert.equal(r.source, "INNOVATAX_REFERENCE");
    for (const j of r.jurisdictions) {
      assert.ok(j.checked > 0, `${r.id} ${j.code} checks figures`);
      assert.match(j.xml, /^<\?xml/);
    }
  }
});

test("a wrong expected figure fails the scenario and names the line", () => {
  const s = structuredClone(REFERENCE_SCENARIOS[0]);
  s.expected.US["1040.16"] = 5000;
  const r = runScenario(s);
  assert.equal(r.ok, false);
  assert.deepEqual(r.jurisdictions[0].mismatches, [{ line: "1040.16", expected: 5000, actual: 5023 }]);
  assert.equal(r.jurisdictions[1].ok, true, "the Georgia part is reported on its own");
});

test("a scenario without a calculation for its jurisdiction fails cleanly", () => {
  const r = runScenario({ ...structuredClone(REFERENCE_SCENARIOS[0]), jurisdictions: ["AL"], expected: {} });
  assert.equal(r.ok, false);
  assert.match(r.jurisdictions[0].error, /No AL calculation/);
});

test("scenario files are checked before they run", () => {
  const good = { ...structuredClone(REFERENCE_SCENARIOS[0]), id: "FILE-1" };
  const { scenarios, errors } = loadScenarios([
    good,
    { ...good, id: "ATS-1", source: "IRS_ATS" },
    { ...good, id: "x" },
    { ...good, id: "BAD-SRC", source: "BLOG" },
    { ...good, id: "BAD-NUM", expected: { US: { "1040.11": "lots" } } },
    null,
  ]);
  assert.deepEqual(scenarios.map((s) => s.id), ["FILE-1"]);
  assert.ok(errors.some((e) => e.startsWith("ATS-1:") && /reference/.test(e)), "IRS scenarios must cite their source");
  assert.ok(errors.some((e) => e.startsWith("x:")));
  assert.ok(errors.some((e) => e.startsWith("BAD-SRC:")));
  assert.ok(errors.some((e) => e.startsWith("BAD-NUM:")));
  assert.ok(errors.some((e) => e.startsWith("#6:")));
  const cited = loadScenarios([{ ...good, id: "ATS-2", source: "IRS_ATS", reference: "Pub. 1436, scenario 2" }]);
  assert.equal(cited.scenarios.length, 1);
});

test("onboarding: nothing is ready until every step for that gate is done", () => {
  const empty = onboardingView({}, {}, {});
  assert.equal(empty.readyForAts, false);
  assert.equal(empty.readyForProduction, false);
  assert.equal(empty.readyForGeorgia, false);
  const done = Object.fromEntries(ONBOARDING_STEPS.map((s) => [s.id, { status: "DONE" }]));
  // Engineering steps are read from the code, whatever was recorded.
  const recordedOnly = onboardingView(done, {}, {});
  assert.equal(recordedOnly.readyForAts, false);
  assert.ok(recordedOnly.steps.filter((s) => s.derived).every((s) => s.status === "NOT_STARTED"));
  // A recorded step whose server setting is missing is flagged.
  assert.ok(recordedOnly.steps.find((s) => s.id === "EFIN").warning.includes("MEF_EFIN"));
  const all = onboardingView(done, { schema: true, transport: true, gaTransport: true, reference: true }, { MEF_EFIN: true, MEF_ETIN: true, MEF_A2A_CERT_SECRET: true, EFILE_PRODUCTION_AUTHORIZED: true });
  assert.equal(all.readyForGeorgia, true);
  assert.ok(all.steps.every((s) => !s.warning));
});

test("onboarding: the federal application is never confused with an EFIN", () => {
  const app = ONBOARDING_STEPS.find((s) => s.id === "EFILE_APPLICATION");
  assert.match(app.detail, /EFIN alone/);
  assert.match(ONBOARDING_STEPS.find((s) => s.id === "GA_APPROVAL").detail, /does not authorize Georgia/);
});

test("onboarding changes are checked", () => {
  assert.equal(onboardingChangeError("EFIN", "DONE", ""), null);
  assert.match(onboardingChangeError("NOPE", "DONE"), /Unknown/);
  assert.match(onboardingChangeError("SCHEMA_ADAPTER", "DONE"), /read from the code/);
  assert.match(onboardingChangeError("EFIN", "MAYBE"), /status/);
  assert.match(onboardingChangeError("SECURITY", "NOT_APPLICABLE", ""), /why/);
  assert.match(onboardingChangeError("ATS_TESTING", "NOT_APPLICABLE", "skip"), /required/);
});
