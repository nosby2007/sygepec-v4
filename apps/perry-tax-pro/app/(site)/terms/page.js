import CmsPage, { cmsPageMetadata } from "@/components/CmsPage";

export const generateMetadata = () => cmsPageMetadata("terms");

export default function Page() {
  return <CmsPage slug="terms" />;
}
