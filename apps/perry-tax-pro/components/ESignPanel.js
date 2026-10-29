"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

const STATUS = {
  SENT: ["Waiting for signature", "s-REQUESTED"],
  PARTIAL: ["Partly signed", "s-REQUESTED"],
  COMPLETED: ["Signed", "s-ACCEPTED"],
  DECLINED: ["Declined by a signer", "s-CANCELLED"],
  CANCELLED: ["Cancelled", "s-CANCELLED"],
};
const SIGNER = { sent: "Not opened", awaiting: "Not opened", opened: "Opened", completed: "Signed", declined: "Declined" };

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = () => reject(new Error("The file could not be read."));
  reader.readAsDataURL(file);
});

// Preparer panel: send Form 8879 for online signing with an identity check, follow
// each signer, and cancel to send a corrected form.
export default function ESignPanel({ returnId, signature, available, jointReturn }) {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [spouse, setSpouse] = useState({ name: "", email: "" });
  const [state, setState] = useState({});
  const open = signature && ["SENT", "PARTIAL"].includes(signature.status);

  const post = async (body, ok) => {
    setState({ busy: body.action });
    try {
      const res = await fetch("/api/esign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnId, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setState({ ok });
      setFile(null);
      router.refresh();
    } catch (error) {
      setState({ error: error.message });
    }
  };

  const send = async () => {
    if (!file) return setState({ error: "Choose the Form 8879 PDF first." });
    if (file.size > 8 * 1024 * 1024) return setState({ error: "The PDF must be 8 MB or smaller." });
    post({ action: "send", pdf: await toBase64(file), spouseName: spouse.name, spouseEmail: spouse.email }, "Sent. The client can sign from their portal; any spouse gets an email.");
  };

  if (!available) return null;
  const [label, tone] = STATUS[signature?.status] || ["Not sent", ""];
  return (
    <div className="card stack-sm" id="esign-panel">
      <div className="card-title">
        <div className="kicker"><Icon name="pen" size={14} /> Online signature · Form 8879</div>
        <span className={`badge ${tone}`}>{label}</span>
      </div>
      {signature && signature.status !== "CANCELLED" && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {signature.signers.map((s) => <li key={s.role}><b>{s.name}</b> ({s.role.toLowerCase()}): {SIGNER[s.status] || s.status}{s.completedAt ? `, ${new Date(s.completedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}</li>)}
        </ul>
      )}
      {signature?.status === "COMPLETED" && <span className="hint">The signed form and the identity-check audit trail are saved in this return&apos;s documents. Keep them for 3 years.</span>}
      {open ? (
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!state.busy} onClick={() => post({ action: "sync" }, "Status updated.")}><Icon name="refresh" size={14} /> Check status</button>
          <button type="button" className="btn btn-danger btn-sm" disabled={!!state.busy} onClick={() => post({ action: "cancel" }, "Request cancelled. You can send a corrected form.")}>Cancel request</button>
        </div>
      ) : signature?.status !== "COMPLETED" && (
        <div className="stack-sm">
          <div className="field">
            <label htmlFor="esign-pdf">Form 8879 PDF from your tax software</label>
            <input id="esign-pdf" type="file" accept="application/pdf" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <span className="hint">Use the official IRS layout. Signature, date and identity-check fields are placed automatically.</span>
          </div>
          {jointReturn && (
            <div className="form-grid">
              <div className="field"><label htmlFor="esign-spouse-name">Spouse&apos;s name</label><input id="esign-spouse-name" className="input" maxLength={100} value={spouse.name} onChange={(e) => setSpouse({ ...spouse, name: e.target.value })} /></div>
              <div className="field"><label htmlFor="esign-spouse-email">Spouse&apos;s email</label><input id="esign-spouse-email" type="email" className="input" value={spouse.email} onChange={(e) => setSpouse({ ...spouse, email: e.target.value })} /></div>
            </div>
          )}
          <button type="button" id="esign-send" className="btn btn-primary btn-sm" disabled={!!state.busy} onClick={send}><Icon name="send" size={14} /> {state.busy === "send" ? "Sending…" : "Send for signature"}</button>
          <span className="hint">Each signer answers identity questions before signing (IRS Pub. 1345). After 3 failed attempts they must sign on paper.</span>
        </div>
      )}
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
    </div>
  );
}
