import { requireRole, getFirebaseSession } from "@/lib/auth";
import { loadBusinessTaxWorkspace, BUSINESS_TAX_STATUSES } from "@/lib/business-admin";
import { monthlyLedger } from "@/lib/analytics";
import { BarChart, Donut, HBars, PALETTE } from "@/components/charts";
import { MoneyCount, NumberCount, Reveal } from "@/components/Motion";
import { ChartEmpty, Kpi, PageHead } from "@/components/ui";
import Icon from "@/components/Icon";
import BusinessTaxTable from "./BusinessTaxTable";

export const metadata = { title: "Business Tax Management" };

const moneyCents = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((value || 0) / 100);

export default async function BusinessTaxPage() {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  const data = await loadBusinessTaxWorkspace(session);
  const yearRows = data.rows.filter((row) => row.taxYear === data.currentYear);
  const yearEntries = data.entries.filter((entry) => entry.taxYear === data.currentYear);
  const monthly = monthlyLedger(yearEntries, data.currentYear).map((month) => ({ label: month.label, values: [month.income, month.expense] }));
  const incomeCents = yearRows.reduce((sum, row) => sum + row.incomeCents, 0);
  const expenseCents = yearRows.reduce((sum, row) => sum + row.expenseCents, 0);
  const submitted = data.rows.filter((row) => row.id);
  const needsInfo = submitted.filter((row) => row.status === "NEEDS_INFO").length;
  const taxReady = submitted.filter((row) => ["READY_FOR_PREPARATION", "COMPLETED"].includes(row.status)).length;
  const unmatched = yearRows.reduce((sum, row) => sum + Math.max(0, row.entryCount - row.matchedCount), 0);
  const statusSegments = [
    { label: "Draft", value: data.rows.filter((row) => row.status === "DRAFT").length, color: PALETTE.slate },
    ...BUSINESS_TAX_STATUSES.map((status) => ({ ...status, value: data.rows.filter((row) => row.status === status.key).length })),
  ];
  const readiness = [
    { label: "Tax-ready / completed", value: taxReady, color: PALETTE.green },
    { label: "In review", value: submitted.filter((row) => row.status === "IN_REVIEW").length, color: PALETTE.blue },
    { label: "Needs information", value: needsInfo, color: PALETTE.rose },
    { label: "Awaiting handoff", value: data.rows.filter((row) => row.status === "DRAFT").length, color: PALETTE.gold },
  ];

  return (
    <>
      <PageHead kicker="Business tax operations" icon="building" title="Business Tax Management" desc={`Year-round oversight for ${data.businesses.length} business client${data.businesses.length === 1 ? "" : "s"}: books, evidence, reconciliation and tax handoff.`}>
        <span className="pill info"><Icon name="clock" size={13} /> Tax year {data.currentYear}</span>
      </PageHead>

      <div className="grid-4 stagger">
        <Kpi label="Business clients" icon="building" value={<NumberCount value={data.businesses.length} />} foot={`${submitted.length} year-end handoffs`} />
        <Kpi label="Gross income tracked" icon="trending" tone="teal" value={<MoneyCount value={incomeCents} cents />} foot={`Across ${yearRows.length} active books`} />
        <Kpi label="Expenses tracked" icon="receipt" tone="gold" value={<MoneyCount value={expenseCents} cents />} foot={`${unmatched} unreconciled transaction${unmatched === 1 ? "" : "s"}`} />
        <Kpi label="Tax-ready cases" icon="shield" tone="green" value={<NumberCount value={taxReady} />} foot={needsInfo ? `${needsInfo} waiting on information` : "No information holds"} />
      </div>

      <Reveal className="grid-main mt">
        <div className="card">
          <div className="card-title"><div><h3>Income vs. expenses</h3><div className="sub">Monthly business activity · {data.currentYear}</div></div><span className="pill up">Net {moneyCents(incomeCents - expenseCents)}</span></div>
          {yearEntries.length ? <BarChart data={monthly} series={[{ name: "Income", color: PALETTE.teal }, { name: "Expenses", color: PALETTE.gold }]} format={moneyCents} label="Monthly business income and expenses" /> : <ChartEmpty>No ledger activity for {data.currentYear}</ChartEmpty>}
        </div>
        <div className="card">
          <div className="card-title"><div><h3>Case distribution</h3><div className="sub">Every business and tax year</div></div></div>
          <div className="donut-wrap">
            <Donut size={154} thickness={18} segments={statusSegments} center={data.rows.length} sub="cases" label="Business tax case status" />
            <div className="legend vertical">{statusSegments.map((segment) => <span key={segment.label}><i style={{ background: segment.color }} />{segment.label}<b>{segment.value}</b></span>)}</div>
          </div>
        </div>
      </Reveal>

      <Reveal className="grid-main mt" delay={90}>
        <div className="card">
          <div className="card-title"><div><h3>Readiness pipeline</h3><div className="sub">Operational attention by stage</div></div></div>
          <HBars items={readiness} />
        </div>
        <div className="card">
          <div className="card-title"><div><h3>Business tax workflow</h3><div className="sub">One controlled path from daily books to preparation</div></div></div>
          <div className="business-tax-flow" aria-label="Business tax management workflow">
            {[["book", "Daily books", "Income, expenses and receipts"], ["bank", "Reconcile", "Match bank activity"], ["clipboard", "Review", "Resolve exceptions"], ["shield", "Tax ready", "Approved handoff"]].map(([icon, title, text], index) => <div key={title} className="business-tax-node"><span><Icon name={icon} size={18} /></span><div><b>{title}</b><small>{text}</small></div>{index < 3 && <Icon name="arrow" size={15} className="business-tax-arrow" />}</div>)}
          </div>
        </div>
      </Reveal>

      <BusinessTaxTable rows={data.rows} statuses={BUSINESS_TAX_STATUSES} />
    </>
  );
}
