"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

const TONE = {
  NOT_READY: "", VALIDATED: "s-REQUESTED", SIGNATURE_PENDING: "s-REQUESTED", READY_TO_TRANSMIT: "s-REQUESTED",
  TRANSMITTING: "s-REQUESTED", TRANSMITTED: "s-REQUESTED", ACK_PENDING: "s-REQUESTED", ACCEPTED: "s-ACCEPTED",
  REJECTED: "s-CANCELLED", FAILED_RETRYABLE: "s-CANCELLED", INDETERMINATE: "s-CANCELLED",
};
const NAME = { US: "Federal (IRS)", GA: "Georgia" };
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "");

// Preparer panel: readiness per jurisdiction, then prepare, transmit, read the
// acknowledgement, and reconcile an unknown outcome. In sandbox mode nothing reaches the
// IRS, and the panel says so on every submission.
export default function EfilePanel({ returnId }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [state, setState] = useState({});
  const [scenario, setScenario] = useState("ACCEPT");

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/returns/${returnId}/efile`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { body } : { error: body.error || "The e-file status could not be loaded." };
  }, [returnId]);
  const load = async () => {
    const { body, error } = await fetchStatus();
    if (error) setState({ error }); else setData(body);
  };
  useEffect(() => {
    let live = true;
    fetchStatus().then(({ body, error }) => {
      if (!live) return;
      if (error) setState({ error }); else setData(body);
    });
    return () => { live = false; };
  }, [fetchStatus]);

  const act = async (action, extra, ok) => {
    setState({ busy: `${action}:${extra.key || extra.jurisdiction || ""}` });
    try {
      const res = await fetch(`/api/returns/${returnId}/efile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      setState({ ok: body.waiting ? (body.reason || "No acknowledgement yet. Check again later.") : body.unresolved ? "The receiver could not say. Try again later." : ok });
      await load();
      router.refresh();
    } catch (error) {
      setState({ error: error.message });
      await load();
    }
  };

  if (!data) return state.error ? <div className="card"><div className="alert alert-error small">{state.error}</div></div> : null;
  if (data.mode === "off") return (
    <div className="card stack-sm">
      <div className="kicker"><Icon name="send" size={14} /> Electronic filing</div>
      <p className="small muted">Electronic filing is turned off on this server. Returns are filed through professional software and recorded below.</p>
    </div>
  );
  const busy = (k) => state.busy === k;
  return (
    <div className="card stack-sm" id="efile-panel">
      <div className="card-title">
        <div className="kicker"><Icon name="send" size={14} /> Electronic filing</div>
        <span className={`badge ${data.mode === "production" ? "s-ACCEPTED" : "s-REQUESTED"}`}>{data.mode === "production" ? "Production" : "Sandbox"}</span>
      </div>
      {data.mode === "sandbox" && (
        <div className="alert alert-info small"><Icon name="info" size={15} /><span>Sandbox: packages go to an InnovaTax test receiver, not the IRS or Georgia. A sandbox acceptance is not a filing and does not change the return&apos;s filing status. {data.schema.installed ? "" : data.schema.note}</span></div>
      )}
      {!data.canTransmit && <p className="hint">You can prepare submissions and read acknowledgements. Transmitting takes the transmitter permission (general admin).</p>}

      {data.jurisdictions.map((j) => {
        const blocking = j.issues.filter((i) => i.blocking);
        const subs = data.submissions.filter((s) => s.jurisdiction === j.code);
        return (
          <section key={j.code} className="stack-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>{NAME[j.code] || j.code}</h3>
              <button className="btn btn-ghost btn-sm" disabled={Boolean(state.busy)} onClick={() => act("prepare", { jurisdiction: j.code }, "Package built and checked.")}>
                <Icon name="layers" size={14} /> {busy(`prepare:${j.code}`) ? "Building…" : "Build package"}
              </button>
            </div>
            {j.code !== "US" && <p className="hint">Georgia takes returns through the Fed/State program, linked to the federal return: it is sent after the federal return and falls with it if the federal return is rejected. Federal approval does not authorize Georgia filing; Georgia needs its own approval and testing.{j.schema && !j.schema.installed ? ` ${j.schema.note}` : ""}</p>}
            {j.issues.length > 0 && (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {j.issues.map((i) => (
                  <li key={i.code} style={{ color: i.blocking ? "var(--rose)" : "var(--muted)" }}>
                    {i.message} <span className="muted">{i.action}</span>
                    {i.step && <> · <a href={`/portal/intake?step=${encodeURIComponent(i.step)}`}>screen</a></>}
                  </li>
                ))}
              </ul>
            )}
            {!blocking.length && <p className="small" style={{ color: "var(--green)" }}><Icon name="check" size={13} /> Ready checks pass{j.signaturesComplete ? "" : ", except signatures"}{j.waitingForFederal ? "; it waits for the federal return to be sent" : ""}.</p>}
            {subs.map((s) => (
              <article key={s.key} className="workflow-row" style={{ display: "block" }}>
                <div className="row between">
                  <b className="small">{s.submissionRef}{s.sandbox && <span className="pill" style={{ marginLeft: 6 }}>sandbox</span>}</b>
                  <span className={`badge ${TONE[s.state] || ""}`}>{s.stateLabel}</span>
                </div>
                <div className="hint">Built {when(s.createdAt)} · {s.forms.length} forms · {s.adapterId}{s.attempts ? ` · ${s.attempts} attempt${s.attempts > 1 ? "s" : ""}` : ""}{s.receiptId ? ` · receipt ${s.receiptId}` : ""}{s.supersedes ? " · corrects a rejected submission" : ""}{s.linkedFederalRef ? ` · linked to federal ${s.linkedFederalRef}` : ""}</div>
                {s.validationErrors.length > 0 && (
                  <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {s.validationErrors.map((e) => <li key={e.code + e.path}>{e.code}: {e.message}{e.step && <> · <a href={`/portal/intake?step=${encodeURIComponent(e.step)}`}>screen</a></>}</li>)}
                  </ul>
                )}
                {s.ack && (
                  <div className={`alert ${s.ack.status === "ACCEPTED" ? "alert-success" : "alert-error"} small`} style={{ marginTop: 8 }}>
                    <span>{s.ack.status === "ACCEPTED" ? "Accepted" : "Rejected"} {when(s.ack.receivedAt)}{s.ack.authoritative ? "" : s.jurisdiction === "US" ? " (sandbox acknowledgement, not the IRS)" : " (sandbox acknowledgement, not Georgia DOR)"}.
                      {s.ack.errors.map((e) => <span key={e.code} style={{ display: "block" }}>{e.code}: {e.message}{e.step && <> · <a href={`/portal/intake?step=${encodeURIComponent(e.step)}`}>fix</a></>}</span>)}
                    </span>
                  </div>
                )}
                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  {data.canTransmit && ["READY_TO_TRANSMIT", "FAILED_RETRYABLE"].includes(s.state) && (
                    <>
                      {data.scenarios && (
                        <select className="input" style={{ width: "auto" }} value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Sandbox scenario">
                          {Object.entries(data.scenarios).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      )}
                      <button className="btn btn-primary btn-sm" disabled={Boolean(state.busy) || j.waitingForFederal} title={j.waitingForFederal ? "Send the federal return first" : undefined} onClick={() => act("transmit", { key: s.key, scenario }, "Sent. Check for the acknowledgement.")}>
                        <Icon name="send" size={14} /> {busy(`transmit:${s.key}`) ? "Sending…" : s.state === "FAILED_RETRYABLE" ? "Retry" : "Transmit"}
                      </button>
                    </>
                  )}
                  {s.state === "ACK_PENDING" && <button className="btn btn-ghost btn-sm" disabled={Boolean(state.busy)} onClick={() => act("poll", { key: s.key }, "Acknowledgement recorded.")}><Icon name="refresh" size={14} /> {busy(`poll:${s.key}`) ? "Checking…" : "Check acknowledgement"}</button>}
                  {data.canTransmit && (s.state === "INDETERMINATE" || s.claimAbandoned) && <button className="btn btn-ghost btn-sm" disabled={Boolean(state.busy)} onClick={() => act("reconcile", { key: s.key }, "Reconciled with the receiver.")}><Icon name="search" size={14} /> {busy(`reconcile:${s.key}`) ? "Asking…" : "Reconcile"}</button>}
                </div>
                {s.claimAbandoned && <p className="hint">This send was started more than 10 minutes ago and its result was never recorded. Reconcile it with the receiver; it is never sent again blindly.</p>}
                {s.state === "INDETERMINATE" && <p className="hint">Nobody knows whether the receiver got this package. It cannot be sent again until reconciled, so the return is never filed twice.</p>}
              </article>
            ))}
          </section>
        );
      })}

      {data.mode !== "production" && (
        <details className="small">
          <summary>Before real transmission</summary>
          <b>Federal</b>
          <ul style={{ paddingLeft: 18 }}>{data.production.federal.map((g) => <li key={g}>{g}</li>)}</ul>
          <b>Georgia, on top of every federal item</b>
          <ul style={{ paddingLeft: 18 }}>{data.production.georgia.filter((g) => !g.startsWith("Federal: ")).map((g) => <li key={g}>{g}</li>)}</ul>
        </details>
      )}
      {state.error && <div className="alert alert-error small">{state.error}</div>}
      {state.ok && <div className="alert alert-success small">{state.ok}</div>}
    </div>
  );
}
