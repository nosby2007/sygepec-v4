import { getFirebaseSession, requireBusinessClient } from "@/lib/auth";
import { getOwnProfile } from "@/lib/business-booking";
import { getDocument } from "@/lib/firebase";
import { listPortfolio } from "@/lib/portfolio";
import { serviceToken } from "@/lib/service-identity";
import { PageHead } from "@/components/ui";
import BusinessDetails from "@/components/business/BusinessDetails";
import WorkGallery from "@/components/business/WorkGallery";
import BusinessProfileForm from "./BusinessProfileForm";

export const metadata = { title: "Public page & booking" };

function details(row) {
  if (!row) return null;
  const { id: _i, createTime: _c, updateTime: _u, ...data } = row;
  return data;
}

export default async function Page() {
  await requireBusinessClient();
  const session = await getFirebaseSession();
  const [profile, photos, registration] = await Promise.all([
    getOwnProfile(session),
    listPortfolio(session.uid, session.idToken),
    // Server-only record: read with the server identity, for the signed-in owner only.
    serviceToken().then((t) => getDocument(`bizRegistrations/${session.uid}`, t)).catch(() => null),
  ]);
  return (
    <>
      <PageHead kicker="Business" icon="megaphone" title="Public page & online booking" desc="Your profile, photos of your work, opening hours and booking rules. Nothing is public until you publish." />
      <div className="stack" style={{ gap: 24 }}>
        <BusinessProfileForm initial={profile} />
        <WorkGallery initial={photos} publicUrl={profile?.status === "PUBLISHED" ? `/business/${profile.slug}` : null} />
        <BusinessDetails initial={details(registration)} />
      </div>
    </>
  );
}
