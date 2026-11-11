"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import Icon from "@/components/Icon";
import Sheet from "@/components/mobile/Sheet";
import { shareLink, tap } from "@/components/mobile/native";

// Shrinks a phone photo before upload (the server accepts 2 MB): longest side 1600 px, JPEG.
async function shrink(file) {
  if (file.size <= 1.5 * 1024 * 1024 && /image\/(jpeg|png|webp)/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
}

async function upload(url, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The photo could not be uploaded.");
  return data;
}

// Tapping the element opens the camera or gallery, then uploads as the logo or cover.
export function ImagePicker({ target, label, disabled, className, style, children }) {
  const router = useRouter();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await upload("/api/business/media", { target, file: await shrink(file) });
      router.refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={className} style={style} aria-label={label} disabled={disabled || busy} onClick={() => input.current?.click()}>
        {busy ? <Icon name="refresh" size={24} /> : children}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
    </>
  );
}

export function CoverTools({ publicUrl, name, hasProfile }) {
  const [qr, setQr] = useState(false);
  return (
    <div className="m-cover-tools">
      <Link href="/portal/business/profile" aria-label="Edit business details"><Icon name="edit" size={22} /></Link>
      <ImagePicker target="cover" label="Change cover photo" disabled={!hasProfile}><Icon name="camera" size={22} /></ImagePicker>
      {publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label="See your public page"><Icon name="eye" size={22} /></a>}
      <button type="button" className="push" disabled={!publicUrl} onClick={() => setQr(true)}>Share Profile <Icon name="qr" size={20} /></button>
      {qr && <ShareSheet url={publicUrl} name={name} onClose={() => setQr(false)} />}
    </div>
  );
}

function ShareSheet({ url, name, onClose }) {
  const [svg, setSvg] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, width: 220 }).then(setSvg).catch(() => setSvg(""));
  }, [url]);
  return (
    <Sheet title="Share your profile" onClose={onClose}>
      <p className="m-sub">Clients scan this code to see your services and book. Print it for your front desk or mirror.</p>
      {/* Generated locally from your own page link; contains no script. */}
      <div className="m-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="m-search" style={{ fontSize: 14 }}><Icon name="link" size={18} /><input readOnly value={url} aria-label="Your page link" onFocus={(e) => e.target.select()} /></div>
      <button type="button" className="m-btn" onClick={async () => { const r = await shareLink({ title: name, text: `Book with ${name} online:`, url }); if (r === "copied") setNote("Link copied."); }}><Icon name="share" size={18} /> Share link</button>
      {note && <div className="m-alert ok">{note}</div>}
    </Sheet>
  );
}

export function ShareButton({ title, text, url, label, disabled }) {
  const [note, setNote] = useState("");
  return (
    <>
      <button type="button" className="m-btn" disabled={disabled || !url} onClick={async () => { tap(); const r = await shareLink({ title, text, url }); setNote(r === "copied" ? "Link copied. Paste it anywhere." : ""); }}><Icon name="share" size={18} /> {label}</button>
      {disabled && <p className="m-sub m-gap" style={{ margin: "8px 0 0" }}>Publish your page first.</p>}
      {note && <div className="m-alert ok">{note}</div>}
    </>
  );
}

export function Portfolio({ photos, disabled }) {
  const router = useRouter();
  const input = useRef(null);
  const [state, setState] = useState({});
  const [open, setOpen] = useState(null);
  const add = async (e) => {
    const files = [...(e.target.files || [])].slice(0, 10);
    e.target.value = "";
    if (!files.length) return;
    setState({ busy: `Uploading 1 of ${files.length}…` });
    try {
      for (let i = 0; i < files.length; i++) {
        setState({ busy: `Uploading ${i + 1} of ${files.length}…` });
        await upload("/api/business/portfolio", { file: await shrink(files[i]) });
      }
      setState({ ok: files.length > 1 ? `${files.length} photos added.` : "Photo added." });
      router.refresh();
    } catch (err) {
      setState({ error: err.message });
    }
  };
  const remove = async (photo) => {
    if (!window.confirm("Remove this photo from your portfolio?")) return;
    setState({ busy: "Removing…" });
    const res = await fetch(`/api/business/portfolio?id=${photo.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: data.error || "The photo could not be removed." });
    setOpen(null);
    setState({});
    router.refresh();
  };
  return (
    <>
      {photos.length > 0 ? (
        <div className="m-photos">
          {photos.map((ph) => (
            <button key={ph.id} type="button" className="m-photo" style={{ border: 0, padding: 0 }} onClick={() => setOpen(ph)} aria-label={ph.caption || "Portfolio photo"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={ph.caption || ""} loading="lazy" />
            </button>
          ))}
        </div>
      ) : (
        <div className="m-card"><p>Show your best work. Photos appear on your public page, where they help new clients choose you.</p></div>
      )}
      <div className="m-btns m-gap">
        <button type="button" className="m-btn ghost" disabled={disabled || !!state.busy} onClick={() => input.current?.click()}><Icon name="camera" size={20} /> {state.busy || "Add from phone"}</button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={add} />
      {state.error && <div className="m-alert">{state.error}</div>}
      {state.ok && <div className="m-alert ok">{state.ok}</div>}
      {open && (
        <Sheet title="Portfolio photo" onClose={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt={open.caption || ""} style={{ width: "100%", borderRadius: 14, marginBottom: 14 }} />
          <button type="button" className="m-btn danger" disabled={!!state.busy} onClick={() => remove(open)}><Icon name="trash" size={18} /> Remove photo</button>
        </Sheet>
      )}
    </>
  );
}
