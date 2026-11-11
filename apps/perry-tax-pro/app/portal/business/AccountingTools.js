"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { MoneyCount, NumberCount } from "@/components/Motion";
import { BarChart, Legend, ProgressRing, PALETTE } from "@/components/charts";
import { monthlyLedger } from "@/lib/analytics";

async function fetchAccounting(year) {
  const [entriesResponse, reportResponse] = await Promise.all([
    fetch(`/api/business/entries?year=${year}`, { cache: "no-store" }),
    fetch(`/api/business/year-end?year=${year}`, { cache: "no-store" }),
  ]);
  const [entriesBody, reportBody] = await Promise.all([entriesResponse.json(), reportResponse.json()]);
  if (!entriesResponse.ok) throw new Error(entriesBody.error || "Unable to load entries");
  if (!reportResponse.ok) throw new Error(reportBody.error || "Unable to load year-end report");
  return { entries: entriesBody.entries || [], report: reportBody };
}

export default function AccountingTools() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState([]);
  const [report, setReport] = useState(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Supplies");
  const [kind, setKind] = useState("expense");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState(null);
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const months = useMemo(() => monthlyLedger(entries, year), [entries, year]);

  function applyAccounting(data) {
    setEntries(data.entries);
    setReport(data.report);
  }

  useEffect(() => {
    let cancelled = false;
    fetchAccounting(year)
      .then((data) => { if (!cancelled) applyAccounting(data); })
      .catch((error) => { if (!cancelled) { setNotice(error.message); setNoticeOk(false); } });
    return () => { cancelled = true; };
  }, [year]);

  async function send(route, data) {
    try {
      const response = await fetch(`/api/business/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice("Saved");
      setNoticeOk(true);
      applyAccounting(await fetchAccounting(year));
    } catch (error) {
      setNotice(error.message);
      setNoticeOk(false);
    }
  }

  async function uploadReceipt() {
    if (!selected || !file) return;
    const form = new FormData();
    form.append("entryId", selected);
    form.append("file", file);
    try {
      const response = await fetch("/api/business/receipts", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice("Receipt saved");
      setNoticeOk(true);
      setFile(null);
    } catch (error) {
      setNotice(error.message);
      setNoticeOk(false);
    }
  }

  const current = entries.find((entry) => entry.id === selected);
  const matchedRatio = report && entries.length ? Math.min(1, report.matchedCount / entries.length) : 0;
  const kusd = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);

  return <>
    <div className="page-head">
      <div><div className="kicker"><Icon name="book" size={15} /> Accounting</div><h1>Accounting & year-end review</h1><p className="desc small">Manual bookkeeping and tax handoff; preparer verification required.</p></div>
      <div className="row">
        <div className="field" style={{ width: 120 }}><label htmlFor="acc-year">Year</label><input id="acc-year" className="input num" type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} /></div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-end" }} onClick={() => send("year-end", { year })}><Icon name="send" size={16} /> Send annual snapshot to preparer</button>
      </div>
    </div>

    <div className="grid-4 stagger">
      <div className="card kpi card-hover"><div className="kpi-head"><div className="lbl">Income</div><span className="kpi-icon green"><Icon name="trending" size={18} /></span></div><div className="val pos-text">{report ? <MoneyCount value={report.incomeCents} cents /> : "—"}</div></div>
      <div className="card kpi card-hover"><div className="kpi-head"><div className="lbl">Expenses</div><span className="kpi-icon rose"><Icon name="receipt" size={18} /></span></div><div className="val neg-text">{report ? <MoneyCount value={report.expenseCents} cents /> : "—"}</div></div>
      <div className="card kpi card-hover"><div className="kpi-head"><div className="lbl">Net</div><span className="kpi-icon"><Icon name="wallet" size={18} /></span></div><div className="val">{report ? <MoneyCount value={report.netCents} cents signed /> : "—"}</div></div>
      <div className="card kpi card-hover row nowrap" style={{ justifyContent: "space-between" }}>
        <div><div className="lbl">Bank-matched</div><div className="val">{report ? <NumberCount value={report.matchedCount} /> : "—"}</div><div className="small muted">of {entries.length} entries</div></div>
        <ProgressRing value={matchedRatio} size={70} thickness={8} label="Reconciled share" />
      </div>
    </div>

    <div className="card mt">
      <div className="card-title"><div><h3>Monthly activity</h3><div className="sub">Income versus expenses · {year}</div></div><Legend items={[{ label: "Income", color: PALETTE.teal }, { label: "Expenses", color: PALETTE.blue }]} /></div>
      <BarChart key={year} data={months.map((m) => ({ label: m.label, values: [m.income / 100, m.expense / 100] }))} series={[{ name: "Income", color: PALETTE.teal }, { name: "Expenses", color: PALETTE.blue }]} height={210} format={kusd} label="Monthly income and expenses" />
    </div>

    <div className="card mt">
      <div className="card-title"><div className="row nowrap"><span className="kpi-icon violet"><Icon name="target" size={18} /></span><div><h3>Select entry</h3><div className="sub">Corrections, bank matches and receipts apply to the selected entry</div></div></div></div>
      <select className="select" aria-label="Ledger entry" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Select</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.date} {entry.description} ${(entry.amountCents / 100).toFixed(2)}</option>)}</select>
      {current && <div className="ledger-row fade-in" style={{ borderBottom: 0, marginTop: 8 }}>
        <span className={`ledger-ico ${current.kind === "expense" ? "out" : "in"}`}><Icon name={current.kind === "expense" ? "receipt" : "trending"} size={16} /></span>
        <div><b>{current.description || current.category}</b><div className="hint">{current.date} · {current.category}</div></div>
        <b className={current.kind === "expense" ? "neg-text" : "pos-text"}>{current.kind === "expense" ? "-" : "+"}${(current.amountCents / 100).toFixed(2)}</b>
      </div>}
    </div>

    <div className="grid-3 mt">
      <div className="card stack">
        <div className="row nowrap"><span className="kpi-icon gold"><Icon name="pen" size={18} /></span><h3 style={{ margin: 0 }}>Correction</h3></div>
        <div className="kind-toggle" role="radiogroup" aria-label="Correction type">
          <button type="button" role="radio" aria-checked={kind === "expense"} className={`expense ${kind === "expense" ? "on" : ""}`} onClick={() => setKind("expense")}>Expense</button>
          <button type="button" role="radio" aria-checked={kind === "income"} className={`income ${kind === "income" ? "on" : ""}`} onClick={() => setKind("income")}>Income</button>
        </div>
        <div className="field"><label htmlFor="cr-category">Category</label><input id="cr-category" className="input" placeholder="Category" value={category} onChange={(event) => setCategory(event.target.value)} /></div>
        <div className="field"><label htmlFor="cr-amount">Amount</label><input id="cr-amount" className="input num" placeholder="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="field"><label htmlFor="cr-reason">Reason</label><input id="cr-reason" className="input" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <button className="btn btn-ghost" disabled={!selected} onClick={() => send("corrections", { entryId: selected, kind, category, amount, reason })}>Record correction</button>
      </div>
      <div className="card stack">
        <div className="row nowrap"><span className="kpi-icon"><Icon name="bank" size={18} /></span><h3 style={{ margin: 0 }}>Bank match</h3></div>
        <div className="field"><label htmlFor="bm-ref">Statement reference</label><input id="bm-ref" className="input" placeholder="Statement reference" value={reference} onChange={(event) => setReference(event.target.value)} /></div>
        <div className="field"><label htmlFor="bm-date">Statement date</label><input id="bm-date" className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <button className="btn btn-ghost" style={{ marginTop: "auto" }} disabled={!selected} onClick={() => send("reconciliation", { entryId: selected, bankReference: reference, statementDate: date })}><Icon name="link" size={16} /> Match manually</button>
      </div>
      <div className="card stack">
        <div className="row nowrap"><span className="kpi-icon teal"><Icon name="upload" size={18} /></span><h3 style={{ margin: 0 }}>Expense receipt</h3></div>
        <label className="dropzone" style={{ padding: 22 }}>
          <div className="icon-badge teal sm" style={{ margin: "0 auto 8px" }}><Icon name="file" size={18} /></div>
          <span className="small" style={{ color: "var(--text)", fontWeight: 600 }}>{file ? file.name : "Choose PDF, JPG or PNG"}</span>
          <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <button className="btn btn-ghost" style={{ marginTop: "auto" }} disabled={!selected || !file} onClick={uploadReceipt}>Upload receipt</button>
      </div>
    </div>
    <div className="row mt between">
      <Link href="/portal/business" className="btn btn-ghost btn-sm"><Icon name="back" size={15} /> Business overview</Link>
      <p role="status" className="small">{notice && <span className={noticeOk ? "pos-text" : "neg-text"} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name={noticeOk ? "check" : "alert"} size={14} />{notice}</span>}</p>
    </div>
  </>;
}
