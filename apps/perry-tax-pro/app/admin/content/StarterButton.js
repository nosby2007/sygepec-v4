"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function StarterButton({ subtle = false }) {
  const router = useRouter();
  const [state, setState] = useState({});
  const run = async () => {
    setState({ busy: true });
    const res = await fetch("/api/cms/starters", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? { ok: body.created ? `${body.created} drafts created.` : "All starter drafts already exist." } : { error: body.error || "Could not create drafts." });
    router.refresh();
  };
  return (
    <span className="row">
      <button type="button" id="cms-starters" className={`btn ${subtle ? "btn-ghost btn-sm" : "btn-primary"}`} disabled={state.busy && !state.ok && !state.error} onClick={run}>
        <Icon name="sparkle" size={16} /> Create starter drafts
      </button>
      {state.ok && <span className="small muted">{state.ok}</span>}
      {state.error && <span className="small" style={{ color: "var(--rose)" }}>{state.error}</span>}
    </span>
  );
}
