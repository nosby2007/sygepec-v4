import { requireRole, getFirebaseSession } from "@/lib/auth";
import { getOnboarding } from "@/lib/efile/onboarding-store";
import { schemaPackageStatus } from "@/lib/efile/package";
import { GEORGIA_PROGRAM } from "@/lib/efile/georgia";
import { efileConfig, productionGaps } from "@/lib/efile/transport";
import { isGeneralAdmin } from "@/lib/staff";
import { moduleStatuses } from "@/lib/tax-engine/registry";
import Icon from "@/components/Icon";
import { Kpi, PageHead } from "@/components/ui";
import OnboardingSteps from "./OnboardingSteps";

const TONE = { PENDING: "", IMPLEMENTED: "s-REQUESTED", TESTED: "s-REQUESTED", VALIDATED: "s-ACCEPTED", FILING_READY: "s-ACCEPTED" };
const NAME = { US: "Federal", GA: "Georgia" };

// E-file readiness: where InnovaTax stands on the way to authorized transmission, the
// tax-year support matrix and the reference test results.
export default async function Page() {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  const [onboarding, isAdmin] = await Promise.all([getOnboarding(2026), isGeneralAdmin(session)]);
  const config = efileConfig();
  const schema = schemaPackageStatus(2026);
  const gaSchema = schemaPackageStatus(2026, "GA");
  const modules = moduleStatuses(2026);
  const gaps = { US: productionGaps(config, "US"), GA: productionGaps(config, "GA") };
  const { reference } = onboarding;
  const steps = onboarding.steps.map(({ id, title, ownerLabel, gate, reference: ref, detail, status, statusLabel, derived, warning, note, by, at }) => ({ id, title, ownerLabel, gate, reference: ref, detail: detail || "", status, statusLabel, derived, warning, note, by, at }));

  return (
    <>
      <PageHead kicker="Tax year 2026" icon="shield" title="E-file readiness" desc="What stands between InnovaTax and authorized electronic filing, and what each tax module has proven." />
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <Icon name="info" size={16} />
        <span>These are separate statuses, never the same thing: code complete, tested, tax validated, ATS approved, production authorized. Recording a step here changes no setting and turns nothing on.</span>
      </div>
      <div className="grid-3 stagger">
        <Kpi label="Ready for ATS testing" icon="bolt" tone={onboarding.readyForAts ? "teal" : "gold"} value={onboarding.readyForAts ? "Yes" : "No"} foot={`${onboarding.openCount.ATS} step${onboarding.openCount.ATS === 1 ? "" : "s"} open`} />
        <Kpi label="Production authorized" icon="send" tone={config.mode === "production" && !gaps.US.length ? "teal" : "rose"} value={config.mode === "production" && !gaps.US.length ? "Yes" : "No"} foot={`Server mode: ${config.mode}`} />
        <Kpi label="Reference cases" icon="check" tone={reference.failed ? "rose" : "teal"} value={`${reference.passed}/${reference.results.length}`} foot="InnovaTax cases, not IRS ATS" />
      </div>

      <div className="card mt">
        <div className="card-title"><div><h3>Onboarding</h3><div className="sub">IRS e-file application, ATS, production and Georgia</div></div></div>
        <OnboardingSteps initial={steps} canEdit={isAdmin} />
      </div>

      <div className="grid-main mt">
        <div className="card">
          <div className="card-title"><h3>Before real transmission</h3></div>
          {Object.entries(gaps).map(([code, list]) => {
            const own = code === "US" ? list : list.filter((g) => !g.startsWith("Federal: "));
            return (
              <div key={code} className="stack-sm">
                <b className="small">{NAME[code]}{code !== "US" ? ", on top of every federal item" : ""}</b>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{own.map((g) => <li key={g}>{g}</li>)}{!list.length && <li>Nothing missing.</li>}</ul>
              </div>
            );
          })}
          <p className="hint mt">IRS schema package: {schema.installed ? schema.adapterId : schema.note}</p>
          <p className="hint">Georgia schema package: {gaSchema.installed ? gaSchema.adapterId : gaSchema.note}</p>
        </div>
        <div className="card">
          <div className="card-title"><div><h3>Reference test run</h3><div className="sub">Run with <code>npm run ats</code> to get the full package</div></div></div>
          <div className="breakdown" style={{ marginTop: 0 }}>
            {reference.results.flatMap((r) => r.jurisdictions.map((j) => (
              <div key={`${r.id}-${j.code}`}><span>{r.id} · {r.title} · {NAME[j.code] || j.code}</span><b style={{ color: j.ok ? "var(--green)" : "var(--rose)" }}>{j.ok ? `Pass (${j.checked} figures)` : "Fail"}</b></div>
            )))}
          </div>
          {reference.results.some((r) => !r.ok) && <div className="alert alert-error small mt">{reference.results.flatMap((r) => r.jurisdictions.flatMap((j) => [j.error, ...j.mismatches.map((m) => `${r.id} ${m.line}: expected ${m.expected}, got ${m.actual}`)])).filter(Boolean).join(" · ")}</div>}
        </div>
      </div>

      <div className="card mt">
        <div className="card-title"><div><h3>Georgia electronic filing</h3><div className="sub">{GEORGIA_PROGRAM.program}</div></div></div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{GEORGIA_PROGRAM.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="hint mt">Contact: {GEORGIA_PROGRAM.contact}. Sources: {GEORGIA_PROGRAM.sources.map((s, i) => <span key={s.url}>{i ? "; " : ""}<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>)}</p>
      </div>

      <div className="card mt">
        <div className="card-title"><div><h3>Tax-year support matrix</h3><div className="sub">PENDING → IMPLEMENTED → TESTED → VALIDATED → FILING_READY. A passing build never moves a module up.</div></div><span className="pill">{modules.length} modules</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Module</th><th>Jurisdiction</th><th>Forms</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name}</b><div className="hint">{m.id}</div></td>
                  <td>{NAME[m.jurisdiction] || m.jurisdiction}</td>
                  <td className="small">{m.forms.join(", ")}</td>
                  <td><span className={`badge ${TONE[m.status] || ""}`}>{m.status.replace("_", " ").toLowerCase()}</span></td>
                  <td className="small muted">{m.note || (m.source ? `Source: ${m.source}` : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
