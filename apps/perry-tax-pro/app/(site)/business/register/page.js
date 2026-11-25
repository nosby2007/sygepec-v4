import { redirect } from "next/navigation";
import BusinessRegister from "@/components/BusinessRegister";
import { appMode } from "@/lib/auth";

export const metadata = { title: "Register your business", description: "Register your small business with InnovaCare: one workspace for your books, customers, bookings and public page.", robots: { index: false, follow: false } };

export default async function Page() {
  // Inside the native apps: the app's own sign-up screen.
  if (await appMode()) redirect(`/m/register?type=business&next=${encodeURIComponent("/m/business/appointments")}`);
  return <BusinessRegister />;
}
