import Link from "next/link";
import { getSiteSettings } from "@/lib/cms";
import Icon from "@/components/Icon";
import { PageHead } from "@/components/ui";
import SiteSettingsForm from "./SiteSettingsForm";

export const metadata = { title: "Contact details" };

export default async function Page() {
  return (
    <>
      <PageHead kicker="Website" icon="phone" title="Public contact details" desc="Shown in the site footer and on the contact page. Leave a field empty to hide it.">
        <Link href="/admin/content" className="btn btn-ghost"><Icon name="back" size={16} /> Content</Link>
      </PageHead>
      <SiteSettingsForm initial={await getSiteSettings()} />
    </>
  );
}
