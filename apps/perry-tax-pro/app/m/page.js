import { redirect } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";

// Opens the tabs that fit the account: business owners get their business app, tax
// clients the client app (Explore, Bookings, Taxes), preparers the web workspace.
export default async function Page() {
  const s = await getFirebaseSession();
  if (!s) redirect("/login?next=/m");
  if (s.role === "PREPARER") redirect("/admin");
  redirect(s.accountType === "BUSINESS" ? "/m/business/appointments" : "/m/client");
}
