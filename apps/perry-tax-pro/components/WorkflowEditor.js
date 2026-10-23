"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SIGNATURE_METHODS, SIGNATURE_STATUSES, SUBMISSION_STATUSES } from "@/lib/constants";

export default function WorkflowEditor({ item, mode = "both", compact = false }) {
  const [signatureStatus, setSignatureStatus] = useState(item.signature_status);
  const [signatureMethod, setSignatureMethod] = useState(item.signature_method || "REMOTE");
  const [submissionStatus, setSubmissionStatus] = useState(item.submission_status);
  const [submissionReference, setSubmissionReference] = useState(item.submission_reference || "");
  const [submissionNotes, setSubmissionNotes] = useState(item.submission_notes || "");
  const [state, setState] = useState({});
  const router = useRouter();

  const save = async () => {
    setState({ busy: true });
    const payload = mode === "signature"
      ? { signatureStatus, signatureMethod }
      : mode === "submission"
        ? { submissionStatus, submissionReference, submissionNotes }
        : { signatureStatus, signatureMethod, submissionStatus, submissionReference, submissionNotes };
    const response = await fetch(`/api/returns/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState({ error: data.error || "Update failed." });
      return;
    }
    setState({ ok: true });
    router.refresh();
  };

  return (
    <div className={`workflow-editor ${compact ? "compact" : ""}`}>
      {(mode === "signature" || mode === "both") && (
        <>
          <div className="field">
            <label htmlFor={`signature-${item.id}`}>Signature status</label>
            <select id={`signature-${item.id}`} className="select" value={signatureStatus} onChange={(event) => setSignatureStatus(event.target.value)}>
              {SIGNATURE_STATUSES.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`signature-method-${item.id}`}>Verification method</label>
            <select id={`signature-method-${item.id}`} className="select" value={signatureMethod} onChange={(event) => setSignatureMethod(event.target.value)}>
              {SIGNATURE_METHODS.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}
            </select>
          </div>
        </>
      )}
      {(mode === "submission" || mode === "both") && (
        <>
          <div className="field">
            <label htmlFor={`submission-${item.id}`}>E-file status</label>
            <select id={`submission-${item.id}`} className="select" value={submissionStatus} onChange={(event) => setSubmissionStatus(event.target.value)}>
              {SUBMISSION_STATUSES.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
            </select>
          </div>
          {!compact && (
            <>
              <div className="field">
                <label htmlFor={`submission-reference-${item.id}`}>Submission reference</label>
                <input id={`submission-reference-${item.id}`} className="input" maxLength={120} placeholder="IRS acknowledgement or tracking ID" value={submissionReference} onChange={(event) => setSubmissionReference(event.target.value)} />
              </div>
              <div className="field workflow-notes">
                <label htmlFor={`submission-notes-${item.id}`}>Internal submission notes</label>
                <textarea id={`submission-notes-${item.id}`} className="textarea" maxLength={1000} placeholder="Rejection code, correction required, or filing note" value={submissionNotes} onChange={(event) => setSubmissionNotes(event.target.value)} />
              </div>
            </>
          )}
        </>
      )}
      <div className="workflow-save">
        {state.ok && <span className="small" style={{ color: "var(--green)" }}>✓ Saved</span>}
        {state.error && <span className="small" style={{ color: "var(--rose)" }}>{state.error}</span>}
        <button className="btn btn-primary btn-sm" disabled={state.busy} onClick={save}>{state.busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
