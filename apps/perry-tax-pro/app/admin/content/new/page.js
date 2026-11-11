import { notFound } from "next/navigation";
import { CMS_TYPES } from "@/lib/cms-shared";
import { PageHead } from "@/components/ui";
import ContentEditor from "../ContentEditor";

export const metadata = { title: "New content" };

export default async function Page({ searchParams }) {
  const type = (await searchParams)?.type;
  if (!CMS_TYPES[type]) notFound();
  return (
    <>
      <PageHead kicker="Website" icon="megaphone" title={`New ${CMS_TYPES[type].label.toLowerCase()}`} />
      <ContentEditor initial={{ type, title: "", slug: "", summary: "", body: "", fields: {}, status: "DRAFT", imagePath: null }} revisions={[]} />
    </>
  );
}
