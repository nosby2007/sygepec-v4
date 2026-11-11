import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { ServiceArticle } from "@/components/CmsViews";
import { publicEntry } from "@/lib/cms";

export async function generateMetadata({ params }) {
  const entry = await publicEntry("SERVICE", (await params).slug);
  if (!entry) return { title: "Service not found", robots: { index: false } };
  return { title: entry.title, description: entry.summary, alternates: { canonical: `/services/${entry.slug}` }, openGraph: { title: entry.title, description: entry.summary, type: "article" } };
}

export default async function ServicePage({ params }) {
  const entry = await publicEntry("SERVICE", (await params).slug);
  if (!entry) notFound();
  const faqs = entry.fields?.faqs || [];
  // FAQ structured data uses exactly the questions and answers shown on the page.
  const jsonLd = faqs.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a } })),
  } : null;
  return (
    <main className="section container" style={{ paddingTop: 40 }}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <Link href="/services" className="small muted row nowrap" style={{ marginBottom: 12 }}><Icon name="back" size={14} /> All services</Link>
      <ServiceArticle entry={entry} />
    </main>
  );
}
