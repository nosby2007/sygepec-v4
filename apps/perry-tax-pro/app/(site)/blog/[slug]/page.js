import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { PostArticle } from "@/components/CmsViews";
import { publicEntry } from "@/lib/cms";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";

export async function generateMetadata({ params }) {
  const entry = await publicEntry("POST", (await params).slug);
  if (!entry) return { title: "Article not found", robots: { index: false } };
  return {
    title: entry.title,
    description: entry.summary,
    alternates: { canonical: `/blog/${entry.slug}` },
    openGraph: { title: entry.title, description: entry.summary, type: "article", publishedTime: entry.publishedAt || undefined },
  };
}

export default async function PostPage({ params }) {
  const entry = await publicEntry("POST", (await params).slug);
  if (!entry) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: entry.title,
    description: entry.summary,
    datePublished: entry.publishedAt || new Date(entry.visibleFrom).toISOString(),
    dateModified: entry.updatedAt,
    url: new URL(`/blog/${entry.slug}`, SITE).toString(),
    ...(entry.fields?.author ? { author: { "@type": "Person", name: entry.fields.author } } : {}),
  };
  return (
    <main className="section container" style={{ paddingTop: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href="/blog" className="small muted row nowrap" style={{ marginBottom: 12 }}><Icon name="back" size={14} /> All articles</Link>
      <PostArticle entry={entry} />
    </main>
  );
}
