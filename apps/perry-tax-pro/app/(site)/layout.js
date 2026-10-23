import { SiteHeader, SiteFooter } from "@/components/Site";

export default function SiteLayout({ children }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
