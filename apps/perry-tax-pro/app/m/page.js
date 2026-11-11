import { redirect } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";

// Opens the tabs that fit the account: business owners get their business app, tax
// clients the client app (Explore, Bookings, Taxes), preparers the web workspace.
export default async function Page() {
  const s = await getFirebaseSession();
  // Only the business app starts here (the client app opens /m/client), so its sign-up makes a business account.
  if (!s) redirect("/m/login?next=/m/business/appointments");
  if (s.role === "PREPARER") redirect("/admin");
  redirect(s.accountType === "BUSINESS" ? "/m/business/appointments" : "/m/client");
}
