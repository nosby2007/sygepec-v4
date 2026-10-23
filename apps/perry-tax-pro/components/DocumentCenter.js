"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, fmtDate } from "@/lib/constants";
import Icon from "@/components/Icon";
import { ProgressRing } from "@/components/charts";

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ext = (name = "") => (name.split(".").pop() || "file").slice(0, 4).toUpperCase();

export default function DocumentCenter({ returnId, docs, checklist, canDelete = true }) {
  const [type, setType] = useState(checklist.find((t) => !docs.some((d) => d.type === t)) || "OTHER");
  const [drag, setDrag] = useState(false);
  const [state, setState] = useState({});
  const input = useRef(null);
  const router = useRouter();
  const have = new Set(docs.map((d) => d.type));
  const received = checklist.filter((t) => have.has(t)).length;
  const ratio = checklist.length ? received / checklist.length : 0;

  const upload = async (files) => {
    if (!files?.length) return;
    setState({ busy: true });
    for (const file of files) {
      const fd = new FormData();
      fd.append("returnId", returnId);
      fd.append("type", type);
      fd.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return setState({ error: data.error || "Upload failed" });
      }
    }
    setState({ ok: `${files.length} file${files.length > 1 ? "s" : ""} uploaded` });
    if (input.current) input.current.value = "";
    router.refresh();
  };

  const remove = async (id) => {
    if (!confirm("Remove this document?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", alignItems: "start" }}>
      <div className="card">
        <div className="card-title">
          <div><h3>Your checklist</h3><div className="sub">Tap an item to upload it</div></div>
          <ProgressRing value={ratio} size={64} thickness={7} label="Checklist completion">
            <b style={{ fontSize: "0.85rem" }}>{received}/{checklist.length}</b>
          </ProgressRing>
        </div>
        {checklist.map((t) => (
          <div key={t} className={`list-item clickable ${type === t ? "selected" : ""}`} onClick={() => setType(t)}>
            <div className="row nowrap">
              <span className={`check ${have.has(t) ? "ok" : ""}`}>{have.has(t) ? <Icon name="check" size={14} stroke={3} /> : ""}</span>
              <span className="small" style={{ color: have.has(t) ? "var(--muted)" : "var(--text)", textDecoration: have.has(t) ? "line-through" : "none" }}>{DOC_TYPES[t]}</span>
            </div>
            {!have.has(t) && <span className="badge s-DOCS_PENDING">Needed</span>}
          </div>
        ))}
      </div>

      <div className="stack">
        <div className="card stack">
          <div className="card-title" style={{ marginBottom: 0 }}><h3>Upload documents</h3><span className="pill"><Icon name="lock" size={12} /> Encrypted</span></div>
          <div className="field">
            <label htmlFor="doc-type">Document type</label>
            <select id="doc-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div
            className={`dropzone ${drag ? "drag" : ""}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]); }}
          >
            <div className="icon-badge teal"><Icon name="upload" size={24} /></div>
            <p style={{ color: "var(--text)", fontWeight: 600 }}>{state.busy ? "Uploading…" : "Drop files here or click to browse"}</p>
            <p className="hint">PDF, JPG, PNG, HEIC · up to 10 MB each</p>
            {state.busy && <div className="progress-bar"><span /></div>}
            <input id="doc-file" ref={input} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" onChange={(e) => upload([...e.target.files])} />
          </div>
          {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
          {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
        </div>

        <div className="card">
          <div className="card-title"><h3>Uploaded files</h3><span className="pill info">{docs.length}</span></div>
          {docs.length === 0 && <div className="empty" style={{ padding: 20 }}><div className="icon-badge"><Icon name="file" size={22} /></div><b>Nothing uploaded yet</b></div>}
          {docs.map((d) => (
            <div key={d.id} className="list-item">
              <div className="row nowrap" style={{ minWidth: 0 }}>
                <span className={`file-ico ${/^image\//.test(d.mime || "") ? "img" : ""}`}>{ext(d.filename)}</span>
                <div style={{ minWidth: 0 }}>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: "0.92rem", wordBreak: "break-all" }}>{d.filename}</a>
                  <div className="hint">{DOC_TYPES[d.type]} · {kb(d.size)} · {fmtDate(d.created_at)}</div>
                </div>
              </div>
              {canDelete && <button className="btn btn-ghost btn-icon" onClick={() => remove(d.id)} aria-label={`Remove ${d.filename}`}><Icon name="x" size={16} /></button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
