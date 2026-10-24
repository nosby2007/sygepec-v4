"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import HoursEditor from "@/components/HoursEditor";
import { DEFAULT_BOOKING } from "@/lib/booking";
import { mediaUrl } from "@/lib/business-display";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico"];
const RULES = [
  ["minNoticeHours", "Minimum notice (hours)", 0, 336],
  ["horizonDays", "Bookable up to (days ahead)", 1, 180],
  ["cancelCutoffHours", "Customers can change until (hours before)", 0, 336],
  ["maxReschedules", "Online reschedules per booking", 0, 10],
  ["bufferMinutes", "Break after each booking (min)", 0, 120],
  ["capacity", "Bookings at the same time (when no team is set up)", 1, 10],
];
const slugify = (text) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function initialState(profile) {
  const weekdays = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [{ start: "09:00", end: "17:00" }]]));
  return {
    name: "", slug: "", tagline: "", description: "", phone: "", email: "", address: "", city: "", state: "", zip: "", website: "",
    status: "DRAFT", publicBooking: false, autoConfirm: false,
    ...(profile || {}),
    booking: { ...DEFAULT_BOOKING, weekly: weekdays, ...(profile?.booking || {}) },
  };
}

export default function BusinessProfileForm({ initial }) {
  const router = useRouter();
  const [p, setP] = useState(() => initialState(initial));
  const [saved, setSaved] = useState(Boolean(initial));
  const [newDate, setNewDate] = useState("");
  const [state, setState] = useState({});
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const set = (key) => (e) => setP({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const setRule = (key, value) => setP({ ...p, booking: { ...p.booking, [key]: value } });
  const publicUrl = `${origin}/business/${initial?.slug || p.slug}`;

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const booking = { ...p.booking, ...Object.fromEntries(RULES.map(([key]) => [key, Number(p.booking[key])])), slotMinutes: Number(p.booking.slotMinutes) };
    const res = await fetch("/api/business/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p, booking }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The profile could not be saved." });
    setP(initialState(body.profile));
    setSaved(true);
    setState({ ok: p.status === "PUBLISHED" ? "Saved and published." : "Saved as a draft. Publish when you're ready." });
    router.refresh();
  };

  const upload = (target) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("target", target);
    form.set("file", file);
    setState({ busy: true });
    const res = await fetch("/api/business/media", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    e.target.value = "";
    if (!res.ok) return setState({ error: body.error || "The image could not be uploaded." });
    setP((current) => ({ ...current, [target === "logo" ? "logoPath" : "coverPath"]: body.path }));
    setState({ ok: "Image updated." });
    router.refresh();
  };

  return (
    <form onSubmit={save} className="stack">
      {saved && initial?.status === "PUBLISHED" && (
        <div className="alert alert-success">
          <Icon name="link" size={16} />
          <div className="row" style={{ minWidth: 0 }}>
            <span className="small" suppressHydrationWarning>Your public page: <a href={`/business/${initial.slug}`} target="_blank" rel="noopener noreferrer"><b>{publicUrl}</b></a></span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(publicUrl).then(() => setState({ ok: "Link copied." }), () => {})}><Icon name="clipboard" size={14} /> Copy link</button>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card stack">
          <h3>Profile</h3>
          <div className="field"><label htmlFor="bp-name">Business name</label><input id="bp-name" className="input" required maxLength={100} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value, slug: saved ? p.slug : slugify(e.target.value) })} /></div>
          <div className="field">
            <label htmlFor="bp-slug">Public link</label>
            <div className="input-icon"><Icon name="link" size={15} /><input id="bp-slug" className="input" required maxLength={40} pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" value={p.slug} onChange={(e) => setP({ ...p, slug: slugify(e.target.value) })} /></div>
            <span className="hint" suppressHydrationWarning>{origin}/business/{p.slug || "your-business"}. Changing it breaks links you have already shared.</span>
          </div>
          <div className="field"><label htmlFor="bp-tagline">Short tagline</label><input id="bp-tagline" className="input" maxLength={140} value={p.tagline} onChange={set("tagline")} /></div>
          <div className="field"><label htmlFor="bp-desc">About the business</label><textarea id="bp-desc" className="textarea" maxLength={2000} rows={5} value={p.description} onChange={set("description")} /></div>
        </div>
        <div className="card stack">
          <h3>Public contact</h3>
          <div className="form-grid">
            <div className="field"><label htmlFor="bp-phone">Phone</label><input id="bp-phone" className="input" maxLength={30} value={p.phone} onChange={set("phone")} /></div>
            <div className="field"><label htmlFor="bp-email">Email</label><input id="bp-email" type="email" className="input" maxLength={254} value={p.email} onChange={set("email")} /></div>
            <div className="field full"><label htmlFor="bp-address">Street address</label><input id="bp-address" className="input" maxLength={150} value={p.address} onChange={set("address")} /></div>
            <div className="field"><label htmlFor="bp-city">City</label><input id="bp-city" className="input" maxLength={80} value={p.city} onChange={set("city")} /></div>
            <div className="field"><label htmlFor="bp-state">State / ZIP</label><div className="row nowrap"><input id="bp-state" className="input" style={{ width: 70 }} maxLength={2} value={p.state} onChange={set("state")} /><input aria-label="ZIP" className="input" maxLength={10} value={p.zip} onChange={set("zip")} /></div></div>
            <div className="field full"><label htmlFor="bp-web">Website (https://)</label><input id="bp-web" className="input" maxLength={200} value={p.website} onChange={set("website")} /></div>
          </div>
          <div className="row">
            <div className="stack-sm" style={{ alignItems: "flex-start" }}>
              <span className="small muted" style={{ fontWeight: 600 }}>Logo</span>
              {p.logoPath ? <Image unoptimized src={mediaUrl(p.logoPath)} alt="Logo" className="biz-logo" width={56} height={56} /> : <span className="biz-logo biz-logo-text">{p.name[0] || "?"}</span>}
              <label className="btn btn-ghost btn-sm" aria-disabled={!saved}><Icon name="upload" size={14} /> Upload<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!saved} onChange={upload("logo")} /></label>
            </div>
            <div className="stack-sm" style={{ alignItems: "flex-start" }}>
              <span className="small muted" style={{ fontWeight: 600 }}>Cover image</span>
              {p.coverPath ? <Image unoptimized src={mediaUrl(p.coverPath)} alt="Cover" className="biz-thumb" width={120} height={56} style={{ width: 120 }} /> : <span className="small muted">None</span>}
              <label className="btn btn-ghost btn-sm" aria-disabled={!saved}><Icon name="upload" size={14} /> Upload<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!saved} onChange={upload("cover")} /></label>
            </div>
          </div>
          {!saved && <span className="hint">Save the profile once before adding images. JPG, PNG or WebP, 2 MB max.</span>}
        </div>
      </div>

      <div className="card stack">
        <h3>Online booking</h3>
        <div className="row">
          <div className="seg" role="radiogroup" aria-label="Publication">
            {[["DRAFT", "Draft"], ["PUBLISHED", "Published"]].map(([key, label]) => <button type="button" key={key} className={p.status === key ? "on" : ""} onClick={() => setP({ ...p, status: key })}>{label}</button>)}
          </div>
          <label className="row nowrap small"><input type="checkbox" id="bp-public-booking" checked={p.publicBooking} onChange={set("publicBooking")} /> Accept bookings from the public page</label>
          <label className="row nowrap small"><input type="checkbox" checked={p.autoConfirm} onChange={set("autoConfirm")} /> Confirm bookings automatically</label>
        </div>
        <span className="hint">Only services you mark as public appear on your page. Customers get a private link to change or cancel; no email is sent yet.</span>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="bp-zone">Time zone</label>
            <select id="bp-zone" className="input select" value={p.booking.timeZone} onChange={(e) => setRule("timeZone", e.target.value)}>
              {[...new Set([p.booking.timeZone, ...ZONES])].map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bp-grid">Start times every</label>
            <select id="bp-grid" className="input select" value={p.booking.slotMinutes} onChange={(e) => setRule("slotMinutes", Number(e.target.value))}>
              {[15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
          {RULES.map(([key, label, min, max]) => (
            <div className="field" key={key}><label htmlFor={`bp-${key}`}>{label}</label><input id={`bp-${key}`} type="number" className="input" min={min} max={max} value={p.booking[key]} onChange={(e) => setRule(key, e.target.value)} /></div>
          ))}
        </div>
        <h3 style={{ marginTop: 8 }}>Opening hours</h3>
        <HoursEditor weekly={p.booking.weekly} onChange={(weekly) => setRule("weekly", weekly)} idPrefix="bp-hours" />
        <div className="row">
          {(p.booking.closedDates || []).map((d) => (
            <span className="pill" key={d}>{d}<button type="button" style={{ border: 0, background: "none", cursor: "pointer" }} aria-label={`Reopen ${d}`} onClick={() => setRule("closedDates", p.booking.closedDates.filter((x) => x !== d))}><Icon name="x" size={12} /></button></span>
          ))}
          <input type="date" className="input" style={{ maxWidth: 190 }} aria-label="Date to close" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!newDate} onClick={() => { setRule("closedDates", [...new Set([...(p.booking.closedDates || []), newDate])].sort()); setNewDate(""); }}><Icon name="plus" size={14} /> Close this date</button>
        </div>
      </div>

      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
      <div className="row"><button id="bp-save" className="btn btn-primary" disabled={Boolean(state.busy)}>Save profile</button></div>
    </form>
  );
}
