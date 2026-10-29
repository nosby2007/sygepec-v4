"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";
import { STAGES } from "@/lib/growth-shared";

const TABS = [["today", "bell", "Today"], ["marketing", "megaphone", "Marketing"], ["feedback", "star", "Feedback"]];
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

async function post(body) {
  const res = await fetch("/api/business/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "That did not work. Please try again.");
  return data.result;
}

export default function GrowthHub(props) {
  const [tab, setTab] = useState(props.tab);
  const [notice, setNotice] = useState(null);
  const router = useRouter();
  const run = async (fn, ok) => {
    setNotice({ busy: true });
    try {
      const result = await fn();
      setNotice({ ok: typeof ok === "function" ? ok(result) : ok });
      router.refresh();
      return result;
    } catch (e) {
      setNotice({ error: e.message });
      return null;
    }
  };
  const copy = (text, label = "Copied.") => navigator.clipboard.writeText(text).then(() => setNotice({ ok: label }), () => setNotice({ error: "Copy failed: select the text manually." }));

  return (
    <div className="card mt">
      <div className="tabs" role="tablist">
        {TABS.map(([key, icon, label]) => {
          const count = key === "today" ? props.todo.toConfirm.length + props.todo.remind.length + props.todo.followUps.length + props.todo.toClose.length : key === "feedback" ? props.feedback.filter((f) => !f.seenAt).length : 0;
          return <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => { setTab(key); setNotice(null); }}><Icon name={icon} size={16} />{label}{count > 0 && <span className="pill warn" style={{ padding: "1px 8px" }}>{count}</span>}</button>;
        })}
      </div>
      {notice?.error && <div className="alert alert-error mt-sm" role="alert"><Icon name="alert" size={16} />{notice.error}</div>}
      {notice?.ok && <div className="alert alert-success mt-sm" role="status"><Icon name="check" size={16} />{notice.ok}</div>}
      {tab === "today" && <Today {...props} run={run} copy={copy} busy={notice?.busy} />}
      {tab === "marketing" && <Marketing {...props} run={run} copy={copy} busy={notice?.busy} />}
      {tab === "feedback" && <Feedback {...props} run={run} copy={copy} busy={notice?.busy} />}
    </div>
  );
}

function Group({ icon, title, items, hot, empty, children }) {
  return (
    <div className={`agenda-group ${hot && items.length ? "hot" : ""}`}>
      <h4><Icon name={icon} size={16} />{title}<span className="count-dot">{items.length}</span></h4>
      {items.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{empty}</p> : <div className="stack-sm">{children}</div>}
    </div>
  );
}

const bookingAction = (id, action) => fetch(`/api/business/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
  .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not update the booking."); });

function Today({ todo, mailer, sms, run, copy, busy }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="grid-2 mt fade-in">
      <Group icon="bell" title="Requests to confirm" items={todo.toConfirm} hot empty="Nothing waiting.">
        {todo.toConfirm.map((b) => (
          <div key={b.id} className="list-item" style={{ padding: "6px 0" }}>
            <span className="small"><b>{b.name}</b> · {b.service}<br /><span className="muted">{b.when}{b.staff ? ` · ${b.staff}` : ""}</span></span>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => bookingAction(b.id, "confirm"), `${b.name}'s booking confirmed.`)}>Confirm</button>
          </div>
        ))}
      </Group>
      <Group icon="clock" title="Reminders for tomorrow" items={todo.remind} hot empty="No reminders to send.">
        {todo.remind.map((b) => (
          <div key={b.id} className="stack-sm" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            <div className="row between"><span className="small"><b>{b.name}</b> · {b.when}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? "Hide" : "Message"}</button></div>
            {open === b.id && <p className="small" style={{ margin: 0, padding: 10, background: "var(--surface-2)", borderRadius: 10 }}>{b.text}</p>}
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(b.text, "Reminder copied. Send it by text or email, then mark it sent.")}><Icon name="clipboard" size={14} /> Copy</button>
              {sms && b.phone && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => post({ action: "sendReminder", bookingId: b.id, channel: "SMS" }), "Reminder texted.")}><Icon name="chat" size={14} /> Text it</button>}
              {!sms && b.phone && <a className="btn btn-ghost btn-sm" href={`sms:${b.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(b.text)}`}><Icon name="chat" size={14} /> Text</a>}
              {mailer && b.email && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => post({ action: "sendReminder", bookingId: b.id, channel: "EMAIL" }), "Reminder emailed.")}><Icon name="mail" size={14} /> Email it</button>}
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => post({ action: "sendReminder", bookingId: b.id, channel: "MANUAL" }), "Marked as reminded.")}>Mark sent</button>
            </div>
          </div>
        ))}
      </Group>
      <Group icon="calendar" title="Today" items={todo.today} empty="No bookings today.">
        {todo.today.map((b) => <div key={b.id} className="small"><b>{b.when.split(", ").at(-1)}</b> · {b.name} · {b.service}{b.staff ? ` · ${b.staff}` : ""}</div>)}
      </Group>
      <Group icon="check" title="Finished? Close them out" items={todo.toClose} hot empty="All past bookings are closed.">
        {todo.toClose.slice(0, 8).map((b) => (
          <div key={b.id} className="list-item" style={{ padding: "6px 0" }}>
            <span className="small"><b>{b.name}</b> · {b.when}</span>
            <span className="row nowrap">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => bookingAction(b.id, "complete"), "Marked done. You can now ask for feedback.")}>Done</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => bookingAction(b.id, "no_show"), "Marked as no-show.")}>No-show</button>
            </span>
          </div>
        ))}
      </Group>
      <Group icon="phone" title="Follow-ups due" items={todo.followUps} hot empty="No follow-ups due. Set dates on customer cards.">
        {todo.followUps.map((c) => <Link key={c.id} href={`/portal/business/customers?c=${c.id}`} className="small row between"><span><b>{c.name}</b> · due {c.followUpAt}</span><Icon name="arrow" size={14} /></Link>)}
      </Group>
      <Group icon="refresh" title="Win back" items={todo.lapsed} empty="No lapsed customers.">
        {todo.lapsed.map((c) => <Link key={c.id} href={`/portal/business/customers?c=${c.id}`} className="small row between"><span><b>{c.name}</b> · last visit {c.lastVisit}</span><Icon name="arrow" size={14} /></Link>)}
        <span className="hint">Consider a &ldquo;we miss you&rdquo; campaign to the Lapsed stage in Marketing.</span>
      </Group>
    </div>
  );
}

