"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Sheet from "@/components/mobile/Sheet";
import { api, tap } from "@/components/mobile/native";
import { dollars, initials, shortDay } from "@/components/mobile/format";
import { NOTE_KINDS, STAGES } from "@/lib/growth-shared";

const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const letterOf = (name) => (/^[a-z]/i.test(name) ? name[0].toUpperCase() : "#");

// Client book: A–Z list with search and a letter index, or groups by stage and tag.
export default function ClientList({ customers }) {
  const router = useRouter();
  const [view, setView] = useState("list");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(null);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);

  const groups = useMemo(() => {
    const out = STAGES.map((s) => ({ key: `stage:${s.key}`, label: s.label, hint: s.hint, rows: customers.filter((c) => c.stage === s.key) }));
    const tags = [...new Set(customers.flatMap((c) => c.tags))].sort();
    for (const t of tags) out.push({ key: `tag:${t}`, label: `#${t}`, hint: "Tag", rows: customers.filter((c) => c.tags.includes(t)) });
    return out.filter((g) => g.rows.length);
  }, [customers]);

  const base = group ? groups.find((g) => g.key === group)?.rows || [] : customers;
  const q = query.trim().toLowerCase();
  const rows = (q ? base.filter((c) => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q)) : base)
    .slice().sort((x, y) => (letterOf(x.name) === "#") - (letterOf(y.name) === "#") || x.name.localeCompare(y.name));
  const sections = [];
  for (const c of rows) {
    const l = letterOf(c.name);
    if (sections.at(-1)?.letter !== l) sections.push({ letter: l, rows: [] });
    sections.at(-1).rows.push(c);
  }

  return (
    <main className="m-main m-flush">
      <div style={{ padding: "0 var(--m-gutter)" }}>
        <div className="m-head">
          {group ? <button type="button" className="m-back" onClick={() => setGroup(null)}><Icon name="back" size={24} /> {groups.find((g) => g.key === group)?.label}</button> : <h1>Clients</h1>}
          <Link className="m-link" href="/portal/business/customers">More</Link>
        </div>
        {!group && (
          <div className="m-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List ({customers.length})</button>
            <button type="button" aria-pressed={view === "groups"} onClick={() => setView("groups")}>Groups ({groups.length})</button>
          </div>
        )}
        {(view === "list" || group) && (
          <div className="m-search"><Icon name="search" size={20} /><input type="search" placeholder="Search clients" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clients" /></div>
        )}
      </div>

      {view === "groups" && !group ? (
        <div className="m-list" style={{ margin: "0 var(--m-gutter)" }}>
          {groups.length === 0 && <div className="m-empty"><b>No groups yet</b>Clients are grouped by stage and tag as you add them.</div>}
          {groups.map((g) => (
            <button key={g.key} type="button" className="m-row" onClick={() => { setGroup(g.key); setQuery(""); }}>
              <div className="m-row-icon"><Icon name={g.key.startsWith("tag:") ? "tag" : "users"} size={22} /></div>
              <div className="m-row-text"><b>{g.label}</b><span>{g.hint}</span></div>
              <b>{g.rows.length}</b>
              <Icon name="chevron" size={18} className="m-chev" />
            </button>
          ))}
        </div>
      ) : (
        <>
          {rows.length === 0 && <div className="m-empty"><Icon name="users" size={32} /><b>{q ? "No match" : "No clients yet"}</b>{q ? "Try another name or number." : "Add your first client, or they appear here when they book."}</div>}
          {sections.map((s) => (
            <section key={s.letter} id={`letter-${s.letter}`}>
              <div className="m-letter">{s.letter}</div>
              <div style={{ background: "var(--surface)" }}>
                {s.rows.map((c) => (
                  <button key={c.id} type="button" className="m-row" onClick={() => setOpen(c)} style={{ paddingRight: 28 }}>
                    <div className="m-avatar">{initials(c.name)}</div>
                    <div className="m-row-text"><b>{c.name}</b><span>{c.phone || c.email || STAGE_LABEL[c.stage]}</span></div>
                    {c.stage === "VIP" && <Icon name="star" size={18} />}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!q && rows.length > 12 && (
            <nav className="m-alpha" aria-label="Jump to letter">
              {["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((l) => <a key={l} href={`#letter-${l}`} onClick={(e) => { const el = document.getElementById(`letter-${l}`); if (!el) e.preventDefault(); }}>{l}</a>)}
            </nav>
          )}
        </>
      )}

      <button type="button" className="m-fab wide" onClick={() => { tap(); setEditing({}); }}><Icon name="plus" size={22} stroke={2} /> Add Client</button>
      {open && <ClientSheet client={open} onClose={() => setOpen(null)} onEdit={() => { setEditing(open); setOpen(null); }} />}
      {editing && <ClientForm client={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </main>
  );
}

function ClientSheet({ client: c, onClose, onEdit }) {
  const [notes, setNotes] = useState(null);
  const [note, setNote] = useState({ kind: "NOTE", text: "" });
  const [state, setState] = useState({});
  const loadNotes = async () => {
    try {
      const r = await api(`/api/business/growth?notes=${c.id}`, { method: "GET" });
      setNotes(r.notes || []);
    } catch (e) {
      setState({ error: e.message });
    }
  };
  const addNote = async () => {
    setState({ busy: true });
    try {
      await api("/api/business/growth", { body: { action: "addNote", customerId: c.id, ...note } });
      setNote({ kind: "NOTE", text: "" });
      setState({});
      loadNotes();
    } catch (e) {
      setState({ error: e.message });
    }
  };
  return (
    <Sheet title={c.name} onClose={onClose}>
      <div className="m-chips m-gap-b">
        {c.phone && <a className="m-btn small ghost" href={`tel:${c.phone}`}><Icon name="phone" size={16} /> Call</a>}
        {c.phone && <a className="m-btn small ghost" href={`sms:${c.phone}`}><Icon name="chat" size={16} /> Text</a>}
        {c.email && <a className="m-btn small ghost" href={`mailto:${c.email}`}><Icon name="mail" size={16} /> Email</a>}
        <button type="button" className="m-btn small ghost" onClick={onEdit}><Icon name="edit" size={16} /> Edit</button>
      </div>
      <div className="m-stats" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
        <div><span>Visits</span><b>{c.visits}</b></div>
        <div><span>Last visit</span><b>{c.lastVisitMs ? shortDay(c.lastVisitMs) : "—"}</b></div>
        <div><span>Spent</span><b>{dollars(c.valueCents)}</b></div>
      </div>
      <div className="m-line m-gap"><span>Stage</span><b>{STAGE_LABEL[c.stage] || c.stage}</b></div>
      {c.nextVisitMs && <div className="m-line"><span>Next visit</span><b>{shortDay(c.nextVisitMs)}</b></div>}
      {c.phone && <div className="m-line"><span>Mobile</span><span>{c.phone}</span></div>}
      {c.email && <div className="m-line"><span>Email</span><span>{c.email}</span></div>}
      <div className="m-line"><span>Marketing messages</span><span>{c.marketingConsent ? "Agreed" : "Not agreed"}</span></div>
      {c.tags.length > 0 && <div className="m-line"><span>Tags</span><span>{c.tags.map((t) => `#${t}`).join(" ")}</span></div>}
      {c.notes && <p className="m-sub m-gap">{c.notes}</p>}

      <div className="m-section"><h2>History</h2>{notes === null && <button type="button" className="m-btn small ghost" onClick={loadNotes}>Show</button>}</div>
      {notes && (
        <>
          <div className="m-btns" style={{ gridTemplateColumns: "120px 1fr" }}>
            <select className="m-input" value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value })} aria-label="Kind">{Object.entries(NOTE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input className="m-input" placeholder="Add a note" maxLength={1000} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
          </div>
          <button type="button" className="m-btn small m-gap" disabled={state.busy || !note.text.trim()} onClick={addNote}>Save note</button>
          <ul className="m-steps m-gap">
            {notes.length === 0 && <li className="todo"><span className="m-sub" style={{ margin: 0 }}>No notes yet.</span></li>}
            {notes.map((n) => <li key={n.id}><i><Icon name="chat" size={16} /></i><div><b>{n.text}</b><small>{NOTE_KINDS[n.kind]} · {shortDay(n.createdAt)}</small></div></li>)}
          </ul>
        </>
      )}
      {state.error && <div className="m-alert">{state.error}</div>}
    </Sheet>
  );
}

function ClientForm({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: client.name || "", phone: client.phone || "", email: client.email || "", notes: client.notes || "",
    stage: client.stage || "LEAD", tags: (client.tags || []).join(", "), marketingConsent: client.marketingConsent === true,
  });
  const [state, setState] = useState({});
  const f = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async () => {
    setState({ busy: true });
    try {
      await api("/api/business/growth", { body: { action: "saveCustomer", id: client.id || null, customer: { ...form, followUpAt: client.followUpAt || null, source: client.source || "mobile" } } });
      onSaved();
    } catch (e) {
      setState({ error: e.message });
    }
  };
  return (
    <Sheet title={client.id ? "Edit client" : "New client"} onClose={onClose}>
      <label className="m-field"><span>Name</span><input className="m-input" maxLength={100} autoComplete="name" value={form.name} onChange={f("name")} /></label>
      <label className="m-field"><span>Mobile</span><input className="m-input" type="tel" inputMode="tel" maxLength={30} value={form.phone} onChange={f("phone")} /></label>
      <label className="m-field"><span>Email</span><input className="m-input" type="email" inputMode="email" value={form.email} onChange={f("email")} /></label>
      <label className="m-field"><span>Stage</span><select className="m-input" value={form.stage} onChange={f("stage")}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
      <label className="m-field"><span>Tags (comma separated)</span><input className="m-input" placeholder="braids, kids" value={form.tags} onChange={f("tags")} /></label>
      <label className="m-field"><span>Notes</span><textarea className="m-input" maxLength={500} value={form.notes} onChange={f("notes")} /></label>
      <label className="m-row m-row-plain" style={{ alignItems: "flex-start" }}>
        <input type="checkbox" checked={form.marketingConsent} onChange={f("marketingConsent")} style={{ width: 22, height: 22, marginTop: 2 }} />
        <span className="m-row-text"><b style={{ fontSize: 15 }}>Agreed to marketing messages</b><span>Only tick this if the client said yes to promotions by email or text.</span></span>
      </label>
      {state.error && <div className="m-alert">{state.error}</div>}
      <button type="button" className="m-btn" disabled={state.busy} onClick={save}>{state.busy ? "Saving…" : "Save client"}</button>
    </Sheet>
  );
}
