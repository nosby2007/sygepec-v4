import CmsPage, { cmsPageMetadata } from "@/components/CmsPage";

export const generateMetadata = () => cmsPageMetadata("about");

export default function Page() {
  return <CmsPage slug="about" />;
}
