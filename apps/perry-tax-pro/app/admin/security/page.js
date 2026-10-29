import Link from "next/link";
import { getFirebaseSession, requireRole } from "@/lib/auth";
import { AUDIT_LABELS, recentAudit } from "@/lib/audit";
import { getDocument, queryCollection, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { TwoStepSettings } from "@/components/TwoStep";
import { Empty, Kpi, PageHead } from "@/components/ui";
import ResetMfaButton from "./ResetMfaButton";

export const metadata = { title: "Security" };

const when = (iso) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
const GROUPS = {
  signin: ["LOGIN", "LOGIN_FAILED", "LOGOUT", "MFA_PASSED", "MFA_FAILED", "MFA_LOCKED", "MFA_RECOVERY_USED", "MFA_ENABLED", "MFA_DISABLED"],
  documents: ["DOCUMENT_UPLOADED", "DOCUMENT_VIEWED", "DOCUMENT_DELETED", "UPLOAD_BLOCKED"],
  returns: ["RETURN_UPDATED", "SIGNATURE_SENT", "SIGNATURE_CANCELLED", "SIGNATURE_COMPLETED"],
  money: ["FEE_CHANGED", "PAYMENT_CONFIRMED", "SUBSCRIPTION_CHANGED"],
  system: ["RETENTION_RUN"],
};
const GROUP_LABELS = { all: "All", signin: "Sign-in", documents: "Documents", returns: "Returns", money: "Money", system: "System" };
const ALERTS = new Set(["LOGIN_FAILED", "MFA_FAILED", "MFA_LOCKED", "UPLOAD_BLOCKED", "DOCUMENT_DELETED", "MFA_DISABLED"]);
const targetLink = (t) => (t?.startsWith("taxReturns/") ? `/admin/returns/${t.split("/")[1]}` : null);
const detail = (d) => Object.entries(d || {}).filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}`).join(" · ");

export default async function Page({ searchParams }) {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  const asked = (await searchParams)?.show;
  const group = GROUPS[asked] ? asked : "all";
  const token = await serviceToken().catch(() => null);
  const [entries, preparers] = await Promise.all([
    token ? recentAudit({ limit: 500 }).catch(() => []) : [],
    queryCollection("taxUsers", session.idToken, { filters: [["role", "EQUAL", "PREPARER"]], limit: 50 }).catch(() => []),
  ]);
  const staff = await Promise.all(preparers.filter((p) => p.tenantId === TAX_TENANT).map(async (p) => ({
    ...p, mfa: token ? await getDocument(`taxMfa/${p.id}`, token).catch(() => null) : null,
  })));
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const last24 = entries.filter((e) => e.at >= dayAgo);
  const count = (rows, ...actions) => rows.filter((e) => actions.includes(e.action)).length;
  const shown = (group === "all" ? entries : entries.filter((e) => GROUPS[group].includes(e.action))).slice(0, 150);
  const blocked = count(entries, "UPLOAD_BLOCKED");
  const twoStepTrouble = count(last24, "MFA_FAILED", "MFA_LOCKED");

  return (
    <>
      <PageHead kicker="Protection" icon="shield" title="Security" desc="Two-step sign-in for the team and a permanent record of sign-ins, document access, return changes and payments." />
      <div className="grid-4 stagger">
        <Kpi label="Sign-ins (24 h)" icon="user" value={count(last24, "LOGIN")} foot={`${count(last24, "LOGIN_FAILED")} failed`} />
        <Kpi label="Two-step problems (24 h)" icon="lock" tone={twoStepTrouble ? "gold" : ""} value={twoStepTrouble} foot="wrong codes and lock-outs" />
        <Kpi label="Documents opened (24 h)" icon="folder" value={count(last24, "DOCUMENT_VIEWED")} foot={`${count(last24, "DOCUMENT_UPLOADED")} uploaded`} />
        <Kpi label="Unsafe uploads blocked" icon="alert" tone={blocked ? "gold" : "green"} value={blocked} foot="in the latest 500 entries" />
      </div>
      <div className="grid-2 mt">
        <TwoStepSettings required />
        <div className="card stack-sm">
          <div className="card-title"><div><h3>Team two-step sign-in</h3><div className="sub">Required for every preparer</div></div></div>
          {staff.length === 0 ? <p className="small muted">No preparers found.</p> : staff.map((p) => (
            <div key={p.id} className="list-item">
              <span className="small"><b>{p.name}</b><br /><span className="muted">{p.email}</span></span>
              <span className="row">
                <span className={`badge ${p.mfa?.enabled ? "s-ACCEPTED" : "s-REQUESTED"}`}>{p.mfa?.enabled ? "On" : "Set up at next sign-in"}</span>
                {p.mfa?.enabled && p.id !== session.uid && <ResetMfaButton uid={p.id} name={p.name} />}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card mt">
        <div className="card-title">
          <div><h3>Activity log</h3><div className="sub">Newest first. Entries cannot be edited or removed; they are kept 7 years.</div></div>
          <div className="row">
            {Object.entries(GROUP_LABELS).map(([g, label]) => (
              <Link key={g} href={g === "all" ? "/admin/security" : `/admin/security?show=${g}`} className={`btn btn-sm ${group === g ? "btn-primary" : "btn-ghost"}`}>{label}</Link>
            ))}
          </div>
        </div>
        {!token ? <Empty icon="lock" title="The log is not available">The server needs its database permission first.</Empty>
          : shown.length === 0 ? <Empty icon="shield" title="Nothing recorded yet">Sign-ins, document access and changes will appear here.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>When (ET)</th><th>What</th><th>Who</th><th>Details</th><th>From</th></tr></thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{when(e.at)}</td>
                    <td>{ALERTS.has(e.action) ? <span className="badge s-CANCELLED">{AUDIT_LABELS[e.action] || e.action}</span> : AUDIT_LABELS[e.action] || e.action}</td>
                    <td className="small">{e.actorEmail || (e.actorRole === "SYSTEM" ? "System" : "—")}{e.actorRole && e.actorRole !== "SYSTEM" ? <span className="muted"> · {e.actorRole.toLowerCase()}</span> : null}</td>
                    <td className="small">{targetLink(e.target) ? <Link href={targetLink(e.target)} className="grad-text">Open return</Link> : null}{targetLink(e.target) && detail(e.details) ? " · " : ""}{detail(e.details)}</td>
                    <td className="small muted">{e.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>
    </>
  );
}
