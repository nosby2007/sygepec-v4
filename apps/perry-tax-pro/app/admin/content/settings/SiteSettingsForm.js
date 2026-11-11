"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function SiteSettingsForm({ initial }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [state, setState] = useState({});
  const set = (key) => (e) => setS({ ...s, [key]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch("/api/cms/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? { ok: true } : { error: body.error || "Could not save." });
    if (res.ok) router.refresh();
  };
  return (
    <form className="card stack" style={{ maxWidth: 640 }} onSubmit={save}>
      <div className="form-grid">
        <div className="field"><label htmlFor="ss-phone">Phone</label><input id="ss-phone" className="input" maxLength={30} value={s.phone} onChange={set("phone")} /></div>
        <div className="field"><label htmlFor="ss-email">Email</label><input id="ss-email" type="email" className="input" maxLength={254} value={s.email} onChange={set("email")} /></div>
        <div className="field full"><label htmlFor="ss-address">Office address</label><input id="ss-address" className="input" maxLength={200} value={s.address} onChange={set("address")} /></div>
        <div className="field full"><label htmlFor="ss-hours">Hours</label><input id="ss-hours" className="input" maxLength={120} placeholder="Mon–Sat · 9am–7pm" value={s.hours} onChange={set("hours")} /></div>
      </div>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />Saved. The footer and contact page now show these details.</div>}
      <div className="row"><button id="ss-save" className="btn btn-primary" disabled={Boolean(state.busy)}>Save</button></div>
    </form>
  );
}
