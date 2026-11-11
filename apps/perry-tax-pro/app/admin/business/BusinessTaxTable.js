"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";

const usd = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((cents || 0) / 100);

export default function BusinessTaxTable({ rows, statuses }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [year, setYear] = useState("ALL");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const years = useMemo(() => [...new Set(rows.map((row) => row.taxYear))].sort((a, b) => b - a), [rows]);
  const filtered = rows.filter((row) => {
    const text = `${row.clientName} ${row.clientEmail}`.toLowerCase();
    return (status === "ALL" || row.status === status) && (year === "ALL" || row.taxYear === Number(year)) && text.includes(query.toLowerCase());
  });

  async function quickStatus(row, nextStatus) {
    if (!row.id) return;
    setBusyId(row.id); setError("");
    const response = await fetch(`/api/admin/business/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
    const body = await response.json().catch(() => ({}));
    setBusyId("");
    if (!response.ok) return setError(body.error || "The status could not be saved.");
    router.refresh();
  }

  return (
    <div className="card mt">
      <div className="card-title">
        <div><h3>Business tax cases</h3><div className="sub">{filtered.length} of {rows.length} client-year records</div></div>
        <div className="row"><select className="select" aria-label="Filter tax year" value={year} onChange={(event) => setYear(event.target.value)}><option value="ALL">All tax years</option>{years.map((value) => <option key={value}>{value}</option>)}</select><div className="input-icon"><Icon name="search" size={16} /><input className="input" aria-label="Search businesses" placeholder="Search businesses…" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="seg" style={{ marginBottom: 16 }}>
        {[{ key: "ALL", label: "All" }, { key: "DRAFT", label: "Awaiting" }, ...statuses].map((item) => <button key={item.key} className={status === item.key ? "on" : ""} onClick={() => setStatus(item.key)}>{item.label}<span className="count">{item.key === "ALL" ? rows.length : rows.filter((row) => row.status === item.key).length}</span></button>)}
      </div>
      <div className="table-wrap"><table><thead><tr><th>Business</th><th>Year</th><th>Status</th><th className="num">Income</th><th className="num">Expenses</th><th>Books readiness</th><th>Evidence</th><th>Priority</th><th /></tr></thead><tbody>
        {filtered.map((row) => <tr key={`${row.clientId}-${row.taxYear}`}><td><div className="person"><Avatar name={row.clientName} size="sm" /><div><b>{row.clientName}</b><div className="hint">{row.clientEmail || row.clientId}</div></div></div></td><td><b>{row.taxYear}</b></td><td>{row.id ? <select className="select compact" disabled={busyId === row.id} aria-label={`Status for ${row.clientName}`} value={row.status} onChange={(event) => quickStatus(row, event.target.value)}>{statuses.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select> : <span className="pill warn">Awaiting handoff</span>}</td><td className="num pos-text"><b>{usd(row.incomeCents)}</b></td><td className="num"><b>{usd(row.expenseCents)}</b></td><td><div className="readiness-cell"><div className="meter"><span style={{ width: `${row.readiness}%` }} /></div><small>{row.readiness}%</small></div></td><td className="small"><b>{row.receiptCount}</b> receipts · <b>{row.matchedCount}/{row.entryCount}</b> matched</td><td><span className={`pill ${row.priority === "URGENT" ? "down" : row.priority === "HIGH" ? "warn" : ""}`}>{row.priority.toLowerCase()}</span></td><td>{row.id ? <Link href={`/admin/business/${row.id}`} className="btn btn-ghost btn-sm">Review <Icon name="arrow" size={14} /></Link> : <span className="tiny muted">Client must submit</span>}</td></tr>)}
        {!filtered.length && <tr><td colSpan={9}><Empty icon="search" title="No matching business cases">Adjust the year, status or search filter.</Empty></td></tr>}
      </tbody></table></div>
    </div>
  );
}
