import { requireBusinessClient } from "@/lib/auth";
import { PageHead } from "@/components/ui";
import TeamManager from "./TeamManager";

export const metadata = { title: "Team" };

export default async function Page() {
  await requireBusinessClient();
  return (
    <>
      <PageHead kicker="Business" icon="users" title="Team & calendars" desc="People customers can book. Each person keeps their own calendar, so they are never double-booked." />
      <TeamManager />
    </>
  );
}
