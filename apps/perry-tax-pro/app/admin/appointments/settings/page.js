import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { getBookingSettings } from "@/lib/appointments";
import Icon from "@/components/Icon";
import { PageHead } from "@/components/ui";
import BookingSettingsForm from "./BookingSettingsForm";

export const metadata = { title: "Availability & booking rules" };

export default async function Page() {
  const session = await getFirebaseSession();
  const settings = await getBookingSettings(session.idToken);
  return (
    <>
      <PageHead kicker="Scheduling operations" icon="clock" title="Availability & booking rules" desc="Clients can only book times inside these hours. Existing appointments are not moved when you change them.">
        <Link href="/admin/appointments" className="btn btn-ghost"><Icon name="back" size={16} /> Appointments</Link>
      </PageHead>
      <BookingSettingsForm initial={settings} />
    </>
  );
}
