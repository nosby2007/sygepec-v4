import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, getFirebaseSession } from "@/lib/auth";
import { BUSINESS_TAX_STATUSES, BUSINESS_TAX_PRIORITIES } from "@/lib/business-admin";
import { queryCollection, TAX_TENANT } from "@/lib/firebase";
import { monthlyLedger } from "@/lib/analytics";
import { BarChart, HBars, PALETTE } from "@/components/charts";
import { MoneyCount, NumberCount, Reveal } from "@/components/Motion";
import { Kpi, PageHead } from "@/components/ui";
import Icon from "@/components/Icon";
import BusinessTaxCaseEditor from "./BusinessTaxCaseEditor";
import BusinessReturnPanel from "./BusinessReturnPanel";
import { loadReturn } from "@/lib/business-return-server";
import FeeControls from "@/components/FeeControls";
import { chargeView, getCharge, paymentsReady } from "@/lib/payments";
import { BUSINESS_RETURN_BASE_CENTS } from "@/lib/billing";

const moneyCents = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((value || 0) / 100);
const date = (value) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default async function BusinessTaxCasePage({ params }) {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  const { id } = await params;
  const loaded = await loadReturn(session, id);
  if (!loaded) notFound();
  const { record } = loaded;
  const { updateTime: _u, createTime: _c, ...returnData } = loaded.ret;
  const [users, charge, payments] = await Promise.all([
    queryCollection("taxUsers", session.idToken, { filters: [["tenantId", "EQUAL", TAX_TENANT]], limit: 1000 }),
    getCharge("BUSINESS_RETURN", record.report.id).catch(() => null),
    paymentsReady(),
  ]);
  const preparers = users.filter((user) => user.role === "PREPARER").map((user) => ({ id: user.uid || user.id, name: user.name }));
  const months = monthlyLedger(record.entries, record.report.taxYear).map((month) => ({ label: month.label, values: [month.income, month.expense] }));
  const categories = Object.entries(record.summary.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value], index) => ({ label, value, color: [PALETTE.blue, PALETTE.teal, PALETTE.gold, PALETTE.violet, PALETTE.orange][index % 5] }));
  const clientName = record.user?.name || `Business ${record.report.clientId.slice(0, 8)}`;
  const unmatched = Math.max(0, record.entries.length - record.matches.length);

  return (
    <>
      <PageHead kicker="Business tax case" icon="briefcase" title={`${clientName} · ${record.report.taxYear}`} desc={`${record.user?.email || record.report.clientId} · Submitted ${date(record.report.createdAt)}`}>
        <Link href="/admin/business" className="btn btn-ghost"><Icon name="back" size={15} /> Business dashboard</Link>
      </PageHead>

      <div className="grid-4 stagger">
        <Kpi label="Gross income" icon="trending" tone="teal" value={<MoneyCount value={record.summary.incomeCents} cents />} foot={`${record.entries.filter((entry) => entry.kind === "income").length} income entries`} />
        <Kpi label="Expenses" icon="receipt" tone="gold" value={<MoneyCount value={record.summary.expenseCents} cents />} foot={`${record.entries.filter((entry) => entry.kind === "expense").length} expense entries`} />
        <Kpi label="Net before adjustments" icon="dollar" value={<MoneyCount value={record.summary.netCents} cents signed />} foot={`${record.corrections.length} correction${record.corrections.length === 1 ? "" : "s"}`} />
        <Kpi label="Books readiness" icon="shield" tone="green" value={<NumberCount value={record.readiness} suffix="%" />} foot={`${unmatched} unreconciled · ${record.receipts.length} receipts`} />
      </div>

      <BusinessTaxCaseEditor report={record.report} preparers={preparers} statuses={BUSINESS_TAX_STATUSES} priorities={BUSINESS_TAX_PRIORITIES} />

      <div className="mt"><FeeControls kind="BUSINESS_RETURN" refId={record.report.id} charge={chargeView(charge, loaded.ret.status)} available={payments} defaultAmount={(BUSINESS_RETURN_BASE_CENTS / 100).toFixed(2)} /></div>
      <BusinessReturnPanel key={returnData.version} caseId={record.report.id} initial={returnData} books={loaded.books} events={loaded.events.map(({ id: eventId, action, detail, actorName, createdAt }) => ({ id: eventId, action, detail, actorName, createdAt }))} />

      <Reveal className="grid-main mt">
        <div className="card"><div className="card-title"><div><h3>Monthly books</h3><div className="sub">Income and expenses for {record.report.taxYear}</div></div></div><BarChart data={months} series={[{ name: "Income", color: PALETTE.teal }, { name: "Expenses", color: PALETTE.gold }]} format={moneyCents} label="Monthly books" /></div>
        <div className="card"><div className="card-title"><div><h3>Category concentration</h3><div className="sub">Largest ledger categories</div></div></div>{categories.length ? <HBars items={categories} format={moneyCents} /> : <p className="small muted">No categorized activity.</p>}</div>
      </Reveal>

      <Reveal className="card mt" delay={80}>
        <div className="card-title"><div><h3>Source record review</h3><div className="sub">Every adjusted ledger entry, with reconciliation and receipt evidence</div></div><span className="pill info">{record.entries.length} entries</span></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th className="num">Amount</th><th>Bank match</th><th>Receipt</th><th>Correction</th></tr></thead><tbody>
          {record.entries.map((entry) => <tr key={entry.id}><td>{entry.date}</td><td><span className={`pill ${entry.kind === "income" ? "up" : "warn"}`}>{entry.kind}</span></td><td>{entry.category}</td><td className="small">{entry.description || "—"}</td><td className={`num ${entry.kind === "income" ? "pos-text" : ""}`}><b>{moneyCents(entry.amountCents)}</b></td><td>{entry.matched ? <span className="badge s-COMPLETED">Matched</span> : <span className="pill warn">Open</span>}</td><td>{entry.hasReceipt ? <span className="badge s-COMPLETED">Attached</span> : <span className="pill">Missing</span>}</td><td>{entry.corrected ? <span className="pill info">Adjusted</span> : "—"}</td></tr>)}
          {!record.entries.length && <tr><td colSpan={8} className="center muted">No ledger entries were included in this handoff.</td></tr>}
        </tbody></table></div>
      </Reveal>

      <div className="grid-2 mt">
        <div className="card"><h3>Submitted snapshot</h3><div className="business-audit-list"><span><b>{record.report.report?.entryCount || 0}</b><small>Entries at submission</small></span><span><b>{record.report.report?.matchedCount || 0}</b><small>Matched at submission</small></span><span><b>{record.report.report?.correctionCount || 0}</b><small>Corrections at submission</small></span></div><p className="tiny muted mt-sm">{record.report.report?.disclaimer || "Bookkeeping figures remain subject to preparer review."}</p></div>
        <div className="card"><h3>Case audit trail</h3><div className="business-case-timeline"><div><b>Submitted by client</b><small>{date(record.report.createdAt)}</small></div>{record.report.reviewedAt && <div><b>Review started</b><small>{date(record.report.reviewedAt)}</small></div>}<div><b>Last management update</b><small>{date(record.report.updatedAt || record.report.createdAt)}</small></div></div></div>
      </div>
    </>
  );
}
