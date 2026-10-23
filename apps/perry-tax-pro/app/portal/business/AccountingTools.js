"use client";

import { useEffect, useState } from "react";

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

  function applyAccounting(data) {
    setEntries(data.entries);
    setReport(data.report);
  }

  useEffect(() => {
    let cancelled = false;
    fetchAccounting(year)
      .then((data) => { if (!cancelled) applyAccounting(data); })
      .catch((error) => { if (!cancelled) setNotice(error.message); });
    return () => { cancelled = true; };
  }, [year]);

  async function send(route, data) {
    try {
      const response = await fetch(`/api/business/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice("Saved");
      applyAccounting(await fetchAccounting(year));
    } catch (error) {
      setNotice(error.message);
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
      setFile(null);
    } catch (error) {
      setNotice(error.message);
    }
  }

  return <main><h1>Accounting & year-end review</h1><p>Manual bookkeeping and tax handoff; preparer verification required.</p><label>Year <input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
    {report && <p>Income: ${(report.incomeCents / 100).toFixed(2)} · Expenses: ${(report.expenseCents / 100).toFixed(2)} · Net: ${(report.netCents / 100).toFixed(2)} · Matched: {report.matchedCount}</p>}
    <button className="btn btn-primary" onClick={() => send("year-end", { year })}>Send annual snapshot to preparer</button>
    <div className="card mt"><h2>Select entry</h2><select className="select" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Select</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.date} {entry.description} ${(entry.amountCents / 100).toFixed(2)}</option>)}</select></div>
    <div className="card mt"><h2>Correction</h2><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select><input placeholder="Category" value={category} onChange={(event) => setCategory(event.target.value)} /><input placeholder="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} /><input placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} /><button className="btn" disabled={!selected} onClick={() => send("corrections", { entryId: selected, kind, category, amount, reason })}>Record correction</button></div>
    <div className="card mt"><h2>Bank match</h2><input placeholder="Statement reference" value={reference} onChange={(event) => setReference(event.target.value)} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><button className="btn" disabled={!selected} onClick={() => send("reconciliation", { entryId: selected, bankReference: reference, statementDate: date })}>Match manually</button></div>
    <div className="card mt"><h2>Expense receipt</h2><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} /><button className="btn" disabled={!selected || !file} onClick={uploadReceipt}>Upload receipt</button></div><p role="status">{notice}</p></main>;
}
