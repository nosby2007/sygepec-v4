"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import HoursEditor from "@/components/HoursEditor";
import { Avatar, Empty } from "@/components/ui";
import { weeklySummary } from "@/lib/business-display";

const blank = { name: "", title: "", bio: "", active: true, bookable: true, serviceIds: [], weekly: null };

async function load() {
  const [staffRes, servicesRes] = await Promise.all([fetch("/api/business/staff", { cache: "no-store" }), fetch("/api/business/services", { cache: "no-store" })]);
  const [staffBody, servicesBody] = await Promise.all([staffRes.json(), servicesRes.json()]);
  if (!staffRes.ok) throw new Error(staffBody.error || "Unable to load the team.");
  return { staff: staffBody.staff || [], services: servicesBody.services || [] };
}

export default function TeamManager() {
  const [data, setData] = useState({ staff: [], services: [] });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [state, setState] = useState({});

  useEffect(() => {
    let cancelled = false;
    load().then((d) => { if (!cancelled) setData(d); }).catch((e) => { if (!cancelled) setState({ error: e.message }); });
    return () => { cancelled = true; };
  }, []);

  const edit = (person) => {
    setEditing(person?.id || "new");
    setForm(person ? { ...blank, ...person } : blank);
    setState({});
  };

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch(editing === "new" ? "/api/business/staff" : `/api/business/staff/${editing}`, {
      method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The team member could not be saved." });
    setEditing(null);
    setState({ ok: "Saved." });
    setData(await load());
  };

  const serviceName = (id) => data.services.find((s) => s.id === id)?.name;

  return (
    <div className="grid-main" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-title"><h3>Team members</h3><button type="button" id="team-add" className="btn btn-primary btn-sm" onClick={() => edit(null)}><Icon name="plus" size={14} /> Add person</button></div>
        {data.staff.length === 0 && <Empty icon="users" title="No team yet">Without a team, bookings share the &quot;bookings at the same time&quot; capacity on your public page settings.</Empty>}
        <div className="stack-sm">
          {data.staff.map((p) => (
            <div key={p.id} className="list-item">
              <div className="person" style={{ minWidth: 0 }}>
                <Avatar name={p.name} />
                <div style={{ minWidth: 0 }}>
                  <b>{p.name}</b>{p.title && <span className="small muted"> · {p.title}</span>}
                  <div className="hint truncate">
                    {p.serviceIds?.length ? p.serviceIds.map(serviceName).filter(Boolean).join(", ") : "All services"}
                    {" · "}{p.weekly ? "Own hours" : "Business hours"}
                  </div>
                </div>
              </div>
              <div className="row nowrap">
                {!p.active ? <span className="pill">Inactive</span> : !p.bookable ? <span className="pill warn">Not bookable</span> : <span className="pill up">Bookable</span>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(p)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
        {state.ok && !editing && <div className="alert alert-success mt-sm"><Icon name="check" size={16} />{state.ok}</div>}
        {state.error && !editing && <div className="alert alert-error mt-sm"><Icon name="alert" size={16} />{state.error}</div>}
      </div>

      {editing && (
        <form className="card stack" onSubmit={save}>
          <div className="card-title"><h3>{editing === "new" ? "New team member" : `Edit ${form.name}`}</h3><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={() => setEditing(null)}><Icon name="x" size={16} /></button></div>
          <div className="field"><label htmlFor="st-name">Name (shown publicly)</label><input id="st-name" className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="st-title">Role</label><input id="st-title" className="input" maxLength={80} placeholder="Stylist, Technician…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="st-bio">Short bio (public)</label><textarea id="st-bio" className="textarea" maxLength={500} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          <div className="row">
            <label className="row nowrap small"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
            <label className="row nowrap small"><input type="checkbox" checked={form.bookable} onChange={(e) => setForm({ ...form, bookable: e.target.checked })} /> Customers can book this person</label>
          </div>
          <div className="field">
            <label>Services this person does</label>
            <span className="hint">Leave all unticked for every service.</span>
            <div className="stack-sm">
              {data.services.map((s) => (
                <label key={s.id} className="row nowrap small">
                  <input type="checkbox" checked={form.serviceIds.includes(s.id)} onChange={(e) => setForm({ ...form, serviceIds: e.target.checked ? [...form.serviceIds, s.id] : form.serviceIds.filter((x) => x !== s.id) })} /> {s.name}
                </label>
              ))}
            </div>
          </div>
          <label className="row nowrap small"><input type="checkbox" checked={Boolean(form.weekly)} onChange={(e) => setForm({ ...form, weekly: e.target.checked ? { 1: [{ start: "09:00", end: "17:00" }], 2: [{ start: "09:00", end: "17:00" }], 3: [{ start: "09:00", end: "17:00" }], 4: [{ start: "09:00", end: "17:00" }], 5: [{ start: "09:00", end: "17:00" }] } : null })} /> This person has their own hours</label>
          {form.weekly ? <HoursEditor weekly={form.weekly} onChange={(weekly) => setForm({ ...form, weekly })} idPrefix="st-hours" /> : <span className="hint">Uses the business opening hours.</span>}
          {form.weekly && <span className="hint">{weeklySummary(form.weekly).filter((d) => d.text !== "Closed").map((d) => `${d.label.slice(0, 3)} ${d.text}`).join(" · ")}</span>}
          {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
          <button className="btn btn-primary" disabled={Boolean(state.busy)}>Save</button>
        </form>
      )}
    </div>
  );
}
