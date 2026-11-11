import CmsPage, { cmsPageMetadata } from "@/components/CmsPage";

export const generateMetadata = () => cmsPageMetadata("privacy");

export default function Page() {
  return <CmsPage slug="privacy" />;
}
