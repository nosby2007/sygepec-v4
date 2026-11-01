import { redirect } from "next/navigation";
import ClientBookings from "@/components/mobile/ClientBookings";
import { getFirebaseSession } from "@/lib/auth";
import { listClientBookings } from "@/lib/client-bookings";

export const metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getFirebaseSession();
  if (!session) redirect("/m/login?next=/m/client/bookings");
  const bookings = await listClientBookings(session).catch(() => null);
  return (
    <main className="m-main">
      <div className="m-head"><h1>Bookings</h1></div>
      {bookings === null
        ? <div className="m-alert">Your bookings could not be loaded. Please try again in a moment.</div>
        : <ClientBookings bookings={bookings} nowMs={new Date().getTime()} />}
    </main>
  );
}
