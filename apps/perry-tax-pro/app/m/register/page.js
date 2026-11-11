import { redirect } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";
import { safeNext } from "@/lib/idle";
import MobileAuth from "@/components/mobile/MobileAuth";

export const metadata = { title: "Create account" };

// Sign-up inside the app: a client account by default, a business one from the business app.
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const asked = safeNext(params?.next);
  const next = asked?.startsWith("/m") ? asked : "/m";
  if (await getFirebaseSession()) redirect(next);
  return <MobileAuth mode="register" next={next} business={params?.type === "business" || next.startsWith("/m/business")} />;
}
