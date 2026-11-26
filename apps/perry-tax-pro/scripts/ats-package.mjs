// Builds the assurance-testing package: every scenario run through the chain, with its
// XML, hash, schema and consistency results and the figure comparison.
//
//   node --no-warnings --import ./test/node-hooks.mjs scripts/ats-package.mjs [scenarioDir] [outDir]
//
// scenarioDir (default ats/scenarios) holds one JSON file per scenario; the official IRS
// ATS scenarios go there once obtained. The reference cases always run. Output goes to
// outDir (default ats-out/<date>), which is not committed. Exit code 1 when any scenario
// fails, so it can gate a release.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadScenarios, REFERENCE_SCENARIOS, runAll } from "../lib/efile/ats.js";
import { schemaPackageStatus } from "../lib/efile/package.js";

const [scenarioDir = "ats/scenarios", outDir = join("ats-out", new Date().toISOString().slice(0, 10))] = process.argv.slice(2);

const files = existsSync(scenarioDir) ? readdirSync(scenarioDir).filter((f) => f.endsWith(".json")) : [];
const parsed = [];
const problems = [];
for (const f of files) {
  try { parsed.push(JSON.parse(readFileSync(join(scenarioDir, f), "utf8"))); } catch (e) { problems.push(`${f}: ${e.message}`); }
}
const { scenarios, errors } = loadScenarios(parsed);
problems.push(...errors);
const report = runAll([...REFERENCE_SCENARIOS, ...scenarios]);

mkdirSync(outDir, { recursive: true });
for (const r of report.results) for (const j of r.jurisdictions) if (j.xml) writeFileSync(join(outDir, `${r.id}-${j.code}.xml`), j.xml);
const schema = schemaPackageStatus(2026);
const lines = [
  "# InnovaTax assurance testing package",
  "",
  `Generated ${new Date().toISOString()}.`,
  "",
  `- Scenarios: ${report.results.length} (${report.officialScenarios} official IRS ATS, ${report.results.length - report.officialScenarios} InnovaTax reference)`,
  `- Passed: ${report.passed}; failed: ${report.failed}`,
  `- IRS schema package: ${schema.installed ? schema.adapterId : "not installed (sandbox schema used)"}`,
  "- ATS status: NOT COMPLETE. ATS needs the official scenarios transmitted to the IRS ATS environment and IRS acknowledgements.",
  ...(problems.length ? ["", "## Scenario files refused", "", ...problems.map((p) => `- ${p}`)] : []),
  "",
  "| Scenario | Source | Jurisdiction | Result | Figures checked | Differences | Package errors | Hash |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...report.results.flatMap((r) => r.jurisdictions.map((j) => `| ${r.id} ${r.title} | ${r.sourceLabel} | ${j.code} | ${j.ok ? "PASS" : "FAIL"} | ${j.checked ?? 0} | ${j.error || j.mismatches.map((m) => `${m.line}: expected ${m.expected}, got ${m.actual}`).join("; ") || "none"} | ${j.packageErrors.map((e) => e.code).join(", ") || "none"} | ${j.hash ? j.hash.slice(0, 16) : ""} |`)),
];
writeFileSync(join(outDir, "report.md"), lines.join("\n") + "\n");
writeFileSync(join(outDir, "report.json"), JSON.stringify({ ...report, results: report.results.map((r) => ({ ...r, jurisdictions: r.jurisdictions.map(({ xml: _x, ...j }) => j) })), problems }, null, 2));
console.log(lines.slice(0, 9).join("\n"));
console.log(`\nWritten to ${outDir}`);
process.exit(report.failed || problems.length ? 1 : 0);
