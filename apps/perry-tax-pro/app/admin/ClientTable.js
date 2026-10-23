"use client";
import { useState } from "react";
import Link from "next/link";
import { STATUSES, money } from "@/lib/constants";
import { StatusBadge } from "@/components/Status";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";

export default function ClientTable({ rows }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const filtered = rows.filter(
    (r) =>
      (status === "ALL" || r.status === status) &&
      (r.client_name + r.client_email).toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="card mt">
      <div className="row between" style={{ marginBottom: 18 }}>
        <input id="client-search" className="input" style={{ maxWidth: 320 }} placeholder="🔍 Search clients…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row">
          {[{ key: "ALL", label: "All" }, ...STATUSES].map((s) => (
            <button key={s.key} className={`btn btn-sm ${status === s.key ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Client</th><th>Tax year</th><th>Status</th><th>Signature</th><th>E-file</th><th>Docs</th><th>Est. Refund</th><th>Preparer</th><th /></tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><b>{r.client_name}</b><div className="hint">{r.client_email}</div></td>
                <td><b>{r.tax_year}</b></td>
                <td><StatusBadge status={r.status} /></td>
                <td><SignatureBadge status={r.signature_status} /></td>
                <td><SubmissionBadge status={r.submission_status} /></td>
                <td>{r.doc_count}</td>
                <td style={{ color: r.refund == null ? "var(--faint)" : r.refund >= 0 ? "var(--teal)" : "var(--rose)" }}>
                  {r.refund == null ? "—" : (r.refund < 0 ? "−" : "") + money(Math.abs(r.refund))}
                </td>
                <td className="small">{r.preparer_name || <span className="muted">Unassigned</span>}</td>
                <td><Link href={`/admin/returns/${r.id}`} className="btn btn-ghost btn-sm">Open →</Link></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="center muted">No matching returns</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
