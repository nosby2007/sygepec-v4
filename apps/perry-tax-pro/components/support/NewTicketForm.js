"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/Icon";
import { newKey, send } from "@/components/support/request";
import { CATEGORIES, PRIORITIES } from "@/lib/support-rules";

// Used by staff (customerUid and priority) and by customers (neither).
export default function NewTicketForm({ customerUid = null, customerName = null, endpoint, doneBase, staff = false }) {
  const router = useRouter();
  const [f, setF] = useState({ subject: "", body: "", category: "", subcategory: "", priority: "normal" });
  const [state, setState] = useState({});
  const [key] = useState(newKey);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === "category" ? { subcategory: "" } : {}) });
  const submit = async () => {
    setState({ busy: true });
    const body = { subject: f.subject, body: f.body, category: f.category, subcategory: f.subcategory || null, idempotencyKey: key, ...(staff ? { customerUid, priority: f.priority } : {}) };
    const { data, error } = await send(endpoint, "POST", body);
    if (error) return setState({ error });
    router.push(`${doneBase}/${data.id}`);
  };
  const topics = f.category ? CATEGORIES[f.category].subcategories : null;
  return (
    <div className="card stack" style={{ maxWidth: 720 }}>
      {customerName && <p className="small">For <b>{customerName}</b></p>}
      <div className="grid-2">
        <div className="field"><label htmlFor="n-category">What is this about?</label>
          <select id="n-category" className="select" value={f.category} onChange={set("category")}>
            <option value="">Choose one</option>
            {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="n-topic">Topic</label>
          <select id="n-topic" className="select" value={f.subcategory} disabled={!topics} onChange={set("subcategory")}>
            <option value="">Choose one</option>
            {Object.entries(topics || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
      </div>
      {staff && <div className="field"><label htmlFor="n-priority">Priority</label>
        <select id="n-priority" className="select" style={{ maxWidth: 200 }} value={f.priority} onChange={set("priority")}>
          {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>}
      <div className="field"><label htmlFor="n-subject">Subject</label><input id="n-subject" className="input" maxLength={150} value={f.subject} onChange={set("subject")} /></div>
      <div className="field"><label htmlFor="n-body">Message</label><textarea id="n-body" className="textarea" maxLength={5000} value={f.body} onChange={set("body")} />
        <span className="hint">Please do not include your Social Security number or bank details here.</span></div>
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row"><button type="button" id="n-send" className="btn btn-primary" disabled={state.busy || !f.category || !f.subject.trim() || !f.body.trim()} onClick={submit}>{state.busy ? "Sending…" : staff ? "Create ticket" : "Send request"}</button></div>
    </div>
  );
}
