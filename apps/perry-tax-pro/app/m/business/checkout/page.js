import { getFirebaseSession } from "@/lib/auth";
import { listOwnerBookings } from "@/lib/business-booking";
import { getPayout } from "@/lib/connect";
import { queryCollection, TAX_TENANT } from "@/lib/firebase";
import { safeId } from "@/lib/security";
import Checkout from "@/components/mobile/Checkout";

export const metadata = { title: "Checkout" };

export default async function Page({ searchParams }) {
  const session = await getFirebaseSession();
  const mine = [["ownerUid", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]];
  const bookingId = safeId((await searchParams)?.booking);
  const [services, customers, payout, bookings] = await Promise.all([
    queryCollection("taxBusinessServices", session.idToken, { filters: mine, limit: 500 }),
    queryCollection("taxBusinessCustomers", session.idToken, { filters: mine, limit: 1000 }).catch(() => []),
    getPayout(session.uid),
    bookingId ? listOwnerBookings(session) : [],
  ]);
  const booking = bookings.find((b) => b.id === bookingId) || null;
  const clients = customers.filter((c) => c.source !== "walk-in").map(({ id, name, phone, email }) => ({ id, name, phone: phone || "", email: email || "" })).sort((a, b) => a.name.localeCompare(b.name));
  // Coming from a booking: its service is the first item and its client is picked.
  const fromBooking = booking && {
    bookingId: booking.id,
    line: { name: booking.service, amount: (booking.price_cents || 0) / 100, qty: 1, serviceId: booking.service_id },
    customerId: clients.find((c) => (booking.email && c.email.toLowerCase() === String(booking.email).toLowerCase()) || (booking.phone && c.phone === booking.phone))?.id || null,
    customerName: booking.name,
  };
  return (
    <Checkout
      services={services.filter((s) => s.active !== false).map(({ id, name, priceCents, durationMinutes }) => ({ id, name, priceCents, durationMinutes }))}
      clients={clients}
      cardReady={Boolean(payout?.chargesEnabled)}
      fromBooking={fromBooking}
    />
  );
}
