"use client";
import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { mediaUrl } from "@/lib/business-display";

const MAX_PHOTOS = 60;

// Shrinks a large photo before upload (the server accepts 2 MB): longest side 2000 px, JPEG.
async function shrink(file) {
  if (file.size <= 1.5 * 1024 * 1024 && /image\/(jpeg|png|webp)/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
}

// The owner's photos of their work, shown on their public page ("Our work").
export default function WorkGallery({ initial = [], publicUrl = null }) {
  const [photos, setPhotos] = useState(initial);
  const [state, setState] = useState({});
  const [drag, setDrag] = useState(false);
  const [captions, setCaptions] = useState({});
  const input = useRef(null);
  const left = MAX_PHOTOS - photos.length;

  const add = async (fileList) => {
    const files = [...fileList].filter((file) => file.type.startsWith("image/")).slice(0, Math.min(10, left));
    if (!files.length) return setState({ error: left ? "Choose JPG, PNG or WebP photos." : `You can keep up to ${MAX_PHOTOS} photos. Remove one first.` });
    const added = [];
    const failed = [];
    for (let i = 0; i < files.length; i++) {
      setState({ busy: `Uploading ${i + 1} of ${files.length}…` });
      try {
        const form = new FormData();
        form.append("file", await shrink(files[i]));
        const res = await fetch("/api/business/portfolio", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "The photo could not be uploaded.");
        added.push(data.photo);
      } catch (error) {
        failed.push(error.message);
      }
    }
    setPhotos((cur) => [...added, ...cur]);
    setState(failed.length ? { error: `${added.length} added. ${failed[0]}` } : { ok: added.length > 1 ? `${added.length} photos added. Add a caption to each one: it helps customers and search engines.` : "Photo added. Add a caption: it helps customers and search engines." });
  };

  const saveCaption = async (photo) => {
    const caption = captions[photo.id];
    if (caption === undefined || caption === photo.caption) return;
    const res = await fetch("/api/business/portfolio", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id, caption }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setState({ error: data.error || "The caption could not be saved." });
    setPhotos((cur) => cur.map((p) => (p.id === photo.id ? { ...p, caption: data.photo.caption } : p)));
    setCaptions(({ [photo.id]: _done, ...rest }) => rest);
    setState({ ok: "Caption saved." });
  };

  const remove = async (photo) => {
    if (!window.confirm("Remove this photo from your public page?")) return;
    const res = await fetch(`/api/business/portfolio?id=${encodeURIComponent(photo.id)}`, { method: "DELETE" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setState({ error: data.error || "The photo could not be removed." });
    setPhotos((cur) => cur.filter((p) => p.id !== photo.id));
    setState({ ok: "Photo removed." });
  };

  return (
    <section className="card stack" id="portfolio" aria-labelledby="gallery-title">
      <div className="card-title">
        <div>
          <h2 id="gallery-title">Photos of your work</h2>
          <p className="small muted">They appear on your public page under “Our work”, where they help new customers choose you.</p>
        </div>
        <span className="pill">{photos.length} / {MAX_PHOTOS}</span>
      </div>

      <div
        className={`gallery-drop${drag ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!state.busy) add(e.dataTransfer.files); }}
      >
        <Icon name="image" size={26} />
        <div>
          <b>{state.busy || "Drop photos here"}</b>
          <span className="small muted">JPG, PNG or WebP · up to 10 at a time · large photos are resized for you</span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!state.busy || left <= 0} onClick={() => input.current?.click()}><Icon name="upload" size={15} /> Choose photos</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { const files = e.target.files; add(files); e.target.value = ""; }} />
      </div>

      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success" role="status"><Icon name="check" size={16} />{state.ok}</div>}

      {photos.length > 0 ? (
        <ul className="gallery-grid">
          {photos.map((ph) => (
            <li key={ph.id} className="gallery-tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(ph.path)} alt={ph.caption || "Photo of your work"} loading="lazy" />
              <button type="button" className="gallery-remove" onClick={() => remove(ph)} aria-label={`Remove ${ph.caption || "this photo"}`}><Icon name="trash" size={15} /></button>
              <label className="sr-only" htmlFor={`cap-${ph.id}`}>Caption</label>
              <input
                id={`cap-${ph.id}`}
                className="gallery-caption"
                placeholder="Add a caption…"
                maxLength={120}
                value={captions[ph.id] ?? ph.caption}
                onChange={(e) => setCaptions((c) => ({ ...c, [ph.id]: e.target.value }))}
                onBlur={() => saveCaption(ph)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted center">No photos yet. Before-and-after shots, finished projects and your workspace work best.</p>
      )}
      {publicUrl && photos.length > 0 && <a href={publicUrl} target="_blank" rel="noopener" className="small grad-text">See them on your public page <Icon name="arrow" size={13} /></a>}
    </section>
  );
}
