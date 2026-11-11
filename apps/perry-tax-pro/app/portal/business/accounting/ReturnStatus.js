import { getFirebaseSession } from "@/lib/auth";
import { ENTITY_TYPES, RETURN_FLOW, dueDate } from "@/lib/business-return";
import { getDocument, queryCollection, TAX_TENANT } from "@/lib/firebase";
import Icon from "@/components/Icon";

// The owner's read-only view of their business tax return, once a preparer started it.
export default async function ReturnStatus() {
  const session = await getFirebaseSession();
  const cases = await queryCollection("taxBusinessYearEnd", session.idToken, { filters: [["clientId", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 50 }).catch(() => []);
  const returns = (await Promise.all(cases.map((c) => getDocument(`taxBusinessReturns/${c.id}`, session.idToken).catch(() => null)))).filter(Boolean)
    .sort((a, b) => b.taxYear - a.taxYear);
  if (!returns.length) return null;
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-title"><div><h3>Business tax returns</h3><div className="sub">Prepared by your InnovaCare preparer</div></div></div>
      <div className="stack-sm">
        {returns.map((r) => {
          const entity = ENTITY_TYPES[r.entityType];
          return (
            <div key={r.caseId} className="list-item">
              <div><b>{r.taxYear} · {entity?.form || "Form to be confirmed"}</b><div className="hint">{entity ? `Due ${dueDate(r.entityType, r.taxYear, { extended: r.extended })}${r.extended ? " (extended)" : ""}` : "Your preparer is reviewing your books."}</div></div>
              <div className="row nowrap">
                {r.status === "AWAITING_SIGNATURE" && <span className="small" style={{ color: "var(--gold-ink)" }}><Icon name="pen" size={13} /> Your preparer will send {entity.signatureForm} to sign</span>}
                {r.status === "ACCEPTED" && <span className="small pos-text">Accepted by the IRS {r.filing?.ackAt}</span>}
                <span className={`badge s-${r.status === "ACCEPTED" ? "ACCEPTED" : r.status === "REJECTED" ? "CANCELLED" : "IN_REVIEW"}`}>{RETURN_FLOW[r.status]?.label.toLowerCase()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
