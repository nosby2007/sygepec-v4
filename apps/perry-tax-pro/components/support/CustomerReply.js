"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/Icon";
import { newKey, send } from "@/components/support/request";

export default function CustomerReply({ ticketId, open }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [state, setState] = useState({});
  const [key, setKey] = useState(newKey);
  if (!open) return <p className="small muted">This request is closed. If you still need help, please open a new one.</p>;
  const post = async () => {
    setState({ busy: true });
    const { error } = await send(`/api/support/my/tickets/${ticketId}/messages`, "POST", { body, idempotencyKey: key });
    if (error) return setState({ error });
    setBody("");
    setKey(newKey());
    setState({});
    router.refresh();
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setState({ busy: true });
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/support/my/tickets/${ticketId}/attachments`, { method: "POST", body: form }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setState(res?.ok ? {} : { error: data?.error || "The file could not be added." });
    router.refresh();
  };
  return (
    <div className="stack-sm">
      <div className="field"><label htmlFor="c-body">Your reply</label><textarea id="c-body" className="textarea" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        <span className="hint">Please do not include your Social Security number or bank details here.</span></div>
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row">
        <button type="button" id="c-send" className="btn btn-primary btn-sm" disabled={!body.trim() || state.busy} onClick={post}>{state.busy ? "Sending…" : "Send reply"}</button>
        <label className="btn btn-ghost btn-sm"><Icon name="upload" size={14} /> Add a file<input type="file" hidden disabled={state.busy} accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" onChange={upload} /></label>
      </div>
    </div>
  );
}
