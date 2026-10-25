import { notFound } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";
import { getEntry, listRevisions } from "@/lib/cms";
import { CMS_TYPES } from "@/lib/cms-shared";
import { PageHead } from "@/components/ui";
import ContentEditor from "../ContentEditor";

export const metadata = { title: "Edit content" };

export default async function Page({ params }) {
  const { id } = await params;
  const session = await getFirebaseSession();
  const entry = await getEntry(session, id);
  if (!entry) notFound();
  const { updateTime: _u, ...initial } = entry;
  return (
    <>
      <PageHead kicker={`Website · ${CMS_TYPES[entry.type].label}`} icon="megaphone" title={entry.title} />
      <ContentEditor key={`${entry.id}-${entry.version}`} initial={initial} revisions={await listRevisions(session, id)} />
    </>
  );
}
