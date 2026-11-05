"use client";
import Icon from "@/components/Icon";

export default function SupportError({ reset }) {
  return (
    <div className="card stack-sm" role="alert">
      <h3><Icon name="alert" size={18} /> This page could not load</h3>
      <p className="small">Please try again. If it keeps happening, tell your supervisor.</p>
      <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={reset}>Try again</button></div>
    </div>
  );
}
