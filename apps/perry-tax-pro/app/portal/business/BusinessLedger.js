"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BUSINESS_CATEGORIES, summarizeBusiness } from "@/lib/business";

const usd = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

async function fetchEntries(year) {
  const response = await fetch(`/api/business/entries?year=${year}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body.entries || [];
}

export default function BusinessLedger() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ kind: "expense", category: "Supplies", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const totals = useMemo(() => summarizeBusiness(entries), [entries]);

  useEffect(() => {
    let cancelled = false;
    fetchEntries(year)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch((reason) => { if (!cancelled) setError(reason.message || "Unable to load entries"); });
    return () => { cancelled = true; };
  }, [year]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/business/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setForm({ ...form, amount: "", description: "" });
      setEntries(await fetchEntries(year));
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

  return <main>
    <div className="page-head"><div><p className="small">InnovaCare Business · dedicated service</p><h1>Your daily business workspace</h1><p className="muted">Manage operations throughout the year. This workspace is separate from the personal tax-return portal.</p></div></div>
    <div className="grid-3">
      <div className="card"><h3>Customers & retention</h3><p className="small">Keep customer details and follow-up notes together.</p><Link href="/portal/business/customers" className="btn">Manage customers →</Link></div>
      <div className="card"><h3>Services & billing</h3><p className="small">Organize services, appointments and draft invoices.</p><Link href="/portal/business/workspace" className="btn">Open operations →</Link></div>
      <div className="card"><h3>Accounting & tax handoff</h3><p className="small">Reconcile activity and prepare year-end records.</p><Link href="/portal/business/accounting" className="btn">Open accounting →</Link></div>
    </div>
    <div className="glass mt" style={{ padding: 22 }}><span className="eyebrow">Marketing support</span><h3>Client growth and retention</h3><p className="small">Campaign planning and automated follow-up are planned additions. Your customer directory is the secure foundation; no marketing message is sent automatically today.</p></div>
    <div className="card mt"><label>Tax year <select className="select" value={year} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - index).map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="grid-3 mt"><div className="card kpi"><div className="lbl">Income</div><div className="val">{usd(totals.incomeCents)}</div></div><div className="card kpi"><div className="lbl">Expenses</div><div className="val">{usd(totals.expenseCents)}</div></div><div className="card kpi"><div className="lbl">Net before adjustments</div><div className="val">{usd(totals.netCents)}</div></div></div>
    <div className="card mt"><h2>New transaction</h2><form onSubmit={save}>
      <div className="grid-2"><label>Type<select className="select" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value, category: BUSINESS_CATEGORIES[event.target.value][0] })}><option value="income">Income</option><option value="expense">Expense</option></select></label>
        <label>Category<select className="select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{BUSINESS_CATEGORIES[form.kind].map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Date<input className="input" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label>Amount USD<input className="input" inputMode="decimal" required placeholder="0.00" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></div>
      <label>Description<input className="input" maxLength={300} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      {error && <p role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save transaction"}</button></form></div>
    <div className="card mt"><div className="row between"><h2>Year-end summary</h2><button className="btn" onClick={exportCsv}>Export CSV</button></div>
      <p className="small">Provide this summary and supporting records to your tax preparer. Expense categories are bookkeeping labels, not a determination of tax deductibility.</p>
      {Object.entries(totals.byCategory).sort().map(([category, amount]) => <div className="row between" key={category}><span>{category}</span><strong>{usd(amount)}</strong></div>)}
      <h3>Transactions ({entries.length})</h3>{entries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((entry) => <div className="row between" key={entry.id}><span>{entry.date} · {entry.category} · {entry.description}</span><b>{entry.kind === "expense" ? "-" : "+"}{usd(entry.amountCents)}</b></div>)}</div>
  </main>;
}
