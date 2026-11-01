import { redirect } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";
import { safeNext } from "@/lib/idle";
import MobileAuth from "@/components/mobile/MobileAuth";

export const metadata = { title: "Sign in" };

// The app's own sign-in screen; returns to the /m screen that asked for it.
export default async function Page({ searchParams }) {
  const asked = safeNext((await searchParams)?.next);
  const next = asked?.startsWith("/m") ? asked : "/m";
  if (await getFirebaseSession()) redirect(next);
  return <MobileAuth mode="login" next={next} business={next.startsWith("/m/business")} />;
}
