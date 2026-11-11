import crypto from "node:crypto";
import { redirect } from "next/navigation";
import NewTicketForm from "@/components/support/NewTicketForm";
import { PageHead } from "@/components/ui";
import { requireSupportPage } from "@/lib/support-access";
import { getCustomer } from "@/lib/support-customers";
import { PERMISSIONS as P } from "@/lib/support-rules";

export const metadata = { title: "New ticket" };

export default async function Page({ searchParams }) {
  const session = await requireSupportPage(P.TICKET_CREATE);
  const uid = (await searchParams)?.customer;
  const customer = uid ? await getCustomer(session, uid, crypto.randomUUID()).catch(() => null) : null;
  if (!customer) redirect("/admin/support/customers");
  return (
    <>
      <PageHead kicker="Support Operations" icon="plus" title="New ticket" desc="The customer sees the message you write here." />
      <NewTicketForm staff customerUid={customer.uid} customerName={customer.name} endpoint="/api/support/tickets" doneBase="/admin/support/tickets" />
    </>
  );
}
