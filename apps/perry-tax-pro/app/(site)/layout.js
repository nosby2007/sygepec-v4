import { SiteHeader, SiteFooter } from "@/components/Site";
import AppBar from "@/components/AppBar";
import { appMode } from "@/lib/auth";
import { appHome } from "@/lib/app-mode";
import "./site.css";

// Inside the native apps the website pages they open get the app bar instead of the
// site menus and footer, so the user stays in the app.
export default async function SiteLayout({ children }) {
  const app = await appMode();
  if (app) {
    return (
      <div className="pub app-mode">
        <AppBar title="InnovaCare" home={appHome(app)} />
        {children}
      </div>
    );
  }
  return (
    <div className="pub">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
