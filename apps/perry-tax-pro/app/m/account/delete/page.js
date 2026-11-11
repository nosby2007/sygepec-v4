import { redirect } from "next/navigation";
import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { pendingDeletion } from "@/lib/account-deletion";
import Icon from "@/components/Icon";
import DeleteAccount from "@/components/mobile/DeleteAccount";

export const metadata = { title: "Delete account" };
export const dynamic = "force-dynamic";

// Where anyone can delete their account, from the apps or a browser (Google Play asks for both).
export default async function Page() {
  const session = await getFirebaseSession();
  if (!session) redirect(`/m/login?next=${encodeURIComponent("/m/account/delete")}`);
  const business = session.accountType === "BUSINESS";
  const home = business ? "/m/business/settings" : "/m/client/profile";
  const pending = await pendingDeletion(session.uid).catch(() => null);
  return (
    <main className="m-main">
      <div className="m-head"><Link className="m-back" href={home}><Icon name="back" size={24} /> Delete account</Link></div>
      {pending ? (
        <div className="m-alert info">We received your request and will let you know within 30 days. Questions? Contact us from your profile.</div>
      ) : session.role !== "CLIENT" ? (
        <div className="m-alert info">Staff accounts are closed by the account owner.</div>
      ) : (
        <DeleteAccount done={business ? "/m/login?next=/m/business/appointments" : "/m/client"} />
      )}
    </main>
  );
}
