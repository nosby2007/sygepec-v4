import { getFirebaseSession, requireBusinessClient } from "@/lib/auth";
import { getOwnProfile } from "@/lib/business-booking";
import { PageHead } from "@/components/ui";
import BusinessProfileForm from "./BusinessProfileForm";

export const metadata = { title: "Public page & booking" };

export default async function Page() {
  await requireBusinessClient();
  const session = await getFirebaseSession();
  const profile = await getOwnProfile(session);
  return (
    <>
      <PageHead kicker="Business" icon="megaphone" title="Public page & online booking" desc="Your profile, opening hours and booking rules. Nothing is public until you publish." />
      <BusinessProfileForm initial={profile} />
    </>
  );
}
