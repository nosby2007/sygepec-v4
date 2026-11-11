"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { STATUSES, money } from "@/lib/constants";
import { StatusBadge } from "@/components/Status";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";
import Icon from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";

export default function ClientTable({ rows }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const counts = useMemo(() => rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}), [rows]);
  const filtered = rows.filter(
    (r) =>
      (status === "ALL" || r.status === status) &&
      (r.client_name + r.client_email).toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="card mt">
      <div className="card-title">
        <div><h3>All returns</h3><div className="sub">{filtered.length} of {rows.length} shown</div></div>
        <div className="input-icon" style={{ width: "min(320px, 100%)" }}>
          <Icon name="search" size={16} />
          <input id="client-search" className="input" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="seg" style={{ marginBottom: 16 }}>
        {[{ key: "ALL", label: "All" }, ...STATUSES].map((s) => (
          <button key={s.key} className={status === s.key ? "on" : ""} onClick={() => setStatus(s.key)}>
            {s.label}<span className="count">{s.key === "ALL" ? rows.length : counts[s.key] || 0}</span>
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Client</th><th>Tax year</th><th>Status</th><th>Signature</th><th>E-file</th><th className="num">Docs</th><th className="num">Est. Refund</th><th>Preparer</th><th /></tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><div className="person"><Avatar name={r.client_name} size="sm" /><div><b>{r.client_name}</b><div className="hint">{r.client_email}</div></div></div></td>
                <td><b>{r.tax_year}</b></td>
                <td><StatusBadge status={r.status} /></td>
                <td><SignatureBadge status={r.signature_status} /></td>
                <td><SubmissionBadge status={r.submission_status} /></td>
                <td className="num">{r.doc_count}</td>
                <td className="num" style={{ fontWeight: 600, color: r.refund == null ? "var(--faint)" : r.refund >= 0 ? "var(--teal-2)" : "var(--rose)" }}>
                  {r.refund == null ? "—" : (r.refund < 0 ? "−" : "") + money(Math.abs(r.refund))}
                </td>
                <td className="small">{r.preparer_name || <span className="pill warn">Unassigned</span>}</td>
                <td><Link href={`/admin/returns/${r.id}`} className="btn btn-ghost btn-sm">Open <Icon name="arrow" size={14} className="icon-arrow" /></Link></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9}><Empty icon="search" title="No matching returns">Try another name or status filter.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
