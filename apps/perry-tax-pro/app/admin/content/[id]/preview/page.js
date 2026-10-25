import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";
import { getEntry } from "@/lib/cms";
import { CMS_TYPES } from "@/lib/cms-shared";
import Icon from "@/components/Icon";
import { PageArticle, PostArticle, ServiceArticle, TeamCard, UpdateItem } from "@/components/CmsViews";

export const metadata = { title: "Preview", robots: { index: false } };

// Renders the current saved version with the same components as the public site.
export default async function Page({ params }) {
  const { id } = await params;
  const entry = await getEntry(await getFirebaseSession(), id);
  if (!entry) notFound();
  const View = { SERVICE: ServiceArticle, POST: PostArticle, PAGE: PageArticle, TEAM: TeamCard, UPDATE: UpdateItem }[entry.type];
  return (
    <div className="stack">
      <div className="alert alert-info">
        <Icon name="info" size={16} />
        <span className="small">Preview of the saved {entry.status.toLowerCase()} version. Public address once published: <b>{CMS_TYPES[entry.type].path(entry.slug)}</b>. <Link href={`/admin/content/${entry.id}`}>Back to the editor</Link></span>
      </div>
      <View entry={entry} />
    </div>
  );
}
