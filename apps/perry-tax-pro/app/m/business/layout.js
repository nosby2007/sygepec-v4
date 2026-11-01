import { redirect } from "next/navigation";
import { getFirebaseSession, hasBusinessAccess } from "@/lib/auth";
import TabBar from "@/components/mobile/TabBar";

export default async function BusinessAppLayout({ children }) {
  // Sign-in stays inside the app; other accounts go to their own screens.
  const s = await getFirebaseSession();
  if (!s) redirect("/m/login?next=/m/business/appointments");
  if (!hasBusinessAccess(s)) redirect(s.role === "PREPARER" ? "/admin" : "/m/client");
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
