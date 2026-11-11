import { getFirebaseSession } from "@/lib/auth";
import { bookingSettingsOf, getOwnProfile, listOwnerBookings, listStaff } from "@/lib/business-booking";
import { queryCollection, TAX_TENANT } from "@/lib/firebase";
import { zonedParts } from "@/lib/timezone";
import Calendar from "@/components/mobile/Calendar";

export const metadata = { title: "Appointments" };

export default async function Page() {
  const session = await getFirebaseSession();
  const mine = [["ownerUid", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]];
  const [profile, bookings, staff, services, customers] = await Promise.all([
    getOwnProfile(session),
    listOwnerBookings(session),
    listStaff(session),
    queryCollection("taxBusinessServices", session.idToken, { filters: mine, limit: 500 }),
    queryCollection("taxBusinessCustomers", session.idToken, { filters: mine, limit: 1000 }).catch(() => []),
  ]);
  const settings = bookingSettingsOf(profile);
  return (
    <Calendar
      bookings={bookings.filter((b) => b.status !== "CANCELLED")}
      timeZone={settings.timeZone}
      weekly={settings.weekly}
      staff={staff.filter((s) => s.active && s.bookable).map(({ id, name }) => ({ id, name }))}
      services={services.filter((s) => s.active !== false).map(({ id, name, durationMinutes, priceCents }) => ({ id, name, durationMinutes, priceCents }))}
      customers={customers.map(({ id, name, email, phone }) => ({ id, name, email: email || "", phone: phone || "" })).sort((a, b) => a.name.localeCompare(b.name))}
      today={zonedParts(new Date(), settings.timeZone).date}
      hasProfile={Boolean(profile)}
    />
  );
}
