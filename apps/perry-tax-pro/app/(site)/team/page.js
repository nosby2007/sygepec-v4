import { PageHero, TeamCard } from "@/components/CmsViews";
import { Empty } from "@/components/ui";
import { publicEntries } from "@/lib/cms";

export const metadata = {
  title: "Our team",
  description: "Meet the InnovaCare Tax team.",
  alternates: { canonical: "/team" },
};

export default async function TeamPage() {
  const team = await publicEntries("TEAM");
  return (
    <main className="section container" style={{ paddingTop: 48 }}>
      <PageHero eyebrow="Team" title="The people behind your return" />
      {team.length === 0
        ? <div className="card"><Empty icon="users" title="Team profiles coming soon" /></div>
        : <div className="grid-3">{team.map((m) => <TeamCard key={m.id} entry={m} />)}</div>}
    </main>
  );
}
