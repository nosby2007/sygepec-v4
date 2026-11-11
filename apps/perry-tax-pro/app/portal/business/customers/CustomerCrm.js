"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";
import { NOTE_KINDS, STAGES } from "@/lib/growth-shared";

const usd = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((cents || 0) / 100);
const blank = { name: "", email: "", phone: "", notes: "", stage: "LEAD", tags: [], followUpAt: "", marketingConsent: false };

async function post(body) {
  const res = await fetch("/api/business/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "That did not work.");
  return data.result;
}

export default function CustomerCrm({ customers, focus }) {
  const [view, setView] = useState("pipeline");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(focus && customers.some((c) => c.id === focus) ? focus : null);
  const [creating, setCreating] = useState(false);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? customers.filter((c) => `${c.name} ${c.email} ${c.phone} ${c.tags.join(" ")}`.toLowerCase().includes(needle)) : customers;
  }, [customers, q]);
  const current = customers.find((c) => c.id === selected);
  const open = (id) => { setSelected(id); setCreating(false); };

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <div className="input-icon" style={{ minWidth: 240 }}><Icon name="search" size={15} /><input className="input" placeholder="Search name, email, phone or tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" /></div>
          <div className="seg">{[["pipeline", "Pipeline"], ["list", "List"]].map(([k, l]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</div>
        </div>
        <button type="button" id="crm-add" className="btn btn-primary" onClick={() => { setCreating(true); setSelected(null); }}><Icon name="plus" size={16} /> Add customer</button>
      </div>

      <div className={current || creating ? "grid-main" : ""} style={{ alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          {customers.length === 0 && <div className="card"><Empty icon="users" title="No customers yet">Add customers here, or from a booking with &ldquo;Add to customers&rdquo;.</Empty></div>}
          {customers.length > 0 && view === "pipeline" && (
            <div className="pipeline">
              {STAGES.map((s) => {
                const col = shown.filter((c) => c.stage === s.key);
                return (
                  <section key={s.key} className="pipeline-col" aria-label={s.label}>
                    <header><span>{s.label}</span><span className="count-dot">{col.length}</span></header>
                    <span className="hint" style={{ marginTop: -4 }}>{s.hint}</span>
                    {col.map((c) => (
                      <button key={c.id} type="button" className={`pipeline-card ${selected === c.id ? "selected" : ""}`} onClick={() => open(c.id)}>
                        <div className="row nowrap between"><b className="truncate">{c.name}</b>{c.marketingConsent && <Icon name="mail" size={13} />}</div>
                        <div className="small muted">{c.visits} visit{c.visits === 1 ? "" : "s"} · {usd(c.valueCents)}</div>
                        {c.followUpAt && <div className="small" style={{ color: "var(--gold-ink)" }}>Follow up {c.followUpAt}</div>}
                        {c.tags.length > 0 && <div className="row" style={{ gap: 4, marginTop: 4 }}>{c.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
                        {c.suggestedStage !== c.stage && <div className="hint">Suggested: {STAGES.find((x) => x.key === c.suggestedStage)?.label}</div>}
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
          {customers.length > 0 && view === "list" && (
            <div className="card table-wrap"><table>
              <thead><tr><th>Customer</th><th>Stage</th><th className="num">Visits</th><th className="num">Value</th><th>Last visit</th><th>Follow-up</th></tr></thead>
              <tbody>{shown.map((c) => (
                <tr key={c.id} onClick={() => open(c.id)} style={{ cursor: "pointer" }} className={selected === c.id ? "selected" : ""}>
                  <td><div className="person"><Avatar name={c.name} size="sm" /><div><b>{c.name}</b><div className="hint">{c.email || c.phone}</div></div></div></td>
                  <td><span className="pill">{STAGES.find((s) => s.key === c.stage)?.label}</span></td>
                  <td className="num">{c.visits}</td><td className="num">{usd(c.valueCents)}</td><td className="small">{c.lastVisit || "—"}</td><td className="small">{c.followUpAt || "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        {creating && <CustomerCard key="new" customer={blank} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelected(id); }} />}
        {current && !creating && <CustomerCard key={current.id} customer={current} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

function CustomerCard({ customer, onClose, onCreated }) {
  const router = useRouter();
  const isNew = !customer.id;
  const [c, setC] = useState({ ...customer, tags: customer.tags.join(", ") });
  const [notes, setNotes] = useState(null);
  const [note, setNote] = useState({ kind: "NOTE", text: "" });
  const [state, setState] = useState({});
  const set = (key) => (e) => setC({ ...c, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    fetch(`/api/business/growth?notes=${customer.id}`, { cache: "no-store" }).then((r) => r.json()).then((b) => { if (!cancelled) setNotes(b.notes || []); }).catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [customer.id, isNew, state.noteSaved]);

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const result = await post({ action: "saveCustomer", id: customer.id || null, customer: { ...c, tags: c.tags } });
      setState({ ok: "Saved." });
      router.refresh();
      if (isNew && onCreated) onCreated(result.id);
    } catch (err) {
      setState({ error: err.message });
    }
  };
  const addNote = async () => {
    if (!note.text.trim()) return;
    try {
      await post({ action: "addNote", customerId: customer.id, ...note });
      setNote({ kind: note.kind, text: "" });
      setState({ noteSaved: Date.now() });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <form className="card stack-sm" onSubmit={save}>
      <div className="card-title">
        <div className="person"><Avatar name={c.name || "?"} /><h3 style={{ margin: 0 }}>{isNew ? "New customer" : customer.name}</h3></div>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      {!isNew && (
        <div className="breakdown" style={{ marginTop: 0 }}>
          <div><span>Visits</span><b>{customer.visits}</b></div>
          <div><span>Lifetime value</span><b>{usd(customer.valueCents)}</b></div>
          <div><span>Last visit</span><b>{customer.lastVisit || "—"}</b></div>
          {customer.nextVisit && <div><span>Next visit</span><b>{customer.nextVisit}</b></div>}
        </div>
      )}
      <div className="form-grid">
        <div className="field full"><label htmlFor="cc-name">Name</label><input id="cc-name" className="input" required maxLength={100} value={c.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="cc-email">Email</label><input id="cc-email" type="email" className="input" maxLength={254} value={c.email} onChange={set("email")} /></div>
        <div className="field"><label htmlFor="cc-phone">Phone</label><input id="cc-phone" className="input" maxLength={30} value={c.phone} onChange={set("phone")} /></div>
        <div className="field"><label htmlFor="cc-stage">Stage</label><select id="cc-stage" className="select" value={c.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
        <div className="field"><label htmlFor="cc-follow">Follow up on</label><input id="cc-follow" type="date" className="input" value={c.followUpAt} onChange={set("followUpAt")} /></div>
        <div className="field full"><label htmlFor="cc-tags">Tags</label><input id="cc-tags" className="input" placeholder="e.g. color, weekend, referral" value={c.tags} onChange={set("tags")} /></div>
        <div className="field full"><label htmlFor="cc-notes">About this customer</label><textarea id="cc-notes" className="textarea" rows={2} maxLength={500} value={c.notes} onChange={set("notes")} /></div>
        <label className="full row nowrap small"><input type="checkbox" checked={c.marketingConsent} onChange={set("marketingConsent")} /> This customer agreed to receive marketing emails{customer.consentAt ? ` (recorded ${new Date(customer.consentAt).toLocaleDateString("en-US")})` : ""}.</label>
      </div>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
      <div className="row"><button className="btn btn-primary" disabled={Boolean(state.busy && !state.ok && !state.error)}>{isNew ? "Add customer" : "Save"}</button></div>

      {!isNew && (
        <>
          <div className="divider" />
          <h4 className="return-h">Visits</h4>
          {customer.history.length === 0 ? <p className="small muted">No bookings with this email yet.</p> : (
            <ul className="timeline-list">{customer.history.map((h) => <li key={h.id}><b>{h.service}</b><span className="hint">{h.when} · {h.status.toLowerCase().replace("_", "-")} · {usd(h.priceCents)}</span></li>)}</ul>
          )}
          <h4 className="return-h mt-sm">Notes and contact log</h4>
          <div className="row nowrap">
            <select className="select" style={{ maxWidth: 130 }} value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value })} aria-label="Type">{Object.entries(NOTE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input className="input" placeholder="What happened?" maxLength={1000} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={addNote}>Add</button>
          </div>
          {notes === null ? <p className="small muted">Loading…</p> : notes.length === 0 ? <p className="small muted">Nothing logged yet.</p> : (
            <ul className="timeline-list">{notes.map((n) => <li key={n.id}><b>{NOTE_KINDS[n.kind]}</b>: {n.text}<span className="hint">{new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></li>)}</ul>
          )}
        </>
      )}
    </form>
  );
}
