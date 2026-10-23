"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES } from "@/lib/constants";
import Icon from "@/components/Icon";

export default function ReturnControls({ returnId, status, preparerId, preparers }) {
  const [s, setS] = useState(status);
  const [p, setP] = useState(preparerId || "");
  const [state, setState] = useState({});
  const router = useRouter();

  const save = async () => {
    setState({ busy: true });
    const res = await fetch(`/api/returns/${returnId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: s, preparerId: p || null }),
    });
    const data = await res.json().catch(() => ({}));
    setState(res.ok ? { ok: true } : { error: data.error || "Update failed" });
    if (res.ok) router.refresh();
  };

  return (
    <div className="card mt row between" style={{ alignItems: "flex-end" }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <span className="kpi-icon"><Icon name="layers" size={18} /></span>
        <div className="field">
          <label htmlFor="ret-status">Return status</label>
          <select id="ret-status" className="select" value={s} onChange={(e) => setS(e.target.value)}>
            {STATUSES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ret-preparer">Assigned preparer</label>
          <select id="ret-preparer" className="select" value={p} onChange={(e) => setP(e.target.value)}>
            <option value="">Unassigned</option>
            {preparers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        {state.ok && <span className="small pos-text" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="check" size={14} /> Saved</span>}
        {state.error && <span className="small" style={{ color: "var(--rose)" }}>{state.error}</span>}
        <button id="ret-save" className="btn btn-primary" disabled={state.busy} onClick={save}><Icon name="refresh" size={16} /> Update Return</button>
      </div>
    </div>
  );
}
