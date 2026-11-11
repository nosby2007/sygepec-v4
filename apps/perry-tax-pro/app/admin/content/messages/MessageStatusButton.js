"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MessageStatusButton({ id, status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = status === "NEW" ? "HANDLED" : "NEW";
  const toggle = async () => {
    setBusy(true);
    await fetch(`/api/cms/messages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    setBusy(false);
    router.refresh();
  };
  return <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={toggle}>{next === "HANDLED" ? "Mark handled" : "Reopen"}</button>;
}
