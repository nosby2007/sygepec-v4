import { PageHero, PostCard } from "@/components/CmsViews";
import { Empty } from "@/components/ui";
import { publicEntries } from "@/lib/cms";

export const metadata = {
  title: "Blog",
  description: "Plain-language tax guides and tips from InnovaCare Tax.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
  const posts = (await publicEntries("POST")).sort((a, b) => b.visibleFrom - a.visibleFrom);
  return (
    <main className="section container" style={{ paddingTop: 48 }}>
      <PageHero eyebrow="Blog" title="Tax guides and tips" summary="Plain-language explanations to help you prepare." />
      {posts.length === 0
        ? <div className="card"><Empty icon="book" title="No articles yet">Check back soon.</Empty></div>
        : <div className="grid-3">{posts.map((p) => <PostCard key={p.id} entry={p} />)}</div>}
    </main>
  );
}
