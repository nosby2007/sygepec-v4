import { PageHero, UpdateItem } from "@/components/CmsViews";
import { Empty } from "@/components/ui";
import { publicEntries } from "@/lib/cms";

export const metadata = {
  title: "Updates",
  description: "Office news, deadlines and service updates from InnovaCare Tax.",
  alternates: { canonical: "/updates" },
};

export default async function UpdatesPage() {
  const updates = (await publicEntries("UPDATE")).sort((a, b) => b.visibleFrom - a.visibleFrom);
  return (
    <main className="section container" style={{ paddingTop: 48, maxWidth: 860 }}>
      <PageHero eyebrow="Updates" title="News and deadlines" summary="Office hours, filing deadlines and changes to our services." />
      {updates.length === 0
        ? <div className="card"><Empty icon="bell" title="No updates right now">Check back during filing season.</Empty></div>
        : <div className="stack">{updates.map((u) => <UpdateItem key={u.id} entry={u} />)}</div>}
    </main>
  );
}
