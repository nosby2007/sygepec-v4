"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewTaxYearButton({ year }) {
  const [state, setState] = useState({});
  const router = useRouter();

  const create = async () => {
    setState({ busy: true });
    const response = await fetch("/api/returns", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setState({ error: body.error || "Unable to start the new return." });
    router.push("/portal/intake");
    router.refresh();
  };

  return (
    <div className="stack" style={{ alignItems: "flex-start" }}>
      <button className="btn btn-primary" type="button" disabled={state.busy} onClick={create}>
        {state.busy ? "Creating…" : `Start ${year} return →`}
      </button>
      {state.error && <div className="alert alert-error">{state.error}</div>}
    </div>
  );
}
