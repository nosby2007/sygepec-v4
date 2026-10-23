"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BUSINESS_CATEGORIES, summarizeBusiness } from "@/lib/business";
import { monthlyLedger } from "@/lib/analytics";
import Icon from "@/components/Icon";
import { MoneyCount } from "@/components/Motion";
import { BarChart, Donut, HBars, Legend, Sparkline, PALETTE, SERIES } from "@/components/charts";
import { ChartEmpty, Empty } from "@/components/ui";

const usd = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const kusd = (dollars) => (dollars >= 1000 ? `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k` : `$${Math.round(dollars)}`);

async function fetchEntries(year) {
  const response = await fetch(`/api/business/entries?year=${year}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body.entries || [];
}

export default function BusinessLedger() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ kind: "expense", category: "Supplies", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const totals = useMemo(() => summarizeBusiness(entries), [entries]);
  const months = useMemo(() => monthlyLedger(entries, year), [entries, year]);
  const expenseMix = useMemo(() => Object.entries(totals.byCategory)
    .filter(([key]) => key.startsWith("expense:"))
    .map(([key, cents], i) => ({ label: key.slice(8), value: cents / 100, color: SERIES[i % SERIES.length] }))
    .sort((a, b) => b.value - a.value), [totals]);
  const incomeMix = useMemo(() => Object.entries(totals.byCategory)
    .filter(([key]) => key.startsWith("income:"))
    .map(([key, cents]) => ({ label: key.slice(7), value: cents / 100 }))
    .sort((a, b) => b.value - a.value), [totals]);
  const margin = totals.incomeCents ? Math.round((totals.netCents / totals.incomeCents) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    fetchEntries(year)
      .then((rows) => { if (!cancelled) { setEntries(rows); setLoaded(true); } })
      .catch((reason) => { if (!cancelled) { setError(reason.message || "Unable to load entries"); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [year]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/business/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setForm({ ...form, amount: "", description: "" });
      setEntries(await fetchEntries(year));
      setSaved(true);
    } catch (reason) {
      setError(reason.message || "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const rows = [["Date", "Type", "Category", "Description", "Amount USD"], ...entries.map((entry) => [entry.date, entry.kind, entry.category, entry.description, (entry.amountCents / 100).toFixed(2)])];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.href = url;
    link.download = `business-ledger-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const kind = (k) => setForm({ ...form, kind: k, category: BUSINESS_CATEGORIES[k][0] });

  return <>
    <section className="page-banner">
      <div>
        <div className="kicker"><Icon name="briefcase" size={14} /> InnovaCare Business · dedicated service</div>
        <h1>Your daily business workspace</h1>
        <p style={{ marginTop: 8 }}>Manage operations throughout the year. This workspace is separate from the personal tax-return portal.</p>
        <div className="banner-stats">
          <div><b><MoneyCount value={totals.incomeCents} cents /></b><span>Income {year}</span></div>
          <div><b><MoneyCount value={totals.expenseCents} cents /></b><span>Expenses {year}</span></div>
          <div><b><MoneyCount value={totals.netCents} cents signed /></b><span>Net before adjustments</span></div>
        </div>
      </div>
      <div className="stack-sm" style={{ minWidth: 180 }}>
        <label className="small" htmlFor="ledger-year" style={{ color: "rgba(225,239,255,.75)", fontWeight: 600 }}>Tax year</label>
        <select id="ledger-year" className="select" value={year} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - index).map((value) => <option key={value}>{value}</option>)}</select>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv}><Icon name="download" size={15} /> Export CSV</button>
      </div>
    </section>

    <div className="grid-3 stagger">
      {[
        ["users", "teal", "Customers & retention", "Keep customer details and follow-up notes together.", "/portal/business/customers", "Manage customers"],
        ["receipt", "", "Services & billing", "Organize services, appointments and draft invoices.", "/portal/business/workspace", "Open operations"],
        ["book", "violet", "Accounting & tax handoff", "Reconcile activity and prepare year-end records.", "/portal/business/accounting", "Open accounting"],
      ].map(([icon, tone, title, text, href, cta]) => (
        <div key={href} className="card module-card card-hover">
          <div className={`icon-badge ${tone}`}><Icon name={icon} size={22} /></div>
          <h3>{title}</h3>
          <p className="small">{text}</p>
          <Link href={href} className="btn btn-ghost btn-sm">{cta} <Icon name="arrow" size={14} className="icon-arrow" /></Link>
        </div>
      ))}
    </div>

    <div className="grid-4 mt">
      {[
        ["Income", totals.incomeCents, "trending", "green", months.map((m) => m.income), PALETTE.green],
        ["Expenses", totals.expenseCents, "receipt", "rose", months.map((m) => m.expense), PALETTE.rose],
        ["Net before adjustments", totals.netCents, "wallet", "", months.map((m) => m.income - m.expense), PALETTE.blue],
      ].map(([label, cents, icon, tone, spark, color]) => (
        <div key={label} className="card kpi card-hover">
          <div className="kpi-head"><div className="lbl">{label}</div><span className={`kpi-icon ${tone}`}><Icon name={icon} size={18} /></span></div>
          <div className={`val ${label === "Net before adjustments" && cents < 0 ? "neg-text" : ""}`}><MoneyCount value={cents} cents signed={label.startsWith("Net")} /></div>
          <div className="kpi-foot"><span className="small muted">{year}</span>{entries.length > 0 && <Sparkline values={spark} color={color} width={96} height={30} />}</div>
        </div>
      ))}
      <div className="card kpi card-hover">
        <div className="kpi-head"><div className="lbl">Net margin</div><span className="kpi-icon teal"><Icon name="target" size={18} /></span></div>
        <div className="val">{margin}%</div>
        <div className="meter"><span style={{ width: `${Math.max(0, Math.min(100, margin))}%` }} /></div>
      </div>
    </div>

    <div className="grid-main mt">
      <div className="card">
        <div className="card-title">
          <div><h3>Cash flow by month</h3><div className="sub">Income versus expenses · {year}</div></div>
          <Legend items={[{ label: "Income", color: PALETTE.teal }, { label: "Expenses", color: PALETTE.blue }]} />
        </div>
        {entries.length
          ? <BarChart key={year} data={months.map((m) => ({ label: m.label, values: [m.income / 100, m.expense / 100] }))} series={[{ name: "Income", color: PALETTE.teal }, { name: "Expenses", color: PALETTE.blue }]} height={240} format={kusd} label="Monthly income and expenses" />
          : <ChartEmpty icon="bars">{loaded ? "Record your first transaction to see monthly cash flow." : "Loading…"}</ChartEmpty>}
      </div>
      <div className="card">
        <div className="card-title"><div><h3>Expense mix</h3><div className="sub">By bookkeeping category</div></div></div>
        {expenseMix.length ? (
          <div className="donut-wrap" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "grid", placeItems: "center" }}>
              <Donut key={year} size={160} thickness={20} segments={expenseMix.map((x) => ({ ...x, display: kusd(x.value) }))} center={kusd(totals.expenseCents / 100)} sub="total expenses" label="Expense categories" />
            </div>
            <div className="legend vertical">{expenseMix.slice(0, 5).map((x) => <span key={x.label}><i style={{ background: x.color }} />{x.label}<b>{kusd(x.value)}</b></span>)}</div>
          </div>
        ) : <ChartEmpty icon="receipt">No expenses recorded for {year}</ChartEmpty>}
      </div>
    </div>

    <div className="grid-main mt" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)" }}>
      <div className="card">
        <div className="card-title"><div className="row nowrap"><span className="kpi-icon"><Icon name="plus" size={18} /></span><h3>New transaction</h3></div></div>
        <form onSubmit={save} className="stack">
          <div className="kind-toggle" role="radiogroup" aria-label="Transaction type">
            <button type="button" role="radio" aria-checked={form.kind === "income"} className={`income ${form.kind === "income" ? "on" : ""}`} onClick={() => kind("income")}><Icon name="trending" size={16} /> Income</button>
            <button type="button" role="radio" aria-checked={form.kind === "expense"} className={`expense ${form.kind === "expense" ? "on" : ""}`} onClick={() => kind("expense")}><Icon name="receipt" size={16} /> Expense</button>
          </div>
          <div className="form-grid">
            <div className="field"><label htmlFor="tx-category">Category</label><select id="tx-category" className="select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{BUSINESS_CATEGORIES[form.kind].map((category) => <option key={category}>{category}</option>)}</select></div>
            <div className="field"><label htmlFor="tx-date">Date</label><input id="tx-date" className="input" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div>
            <div className="field full"><label htmlFor="tx-amount">Amount USD</label><div className="input-icon"><Icon name="dollar" size={16} /><input id="tx-amount" className="input num" inputMode="decimal" required placeholder="0.00" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></div></div>
            <div className="field full"><label htmlFor="tx-description">Description</label><input id="tx-description" className="input" maxLength={300} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          </div>
          {error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
          {saved && <div className="alert alert-success"><Icon name="check" size={16} />Transaction saved</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Saving…" : "Save transaction"}</button>
        </form>
      </div>
      <div className="card">
        <div className="card-title">
          <div><h3>Year-end summary</h3><div className="sub">Transactions ({entries.length})</div></div>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}><Icon name="download" size={15} /> Export CSV</button>
        </div>
        <p className="small">Provide this summary and supporting records to your tax preparer. Expense categories are bookkeeping labels, not a determination of tax deductibility.</p>
        {incomeMix.length > 0 && <div className="mt-sm"><HBars items={incomeMix.map((x) => ({ ...x, color: PALETTE.teal }))} format={(v) => usd(v * 100)} /></div>}
        <div className="mt-sm" style={{ maxHeight: 360, overflowY: "auto" }}>
          {entries.length === 0 && <Empty icon="receipt" title="No transactions yet">Use the form to record income or an expense.</Empty>}
          {entries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((entry) => (
            <div className="ledger-row" key={entry.id}>
              <span className={`ledger-ico ${entry.kind === "expense" ? "out" : "in"}`}><Icon name={entry.kind === "expense" ? "receipt" : "trending"} size={16} /></span>
              <div style={{ minWidth: 0 }}><b className="truncate" style={{ display: "block" }}>{entry.description || entry.category}</b><span className="hint">{entry.date} · {entry.category}</span></div>
              <b className={`num ${entry.kind === "expense" ? "neg-text" : "pos-text"}`}>{entry.kind === "expense" ? "-" : "+"}{usd(entry.amountCents)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="glass mt row nowrap" style={{ padding: 22, alignItems: "flex-start" }}>
      <div className="icon-badge rose" style={{ margin: 0 }}><Icon name="megaphone" size={22} /></div>
      <div><span className="eyebrow">Marketing support</span><h3 style={{ marginTop: 8 }}>Client growth and retention</h3><p className="small">Campaign planning and automated follow-up are planned additions. Your customer directory is the secure foundation; no marketing message is sent automatically today.</p></div>
    </div>
  </>;
}
