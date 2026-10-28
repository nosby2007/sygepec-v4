import { SiteHeader, SiteFooter } from "@/components/Site";
import "./site.css";

export default function SiteLayout({ children }) {
  return (
    <div className="pub">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
