import Link from "next/link";
import { getFirebaseSession, requireBusinessClient } from "@/lib/auth";
import { bookingSettingsOf, getOwnProfile, listOwnerBookings, listStaff } from "@/lib/business-booking";
import { queryCollection, TAX_TENANT } from "@/lib/firebase";
import { zonedParts } from "@/lib/timezone";
import Icon from "@/components/Icon";
import { PageHead } from "@/components/ui";
import BusinessBookings from "./BusinessBookings";

export const metadata = { title: "Bookings" };

export default async function Page() {
  await requireBusinessClient();
  const session = await getFirebaseSession();
  const [profile, bookings, staff, services] = await Promise.all([
    getOwnProfile(session),
    listOwnerBookings(session),
    listStaff(session),
    queryCollection("taxBusinessServices", session.idToken, { filters: [["ownerUid", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 500 }),
  ]);
  const settings = bookingSettingsOf(profile);
  return (
    <>
      <PageHead kicker="Business" icon="calendar" title="Bookings" desc={`All times in ${settings.timeZone.replace("_", " ")}. Online and in-person bookings share one conflict-checked calendar.`}>
        <Link href="/portal/business/profile" className="btn btn-ghost"><Icon name="clock" size={16} /> Hours & rules</Link>
      </PageHead>
      {!profile && <div className="alert alert-info"><Icon name="info" size={16} />Set up your <Link href="/portal/business/profile">public page and hours</Link> first. Until then, bookings use default hours (Mon–Sat).</div>}
      <BusinessBookings
        bookings={bookings}
        settings={{ timeZone: settings.timeZone, weekly: settings.weekly }}
        staff={staff.filter((s) => s.active).map(({ id, name }) => ({ id, name }))}
        services={services.filter((s) => s.active !== false).map(({ id, name, durationMinutes }) => ({ id, name, durationMinutes }))}
        today={zonedParts(new Date(), settings.timeZone).date}
      />
    </>
  );
}
