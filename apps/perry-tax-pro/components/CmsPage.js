import { notFound } from "next/navigation";
import { PageArticle } from "@/components/CmsViews";
import { publicEntry } from "@/lib/cms";

// Fixed-address pages (/about, /privacy, /terms) whose content lives in the CMS.
export async function cmsPageMetadata(slug) {
  const entry = await publicEntry("PAGE", slug);
  if (!entry) return { title: "Page not found", robots: { index: false } };
  return { title: entry.title, description: entry.summary, alternates: { canonical: `/${slug}` } };
}

export default async function CmsPage({ slug }) {
  const entry = await publicEntry("PAGE", slug);
  if (!entry) notFound();
  return (
    <main className="section container" style={{ paddingTop: 48 }}>
      <PageArticle entry={entry} />
    </main>
  );
}
