import NewTicketForm from "@/components/support/NewTicketForm";
import { PageHead } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "New support request" };

export default async function Page() {
  await requireRole("CLIENT");
  return (
    <>
      <PageHead kicker="Support" icon="help" title="New request" desc="Tell us what you need. We reply here and email you when we do." />
      <NewTicketForm endpoint="/api/support/my/tickets" doneBase="/portal/support" />
    </>
  );
}
