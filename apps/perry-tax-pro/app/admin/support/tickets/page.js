import Link from "next/link";
import crypto from "node:crypto";
import { Empty, PageHead } from "@/components/ui";
import TicketTable from "@/components/support/TicketTable";
import { requireSupportPage } from "@/lib/support-access";
import { PERMISSIONS as P, PRIORITIES, STATUSES, SupportError, TEAMS } from "@/lib/support-rules";
import { listTickets } from "@/lib/support-tickets";

export const metadata = { title: "Tickets" };
const FIELDS = ["q", "status", "priority", "team", "assigneeUid", "customerUid", "cursor"];

export default async function Page({ searchParams }) {
  const session = await requireSupportPage(P.TICKET_VIEW);
  const given = await searchParams;
  const query = Object.fromEntries(FIELDS.map((f) => [f, typeof given?.[f] === "string" ? given[f] : ""]));
  let result = { tickets: [], nextCursor: null };
  let problem = null;
  try {
    result = await listTickets(session, query, crypto.randomUUID());
  } catch (error) {
    if (!(error instanceof SupportError)) throw error;
    problem = error.message;
  }
  const next = new URLSearchParams(Object.entries({ ...query, cursor: result.nextCursor || "" }).filter(([, v]) => v));
  return (
    <>
      <PageHead kicker="Support Operations" icon="clipboard" title="Tickets" desc="To open a new ticket, start from the customer's profile.">
        <Link href="/admin/support/customers" className="btn btn-primary">Find a customer</Link>
      </PageHead>
      <form className="card row" action="/admin/support/tickets">
        <input aria-label="Ticket number or word" className="input" style={{ maxWidth: 240 }} name="q" defaultValue={query.q} placeholder="Ticket number or word" autoComplete="off" />
        <select aria-label="Status" className="select" style={{ maxWidth: 200 }} name="status" defaultValue={query.status}><option value="">Any status</option>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Priority" className="select" style={{ maxWidth: 160 }} name="priority" defaultValue={query.priority}><option value="">Any priority</option>{Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Queue" className="select" style={{ maxWidth: 180 }} name="team" defaultValue={query.team}><option value="">Any queue</option>{Object.entries(TEAMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {query.customerUid && <input type="hidden" name="customerUid" value={query.customerUid} />}
        <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        <Link href={`/admin/support/tickets?assigneeUid=${session.uid}`} className="btn btn-ghost btn-sm">Mine</Link>
        <Link href="/admin/support/tickets" className="btn btn-ghost btn-sm">Clear</Link>
      </form>
      <div className="card mt">
        {problem ? <div className="alert alert-error" role="alert">{problem}</div>
          : result.tickets.length === 0 ? <Empty icon="clipboard" title="No tickets found">Try different filters.</Empty> : <TicketTable tickets={result.tickets} />}
        {result.nextCursor && <div className="row mt-sm"><Link className="btn btn-ghost btn-sm" href={`/admin/support/tickets?${next}`}>Next page</Link></div>}
      </div>
    </>
  );
}
