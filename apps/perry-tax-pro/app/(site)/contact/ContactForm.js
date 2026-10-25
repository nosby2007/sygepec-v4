"use client";
import { useState } from "react";
import Icon from "@/components/Icon";

export default function ContactForm({ topics }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", topic: topics[0], message: "", company: "" });
  const [startedAt] = useState(() => Date.now());
  const [state, setState] = useState({});
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch("/api/public/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, startedAt }) });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? { done: true } : { error: body.error || "Your message could not be sent." });
  };
  if (state.done)
    return (
      <div className="card stack-sm">
        <h2 style={{ margin: 0 }}>Message received</h2>
        <p className="small" style={{ margin: 0 }}>Thank you. A member of our team will reply by email or phone. Please don&apos;t send tax documents here; you can upload them securely in the client portal.</p>
      </div>
    );
  return (
    <form className="card stack" onSubmit={submit}>
      <div className="form-grid">
        <div className="field"><label htmlFor="ct-name">Name</label><input id="ct-name" className="input" required maxLength={100} autoComplete="name" value={f.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="ct-email">Email</label><input id="ct-email" type="email" className="input" required maxLength={254} autoComplete="email" value={f.email} onChange={set("email")} /></div>
        <div className="field"><label htmlFor="ct-phone">Phone (optional)</label><input id="ct-phone" className="input" maxLength={30} autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
        <div className="field"><label htmlFor="ct-topic">Topic</label><select id="ct-topic" className="input select" value={f.topic} onChange={set("topic")}>{topics.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field full"><label htmlFor="ct-message">Message</label><textarea id="ct-message" className="textarea" rows={6} required minLength={10} maxLength={3000} value={f.message} onChange={set("message")} /></div>
        <div className="hp-field" aria-hidden="true"><label htmlFor="ct-company">Company</label><input id="ct-company" tabIndex={-1} autoComplete="off" value={f.company} onChange={set("company")} /></div>
      </div>
      <p className="hint">Please don&apos;t include Social Security numbers or other sensitive tax details. Use the secure client portal for documents.</p>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row"><button id="ct-send" className="btn btn-primary" disabled={Boolean(state.busy)}><Icon name="send" size={16} /> Send message</button></div>
    </form>
  );
}
