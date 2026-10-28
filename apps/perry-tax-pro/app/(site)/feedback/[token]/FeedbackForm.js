"use client";
import { useState } from "react";
import Icon from "@/components/Icon";

export default function FeedbackForm({ token }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [publishConsent, setPublishConsent] = useState(false);
  const [state, setState] = useState({});
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setState({ error: "Choose a rating." });
    setState({ busy: true });
    const res = await fetch(`/api/public/feedback/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment, publishConsent }) });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? { done: true } : { error: body.error || "Could not send your feedback." });
  };
  if (state.done) return <div className="alert alert-success"><Icon name="check" size={16} />Thank you! Your feedback was sent.</div>;
  return (
    <form className="stack" onSubmit={submit}>
      <div className="feedback-stars" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={(hover || rating) >= n ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)}>
            <Icon name="star" size={30} />
          </button>
        ))}
      </div>
      <div className="field"><label htmlFor="fb-comment">Anything you&apos;d like to add? (optional)</label><textarea id="fb-comment" className="textarea" rows={4} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      <label className="row nowrap small"><input type="checkbox" checked={publishConsent} onChange={(e) => setPublishConsent(e.target.checked)} /> The business may show my rating, comment and first name on its public page.</label>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row"><button className="btn btn-primary" disabled={Boolean(state.busy)}><Icon name="send" size={16} /> Send feedback</button></div>
    </form>
  );
}
