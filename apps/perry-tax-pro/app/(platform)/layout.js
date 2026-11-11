import Link from "next/link";
import MobileMenu from "@/components/MobileMenu";
import { taxUrl } from "@/lib/platform";
import { platformVisibility } from "@/lib/platform-visibility";
import "../(site)/site.css";
import "./platform.css";

// The InnovaCare Software pages: the platform home, EHR and the service search. The tax
// site keeps its own menus under (site).

function PlatformLogo() {
  return (
    <Link href="/" className="logo" aria-label="InnovaCare Software home">
      <span className="logo-mark">IS</span>
      <span>InnovaCare<small>Software</small></span>
    </Link>
  );
}

const nav = (v) => [
  [taxUrl(), "InnovaTax"],
  ["/training", "Training"],
  ["/compliance", "Compliance"],
  v.ehr && ["/ehr", "EHR"],
  ["/software", "Software"],
  v.find && ["/find", "Find a service"],
].filter(Boolean);

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }) {
  const v = await platformVisibility();
  const links = nav(v);
  const cta = v.find ? ["/find", "Find a service"] : ["/contact?about=Software%20project", "Contact us"];
  return (
    <div className="pub plat">
      <header className="site-header">
        <div className="container">
          <PlatformLogo />
          <nav className="nav" aria-label="Main">
            {links.map(([href, label]) => <Link key={label} href={href}>{label}</Link>)}
          </nav>
          <div className="row nowrap">
            <Link href={taxUrl("/login")} className="pub-login">Log in</Link>
            <Link href={cta[0]} className="btn btn-primary btn-sm hide-sm">{cta[1]}</Link>
            <MobileMenu links={[...links, [taxUrl("/login"), "Log in"]]} />
          </div>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <PlatformLogo />
              <p className="small mt" style={{ maxWidth: 340 }}>Software for tax, training, compliance and care organizations, under one roof.</p>
            </div>
            <div>
              <h4>Products</h4>
              <Link href={taxUrl()}>InnovaTax</Link>
              <Link href="/training">InnovaCare Training</Link>
              <Link href="/compliance">Compliance training</Link>
              {v.ehr && <Link href="/ehr">Health records</Link>}
              <Link href="/software">Software services</Link>
              {v.find && <Link href="/find">Find a service</Link>}
            </div>
            <div>
              <h4>Businesses</h4>
              <Link href="/business">List your business</Link>
              <Link href="/business/directory">Business directory</Link>
            </div>
            <div>
              <h4>Company</h4>
              <Link href="/contact">Contact us</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
          <div className="copyright row between">
            <span>© {new Date().getFullYear()} InnovaCare Software. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
