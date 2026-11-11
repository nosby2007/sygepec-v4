"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/Icon";
import { send } from "@/components/support/request";
import { PRIORITIES, SUPPORT_ROLES } from "@/lib/support-rules";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SlaForm({ policy, canEdit }) {
  const router = useRouter();
  const [p, setP] = useState(policy);
  const [holidays, setHolidays] = useState((policy.holidays || []).join("\n"));
  const [state, setState] = useState({});
  const setDay = (day, value) => setP({ ...p, hours: { ...p.hours, [day]: value } });
  const setTarget = (priority, field, hours) => setP({ ...p, targets: { ...p.targets, [priority]: { ...p.targets[priority], [field]: Math.round(Number(hours) * 60) } } });
  const save = async () => {
    setState({ busy: true });
    const { error } = await send("/api/support/settings/sla", "PUT", { ...p, holidays: holidays.split(/\s+/).filter(Boolean) });
    setState(error ? { error } : { saved: true });
    if (!error) router.refresh();
  };
  return (
    <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }} className="card stack">
      <div className="card-title"><div><h3>SLA policy</h3><div className="sub">{canEdit ? "New tickets use these targets. Times count office hours only." : "Only a Platform Admin can change this."}</div></div></div>
      <div className="field" style={{ maxWidth: 320 }}><label htmlFor="sla-tz">Time zone</label><input id="sla-tz" className="input" value={p.timeZone} onChange={(e) => setP({ ...p, timeZone: e.target.value })} /></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Priority</th><th>First response (office hours)</th><th>Resolution (office hours)</th></tr></thead>
        <tbody>{Object.entries(PRIORITIES).map(([k, label]) => (
          <tr key={k}><td>{label}</td>
            <td><input aria-label={`${label} first response hours`} className="input" style={{ maxWidth: 110 }} type="number" min="0.25" step="0.25" value={p.targets[k].firstResponseMinutes / 60} onChange={(e) => setTarget(k, "firstResponseMinutes", e.target.value)} /></td>
            <td><input aria-label={`${label} resolution hours`} className="input" style={{ maxWidth: 110 }} type="number" min="0.25" step="0.25" value={p.targets[k].resolutionMinutes / 60} onChange={(e) => setTarget(k, "resolutionMinutes", e.target.value)} /></td></tr>
        ))}</tbody>
      </table></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Day</th><th>Open</th><th>From</th><th>To</th></tr></thead>
        <tbody>{DAYS.map((name, day) => {
          const hours = p.hours[day];
          return (
            <tr key={name}><td>{name}</td>
              <td><input aria-label={`${name} open`} type="checkbox" checked={Boolean(hours)} onChange={(e) => setDay(day, e.target.checked ? ["09:00", "17:00"] : null)} /></td>
              <td>{hours && <input aria-label={`${name} from`} className="input" type="time" value={hours[0]} onChange={(e) => setDay(day, [e.target.value, hours[1]])} />}</td>
              <td>{hours && <input aria-label={`${name} to`} className="input" type="time" value={hours[1]} onChange={(e) => setDay(day, [hours[0], e.target.value])} />}</td></tr>
          );
        })}</tbody>
      </table></div>
      <div className="grid-2">
        <div className="field"><label htmlFor="sla-holidays">Holidays, one date per line (YYYY-MM-DD)</label><textarea id="sla-holidays" className="textarea" value={holidays} onChange={(e) => setHolidays(e.target.value)} /></div>
        <div className="field"><label htmlFor="sla-percent">Escalate when this share of the time is used (%)</label><input id="sla-percent" className="input" style={{ maxWidth: 110 }} type="number" min="10" max="100" value={p.escalateAtPercent} onChange={(e) => setP({ ...p, escalateAtPercent: Number(e.target.value) })} /><span className="hint">Overdue tickets always escalate.</span></div>
      </div>
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
      {state.saved && <div className="alert alert-success"><Icon name="check" size={16} />Saved. New tickets use this policy.</div>}
      {canEdit && <div className="row"><button type="button" id="sla-save" className="btn btn-primary btn-sm" disabled={state.busy} onClick={save}>{state.busy ? "Saving…" : "Save policy"}</button></div>}
    </fieldset>
  );
}

export function RoleForm({ staff, me }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SUPPORT_AGENT");
  const [state, setState] = useState({});
  const apply = async (who, value) => {
    setState({ busy: true });
    const { error } = await send("/api/support/settings/roles", "PUT", { email: who, role: value });
    setState(error ? { error } : {});
    if (!error) { setEmail(""); router.refresh(); }
  };
  return (
    <div className="card stack">
      <div className="card-title"><div><h3>People and roles</h3><div className="sub">The account must already be a staff account with two-step sign-in. See the support guide to add one.</div></div></div>
      {staff.length > 0 && <div className="table-wrap"><table>
        <thead><tr><th>Person</th><th>Role</th><th></th></tr></thead>
        <tbody>{staff.map((s) => (
          <tr key={s.uid}><td className="small"><b>{s.name}</b><div className="muted">{s.email}</div></td><td className="small">{SUPPORT_ROLES[s.role]?.label || s.role}</td>
            <td>{s.uid === me ? <span className="tiny muted">You</span> : <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => apply(s.email, null)}>Remove</button>}</td></tr>
        ))}</tbody>
      </table></div>}
      <div className="row">
        <input aria-label="Staff email" id="role-email" className="input" style={{ maxWidth: 280 }} type="email" placeholder="staff@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select aria-label="Role" id="role-pick" className="select" style={{ maxWidth: 220 }} value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(SUPPORT_ROLES).filter(([, r]) => r.grantable).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
        </select>
        <button type="button" id="role-save" className="btn btn-primary btn-sm" disabled={state.busy || !email.trim()} onClick={() => apply(email, role)}>Save role</button>
      </div>
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
    </div>
  );
}
