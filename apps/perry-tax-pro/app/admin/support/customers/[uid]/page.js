import Link from "next/link";
import crypto from "node:crypto";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { Empty, PageHead } from "@/components/ui";
import { PriorityPill, StatusPill, when } from "@/components/support/ui";
import { requireSupportPage } from "@/lib/support-access";
import { getCustomer } from "@/lib/support-customers";
import { PERMISSIONS as P, SupportError } from "@/lib/support-rules";

export const metadata = { title: "Customer" };
const row = (label, value) => <div><span>{label}</span><b>{value || "—"}</b></div>;
const words = (value) => (value ? String(value).replace(/_/g, " ").toLowerCase() : "—");

export default async function Page({ params }) {
  const session = await requireSupportPage(P.CUSTOMER_VIEW);
  const c = await getCustomer(session, (await params).uid, crypto.randomUUID()).catch((error) => {
    if (error instanceof SupportError && error.status === 404) notFound();
    throw error;
  });
  return (
    <>
      <PageHead kicker="Customer" icon={c.type === "BUSINESS" ? "building" : "user"} title={c.name || "No name"} desc={c.type === "BUSINESS" ? "Business account" : "Individual account"}>
        <Link href={`/admin/support/tickets/new?customer=${c.uid}`} className="btn btn-primary"><Icon name="plus" size={16} /> New ticket</Link>
      </PageHead>
      {c.accountStatus === "DELETION_REQUESTED" && <div className="alert alert-info"><Icon name="info" size={16} />This customer asked to delete their account.</div>}
      <div className="grid-2 mt">
        <div className="card">
          <h3>Account</h3>
          <div className="breakdown">
            {row("Status", c.accountStatus === "ACTIVE" ? "Active" : "Deletion requested")}
            {row("Email", c.email)}
            {row("Phone", c.phone)}
            {row("Two-step sign-in", c.twoStepOn ? "On" : "Off")}
            {row("Customer since", when(c.createdAt))}
          </div>
          {c.masked && <p className="tiny muted mt-sm">Contact details are masked for your role. A supervisor can see them.</p>}
        </div>
        <div className="card">
          <h3>Fees</h3>
          {c.charges.length === 0 ? <p className="small muted">None recorded.</p> : <div className="breakdown">{c.charges.map((x) => <div key={x.id}><span>{words(x.kind)}</span><b>{words(x.status)}</b></div>)}</div>}
          <p className="tiny muted mt-sm">Read only. Support cannot change payments or give refunds.</p>
        </div>
      </div>
      {c.business && (
        <div className="card mt">
          <h3>Business</h3>
          <div className="breakdown">
            {row("Name", c.business.name)}
            {row("Public page", words(c.business.status))}
            {row("Plan", c.business.plan ? `${words(c.business.plan)} (${words(c.business.planStatus)})` : "No plan")}
            {row("Owner, the only login", c.business.owner.name)}
          </div>
          <h3 className="mt">Team members who can be booked</h3>
          {c.business.team.length === 0 ? <p className="small muted">None.</p> : <div className="breakdown">{c.business.team.map((m) => <div key={m.id}><span>{m.name}</span><b>{m.active ? "Active" : "Inactive"}</b></div>)}</div>}
        </div>
      )}
      <div className="card mt">
        <h3>Tax returns</h3>
        {c.returns.length === 0 ? <p className="small muted">None.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Year</th><th>Status</th><th>Signature</th><th>Submission</th><th>Updated (ET)</th></tr></thead>
            <tbody>{c.returns.map((r) => <tr key={r.id}><td>{r.taxYear}</td><td className="small">{words(r.status)}</td><td className="small">{words(r.signatureStatus)}</td><td className="small">{words(r.submissionStatus)}</td><td className="small">{when(r.updatedAt)}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="tiny muted mt-sm">Status only. Support does not see tax answers, SSNs or bank details.</p>
      </div>
      <div className="card mt">
        <h3>Support tickets</h3>
        {c.tickets.length === 0 ? <Empty icon="clipboard" title="No tickets yet">Tickets for this customer will appear here.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Ticket</th><th>Status</th><th>Priority</th><th>Updated (ET)</th></tr></thead>
            <tbody>{c.tickets.map((t) => <tr key={t.id}><td><Link className="grad-text" href={`/admin/support/tickets/${t.id}`}><b>{t.id}</b></Link><div className="small">{t.subject}</div></td><td><StatusPill status={t.status} /></td><td><PriorityPill priority={t.priority} /></td><td className="small">{when(t.updatedAt)}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
