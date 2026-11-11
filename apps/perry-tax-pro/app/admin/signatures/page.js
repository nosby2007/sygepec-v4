import Link from "next/link";
import { listReturns } from "@/lib/data";
import { fmtDate, SIGNATURE_STATUSES } from "@/lib/constants";
import { SignatureBadge } from "@/components/WorkflowStatus";
import WorkflowEditor from "@/components/WorkflowEditor";
import ESignPanel from "@/components/ESignPanel";
import { requireRole, getFirebaseSession } from "@/lib/auth";
import { esignConfigured, listSignatures, signatureView } from "@/lib/esign";
import { paymentsReady } from "@/lib/payments";
import Icon from "@/components/Icon";
import { NumberCount } from "@/components/Motion";
import { Donut, PALETTE } from "@/components/charts";
import { Avatar, Empty, Kpi, PageHead } from "@/components/ui";

const COLORS = { NOT_REQUESTED: PALETTE.slate, REQUESTED: PALETTE.gold, SIGNED: PALETTE.green, DECLINED: PALETTE.rose };

export default async function Page() {
  await requireRole("PREPARER");
  const online = esignConfigured() && (await paymentsReady());
  // Open DocuSeal requests are read back first, so the statuses below are current.
  const signatures = online ? await listSignatures(await getFirebaseSession()) : {};
  const returns = await listReturns();
  const priority = { REQUESTED: 0, DECLINED: 1, NOT_REQUESTED: 2, SIGNED: 3 };
  const rows = returns
    .filter((item) => item.intake.submitted)
    .sort((a, b) => (priority[a.signature_status] ?? 9) - (priority[b.signature_status] ?? 9));
  const requested = rows.filter((item) => item.signature_status === "REQUESTED").length;
  const signed = rows.filter((item) => item.signature_status === "SIGNED").length;
  const exceptions = rows.filter((item) => item.signature_status === "DECLINED").length;
  const onlineOpen = Object.values(signatures).filter((sig) => ["SENT", "PARTIAL"].includes(sig.status)).length;
  const segs = SIGNATURE_STATUSES.map((s) => ({ label: s.label, value: rows.filter((r) => r.signature_status === s.key).length, color: COLORS[s.key] }));

  return (
    <>
      <PageHead kicker="Form 8879 tracking" icon="pen" title="Signature Center" desc={online ? "Send Form 8879 for online signature with identity check (DocuSeal), follow each signer, or record a paper signature. This does not transmit a return to the IRS." : "Track requests and verified signatures. This records status; it does not transmit a return to the IRS."} />
      {!online && <div className="alert alert-info" style={{ marginBottom: 16 }}><Icon name="info" size={16} />Online signing is not available right now, so only manual status updates are shown.</div>}
      <div className="grid-main">
        <div className="grid-3 stagger" style={{ alignContent: "start" }}>
          <Kpi label="Awaiting signature" icon="clock" tone="gold" value={<NumberCount value={requested} />} foot={online ? `${onlineOpen} sent online · follow up` : "Follow up with client"} />
          <Kpi label="Signed and verified" icon="shield" tone="green" value={<NumberCount value={signed} />} valueStyle={{ color: "var(--green)" }} foot="Ready for e-file" />
          <Kpi label="Exceptions" icon="alert" tone="rose" value={<NumberCount value={exceptions} />} valueStyle={{ color: exceptions ? "var(--rose)" : "var(--text)" }} foot="Declined signatures" />
        </div>
        <div className="card">
          <div className="donut-wrap">
            <Donut size={130} thickness={16} segments={segs} center={rows.length ? `${Math.round((signed / rows.length) * 100)}%` : "—"} sub="signed" label="Signature status distribution" />
            <div className="legend vertical">{segs.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}<b>{s.value}</b></span>)}</div>
          </div>
        </div>
      </div>
      <div className="card mt">
        <div className="card-title">
          <div><h3>Signature queue</h3><div className="sub">Requested signatures first, then exceptions</div></div>
          <span className="pill">{rows.length} returns</span>
        </div>
        <div className="workflow-list">
          {rows.map((item) => (
            <article key={item.id} className={`workflow-row ${item.signature_status === "REQUESTED" ? "flag" : item.signature_status === "DECLINED" ? "alarm" : ""}`}>
              <div className="workflow-person">
                <Link href={`/admin/returns/${item.id}`} className="person"><Avatar name={item.client_name} size="sm" /><b>{item.client_name}</b></Link>
                <span className="hint">{item.client_email} · Tax year {item.tax_year}</span>
                <div className="row"><SignatureBadge status={item.signature_status} />{item.signed_at && <span className="hint">Verified {fmtDate(item.signed_at)}</span>}</div>
              </div>
              <div className="stack-sm" style={{ minWidth: 0 }}>
                {online && <ESignPanel compact returnId={item.id} signature={signatureView(signatures[item.id] || null)} available jointReturn={item.filing_status === "MFJ" || item.intake?.personal?.filingStatus === "MFJ"} />}
                {online && ["SENT", "PARTIAL"].includes(signatures[item.id]?.status) ? (
                  <span className="hint">Manual status changes are off while an online request is open. Cancel it first to record a paper signature.</span>
                ) : online ? (
                  <details className="esign-manual">
                    <summary className="small">Record a paper or in-person signature instead</summary>
                    <WorkflowEditor item={item} mode="signature" compact />
                  </details>
                ) : (
                  <WorkflowEditor item={item} mode="signature" compact />
                )}
              </div>
            </article>
          ))}
          {rows.length === 0 && <Empty icon="pen" title="Nothing to sign yet">No submitted questionnaires are ready for signature processing.</Empty>}
        </div>
      </div>
    </>
  );
}