const blankCampaign = { name: "", subject: "", body: "Hi {{first_name}},\n\n\n\nBook online: {{booking_link}}\n\n{{business}}", stages: [], tags: "" };

function Marketing({ campaigns, customers, mailer, businessName, run, copy, busy }) {
  const [editing, setEditing] = useState(null);
  const [c, setC] = useState(blankCampaign);
  const reachable = useMemo(() => {
    const tags = String(c.tags).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    return customers.filter((x) => x.reachable && (!c.stages.length || c.stages.includes(x.stage)) && (!tags.length || x.tags.some((t) => tags.includes(t)))).length;
  }, [customers, c]);
  const consented = customers.filter((x) => x.reachable).length;
  const edit = (campaign) => { setEditing(campaign?.id || "new"); setC(campaign ? { ...campaign, tags: (campaign.tags || []).join(", ") } : blankCampaign); };
  const save = async () => {
    const result = await run(() => post({ action: "saveCampaign", id: editing === "new" ? null : editing, campaign: { ...c, tags: c.tags } }), "Campaign saved.");
    if (result?.id) setEditing(result.id);
  };

  return (
    <div className="grid-main mt fade-in" style={{ alignItems: "start" }}>
      <div className="stack">
        <div className="row between">
          <span className="small muted">{consented} customer{consented === 1 ? "" : "s"} agreed to marketing{mailer ? "" : " · email sending not set up: export the list or copy the text"}</span>
          <button type="button" id="new-campaign" className="btn btn-primary btn-sm" onClick={() => edit(null)}><Icon name="plus" size={14} /> New campaign</button>
        </div>
        {campaigns.length === 0 && <Empty icon="megaphone" title="No campaigns yet">Announce a new service, fill quiet days, or win back lapsed customers.</Empty>}
        {campaigns.map((x) => (
          <div key={x.id} className="list-item">
            <div style={{ minWidth: 0 }}><b>{x.name}</b><div className="hint truncate">{x.subject}</div></div>
            <div className="row nowrap">
              <span className={`badge s-${x.status === "SENT" ? "COMPLETED" : "DRAFT"}`}>{x.status === "SENT" ? `sent to ${x.sentCount}${x.sentVia === "MANUAL" ? " (by you)" : ""}` : "draft"}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(x)}>{x.status === "SENT" ? "View" : "Edit"}</button>
              {x.status === "SENT" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { edit({ ...x, id: undefined, name: `${x.name} (copy)` }); setEditing("new"); }}>Duplicate</button>}
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="card stack-sm">
          <div className="card-title"><h3>{editing === "new" ? "New campaign" : c.name}</h3><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={() => setEditing(null)}><Icon name="x" size={16} /></button></div>
          {(() => {
            const locked = c.status === "SENT";
            return (
              <>
                <div className="field"><label htmlFor="cp-name">Internal name</label><input id="cp-name" className="input" disabled={locked} maxLength={100} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
                <div className="field"><label htmlFor="cp-subject">Subject</label><input id="cp-subject" className="input" disabled={locked} maxLength={150} value={c.subject} onChange={(e) => setC({ ...c, subject: e.target.value })} /></div>
                <div className="field"><label htmlFor="cp-body">Message</label><textarea id="cp-body" className="textarea" rows={9} disabled={locked} maxLength={5000} value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} /><span className="hint">{"{{first_name}} {{business}} {{booking_link}}"} are filled in for each customer. An unsubscribe link is added to every email.</span></div>
                <div className="field"><label>Audience</label>
                  <div className="row">{STAGES.map((s) => <label key={s.key} className="row nowrap small"><input type="checkbox" disabled={locked} checked={c.stages.includes(s.key)} onChange={(e) => setC({ ...c, stages: e.target.checked ? [...c.stages, s.key] : c.stages.filter((x) => x !== s.key) })} />{s.label}</label>)}</div>
                  <input className="input mt-sm" disabled={locked} placeholder="Only these tags (comma separated, optional)" value={c.tags} onChange={(e) => setC({ ...c, tags: e.target.value })} />
                  <span className="hint"><b>{reachable}</b> customer{reachable === 1 ? "" : "s"} will receive it: only those who agreed to marketing and have not unsubscribed.</span>
                </div>
                {!locked && (
                  <div className="row">
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={save}>Save draft</button>
                    {editing !== "new" && <a className="btn btn-ghost" href={`/api/business/growth/campaigns/${editing}/recipients`}><Icon name="download" size={14} /> Export list</a>}
                    <button type="button" className="btn btn-ghost" onClick={() => copy(c.body.replaceAll("{{business}}", businessName), "Message copied.")}><Icon name="clipboard" size={14} /> Copy text</button>
                    {editing !== "new" && mailer && <button type="button" className="btn btn-primary" disabled={busy || !reachable} onClick={() => run(() => post({ action: "sendCampaign", id: editing, mode: "EMAIL" }), (r) => `Sent to ${r.sent} of ${r.of}.`)}><Icon name="send" size={14} /> Send {reachable} emails</button>}
                    {editing !== "new" && <button type="button" className="btn btn-ghost" disabled={busy || !reachable} onClick={() => run(() => post({ action: "sendCampaign", id: editing, mode: "MANUAL" }), "Recorded as sent from your own tool.")}>I sent it myself</button>}
                  </div>
                )}
                {locked && <p className="small muted">Sent {fmt(c.sentAt)}. Duplicate it to send again.</p>}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Feedback({ feedback, completedWithoutRequest, run, copy, busy }) {
  const average = feedback.length ? feedback.reduce((a, f) => a + f.rating, 0) / feedback.length : null;
  const ask = async (b) => {
    const r = await run(() => post({ action: "requestFeedback", bookingId: b.id }), "Feedback link created.");
    if (r?.url) copy(`Hi ${b.name.split(" ")[0]}, thank you for visiting! Would you tell us how it went? ${r.url}`, "Link created and message copied. Send it to the customer.");
  };
  return (
    <div className="grid-main mt fade-in" style={{ alignItems: "start" }}>
      <div className="stack">
        <div className="row between"><h3 style={{ margin: 0 }}>Feedback received</h3>{average && <span className="pill"><Icon name="star" size={12} /> {average.toFixed(1)} average · {feedback.length}</span>}</div>
        {feedback.length === 0 && <Empty icon="star" title="No feedback yet">Ask customers after a visit. Featured feedback with their permission appears on your public page.</Empty>}
        {feedback.map((f) => (
          <div key={f.id} className={`biz-review ${f.seenAt ? "" : "glow-border"}`}>
            <div className="row between">
              <span className="stars">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
              <span className="small muted">{f.displayName} · {f.serviceName} · {fmt(f.createdAt)}</span>
            </div>
            {f.comment && <p className="small" style={{ margin: "6px 0" }}>{f.comment}</p>}
            <div className="row">
              {!f.seenAt && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => post({ action: "updateFeedback", id: f.id }), "Marked as read.")}>Mark read</button>}
              {f.publishConsent
                ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => post({ action: "updateFeedback", id: f.id, featured: !f.featured }), f.featured ? "Removed from your page." : "Now shown on your public page.")}>{f.featured ? "Hide from my page" : "Show on my page"}</button>
                : <span className="hint">Private: the customer did not allow publishing.</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="card stack-sm">
        <h3 style={{ margin: 0 }}>Ask for feedback</h3>
        <p className="small muted" style={{ margin: 0 }}>Completed visits you have not asked about yet.</p>
        {completedWithoutRequest.length === 0 && <p className="small">Nothing to ask. Mark bookings as done first.</p>}
        {completedWithoutRequest.map((b) => (
          <div key={b.id} className="list-item" style={{ padding: "6px 0" }}>
            <span className="person small"><Avatar name={b.name} size="sm" /><span><b>{b.name}</b><br /><span className="muted">{b.service} · {b.when}</span></span></span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask(b)}>Get link</button>
          </div>
        ))}
      </div>
    </div>
  );
}
