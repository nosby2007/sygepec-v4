"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetMfaButton({ uid, name }) {
  const router = useRouter();
  const [state, setState] = useState({});
  const reset = async () => {
    if (!window.confirm(`Reset two-step sign-in for ${name}? They will set it up again at their next sign-in.`)) return;
    setState({ busy: true });
    const res = await fetch("/api/admin/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resetMfa", uid }) });
    const data = await res.json().catch(() => ({}));
    setState(res.ok ? {} : { error: data.error || "The reset failed." });
    if (res.ok) router.refresh();
  };
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={reset}>Reset</button>
      {state.error && <span className="small alert-inline"> {state.error}</span>}
    </>
  );
}
