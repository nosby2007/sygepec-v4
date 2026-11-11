"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { mediaUrl } from "@/lib/business-display";
import { CMS_TYPES, PAGE_SLUGS, slugify } from "@/lib/cms-shared";

const fmt = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const ACTIONS = { draft: "Saved as draft", publish: "Published", schedule: "Scheduled", archive: "Archived", restore: "Restored as draft", image: "Image changed" };

export default function ContentEditor({ initial, revisions }) {
  const router = useRouter();
  const [e, setE] = useState(initial);
  const [scheduleAt, setScheduleAt] = useState("");
  const [state, setState] = useState({});
  const isNew = !initial.id;
  const f = e.fields || {};
  const set = (key) => (ev) => setE({ ...e, [key]: ev.target.value, ...(key === "title" && isNew && e.type !== "PAGE" ? { slug: slugify(ev.target.value) } : {}) });
  const setField = (key, value) => setE({ ...e, fields: { ...f, [key]: value } });
  const listOf = (key) => f[key] || [];

  const save = async (intent) => {
    setState({ busy: intent });
    const publishAt = intent === "schedule" ? new Date(scheduleAt).getTime() : undefined;
    const res = await fetch(isNew ? "/api/cms/entries" : `/api/cms/entries/${e.id}`, {
      method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry: e, intent, publishAt }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The content could not be saved." });
    if (isNew) return router.push(`/admin/content/${body.entry.id}`);
    setState({ ok: ACTIONS[intent] });
    router.refresh();
  };

  const upload = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("entryId", e.id);
    form.set("file", file);
    setState({ busy: "image" });
    const res = await fetch("/api/cms/media", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    ev.target.value = "";
    if (!res.ok) return setState({ error: body.error || "The image could not be uploaded." });
    setState({ ok: "Image updated." });
    router.refresh();
  };

  const statusLine = {
    DRAFT: "Draft: only staff can see it.",
    SCHEDULED: e.visibleFrom ? `Scheduled: goes live ${fmt(e.visibleFrom)}.` : "Scheduled.",
    PUBLISHED: `Published${e.visibleFrom ? ` since ${fmt(e.visibleFrom)}` : ""}.`,
    ARCHIVED: "Archived: hidden from the site. Restore it to edit and publish again.",
  }[e.status];

  return (
    <div className="grid-main" style={{ alignItems: "start" }}>
      <div className="card stack">
        <div className="field"><label htmlFor="cms-title">{e.type === "TEAM" ? "Name" : "Title"}</label><input id="cms-title" className="input" maxLength={200} value={e.title} onChange={set("title")} /></div>
        {e.type === "PAGE" ? (
          <div className="field">
            <label htmlFor="cms-slug">Page</label>
            <select id="cms-slug" className="input select" value={e.slug} onChange={set("slug")}>
              <option value="">Choose…</option>
              {PAGE_SLUGS.map((s) => <option key={s} value={s}>/{s}</option>)}
            </select>
          </div>
        ) : (
          <div className="field"><label htmlFor="cms-slug">Link</label><input id="cms-slug" className="input" maxLength={80} value={e.slug} onChange={(ev) => setE({ ...e, slug: slugify(ev.target.value) })} /><span className="hint">{CMS_TYPES[e.type].path(e.slug || "…")}</span></div>
        )}
        <div className="field"><label htmlFor="cms-summary">{e.type === "TEAM" ? "Short bio" : "Summary (search results and cards)"}</label><textarea id="cms-summary" className="textarea" rows={2} maxLength={400} value={e.summary} onChange={set("summary")} /></div>

        {e.type === "SERVICE" && (
          <>
            <div className="field"><label htmlFor="cms-benefits">Benefits (one per line)</label><textarea id="cms-benefits" className="textarea" rows={4} value={listOf("benefits").join("\n")} onChange={(ev) => setField("benefits", ev.target.value.split("\n"))} /></div>
            <PairList label="How it works" items={listOf("steps")} keys={["title", "text"]} placeholders={["Step", "What happens"]} onChange={(v) => setField("steps", v)} />
            <PairList label="Questions" items={listOf("faqs")} keys={["q", "a"]} placeholders={["Question", "Answer"]} onChange={(v) => setField("faqs", v)} />
            <div className="form-grid">
              <div className="field"><label htmlFor="cms-cta">Button label</label><input id="cms-cta" className="input" maxLength={40} value={f.ctaLabel || ""} placeholder="Book an appointment" onChange={(ev) => setField("ctaLabel", ev.target.value)} /></div>
              <div className="field"><label htmlFor="cms-cta-href">Button goes to</label><input id="cms-cta-href" className="input" maxLength={120} value={f.ctaHref || ""} placeholder="/book" onChange={(ev) => setField("ctaHref", ev.target.value)} /></div>
              <div className="field"><label htmlFor="cms-order">Order on /services</label><input id="cms-order" type="number" className="input" min={0} max={999} value={f.order ?? 100} onChange={(ev) => setField("order", Number(ev.target.value))} /></div>
            </div>
          </>
        )}
        {e.type === "TEAM" && (
          <div className="form-grid">
            <div className="field"><label htmlFor="cms-role">Role</label><input id="cms-role" className="input" maxLength={80} value={f.role || ""} onChange={(ev) => setField("role", ev.target.value)} /></div>
            <div className="field"><label htmlFor="cms-order">Order on /team</label><input id="cms-order" type="number" className="input" min={0} max={999} value={f.order ?? 100} onChange={(ev) => setField("order", Number(ev.target.value))} /></div>
            <div className="field full"><label htmlFor="cms-cred">Credentials (e.g. Enrolled Agent, CPA, PTIN holder)</label><input id="cms-cred" className="input" maxLength={200} value={f.credentials || ""} onChange={(ev) => setField("credentials", ev.target.value)} /></div>
            <label className="full row nowrap small"><input type="checkbox" checked={f.credentialsVerified === true} onChange={(ev) => setField("credentialsVerified", ev.target.checked)} /> I confirm these credentials are current and can be verified (licence or directory lookup).</label>
          </div>
        )}
        {e.type === "POST" && (
          <div className="form-grid">
            <div className="field"><label htmlFor="cms-author">Author</label><input id="cms-author" className="input" maxLength={80} value={f.author || ""} onChange={(ev) => setField("author", ev.target.value)} /></div>
            <div className="field"><label htmlFor="cms-tags">Tags (comma separated)</label><input id="cms-tags" className="input" value={listOf("tags").join(", ")} onChange={(ev) => setField("tags", ev.target.value.split(",").map((t) => t.trim()))} /></div>
          </div>
        )}

        <div className="field">
          <label htmlFor="cms-body">{e.type === "TEAM" ? "More about them (optional)" : "Content"}</label>
          <textarea id="cms-body" className="textarea" rows={14} maxLength={30000} value={e.body} onChange={set("body")} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.88rem" }} />
          <span className="hint">## Heading · ### Subheading · - list item · 1. numbered · **bold** · _italic_ · [link](/book). Blank line = new paragraph.</span>
        </div>
      </div>

      <aside className="stack">
        <div className="card stack-sm">
          <div className="row between"><h3 style={{ margin: 0 }}>Publication</h3><span className={`badge s-${e.status}`}>{e.status.toLowerCase()}</span></div>
          <p className="small" style={{ margin: 0 }}>{isNew ? "Not saved yet." : statusLine}</p>
          {e.status !== "ARCHIVED" ? (
            <>
              <button type="button" id="cms-save" className="btn btn-ghost" disabled={Boolean(state.busy)} onClick={() => save("draft")}>Save as draft</button>
              <button type="button" id="cms-publish" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={() => save("publish")}><Icon name="send" size={16} /> {e.status === "PUBLISHED" ? "Update published version" : "Publish now"}</button>
              <div className="row nowrap">
                <input type="datetime-local" className="input" aria-label="Publication time" value={scheduleAt} onChange={(ev) => setScheduleAt(ev.target.value)} />
                <button type="button" className="btn btn-ghost btn-sm" disabled={!scheduleAt || Boolean(state.busy)} onClick={() => save("schedule")}>Schedule</button>
              </div>
              {!isNew && <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(state.busy)} onClick={() => save("archive")}>Archive</button>}
            </>
          ) : (
            <button type="button" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={() => save("restore")}>Restore as draft</button>
          )}
          {!isNew && <Link href={`/admin/content/${e.id}/preview`} className="btn btn-ghost btn-sm" target="_blank"><Icon name="search" size={14} /> Preview saved version</Link>}
          {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
          {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
          <span className="hint">Times use your computer&apos;s time zone. Publishing checks for [Edit…] placeholders and unverified credentials.</span>
        </div>

        {!isNew && (
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Image</h3>
            {e.imagePath ? <Image unoptimized src={mediaUrl(e.imagePath)} alt="" width={320} height={160} className="cms-cover" /> : <span className="small muted">No image.</span>}
            <label className="btn btn-ghost btn-sm"><Icon name="upload" size={14} /> Upload (JPG, PNG, WebP, 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} /></label>
          </div>
        )}

        {revisions.length > 0 && (
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>History</h3>
            <ul className="timeline-list">
              {revisions.map((r) => (
                <li key={r.id}>
                  <b>v{r.version} · {ACTIONS[r.action] || r.action}</b>
                  <span className="hint">{r.savedByName} · {fmt(r.savedAt)}</span>
                  {r.version !== e.version && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}
                      onClick={() => { const s = r.snapshot; setE({ ...e, title: s.title, slug: s.slug, summary: s.summary, body: s.body, fields: s.fields || {} }); setState({ ok: `Loaded v${r.version} into the editor. Save to keep it.` }); }}>
                      Load this version
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function PairList({ label, items, keys, placeholders, onChange }) {
  const [a, b] = keys;
  return (
    <div className="field">
      <label>{label}</label>
      <div className="stack-sm">
        {items.map((item, i) => (
          <div key={i} className="stack-sm" style={{ borderLeft: "3px solid var(--border-strong)", paddingLeft: 10 }}>
            <div className="row nowrap">
              <input className="input" placeholder={placeholders[0]} value={item[a] || ""} onChange={(ev) => onChange(items.map((x, j) => (j === i ? { ...x, [a]: ev.target.value } : x)))} />
              <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
            </div>
            <textarea className="textarea" rows={2} placeholder={placeholders[1]} value={item[b] || ""} onChange={(ev) => onChange(items.map((x, j) => (j === i ? { ...x, [b]: ev.target.value } : x)))} />
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...items, { [a]: "", [b]: "" }])}><Icon name="plus" size={14} /> Add</button>
      </div>
    </div>
  );
}
