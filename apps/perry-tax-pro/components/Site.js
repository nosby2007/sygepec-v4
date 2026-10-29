import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getSiteSettings } from "@/lib/cms";
import Icon from "@/components/Icon";
import MobileMenu from "@/components/MobileMenu";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="InnovaCare Tax home">
      <span className="logo-mark">IC</span>
      <span>
        InnovaCare<small>Tax Services</small>
      </span>
    </Link>
  );
}

const NAV = [
  ["/services", "Services"],
  ["/business", "Small business"],
  ["/#pricing", "Pricing"],
  ["/blog", "Resources"],
  ["/team", "Our team"],
  ["/contact", "Contact"],
];

const tel = (phone) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export async function SiteHeader() {
  const [s, site] = await Promise.all([getSession(), getSiteSettings().catch(() => ({}))]);
  const portal = s ? (s.role === "PREPARER" ? "/admin" : s.accountType === "BUSINESS" ? "/portal/business" : "/portal") : null;
  return (
    <>
      <div className="pub-topbar">
        <div className="container">
          <span className="tagline">Personal and small-business tax preparation, all year.</span>
          <div className="links">
            {site.phone && <a href={tel(site.phone)}><Icon name="phone" size={14} /> {site.phone}</a>}
            <Link href={portal || "/login"}><Icon name="upload" size={14} /> Upload documents</Link>
            <Link href="/book"><Icon name="calendar" size={14} /> Book a visit</Link>
          </div>
        </div>
      </div>
      <header className="site-header">
        <div className="container">
          <Logo />
          <nav className="nav" aria-label="Main">
            {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
          <div className="row nowrap">
            {s ? (
              <Link id="nav-portal" href={portal} className="btn btn-ghost btn-sm">
                {s.role === "PREPARER" ? "Dashboard" : "My portal"}
              </Link>
            ) : (
              <Link id="nav-login" href="/login" className="pub-login">Log in</Link>
            )}
            <Link id="nav-register" href={s ? "/book" : "/register"} className="btn btn-primary btn-sm hide-sm">{s ? "Book a visit" : "Start my return"}</Link>
            <MobileMenu links={[...NAV, ["/book", "Book a visit"], ...(s ? [] : [["/login", "Log in"], ["/register", "Start my return"]])]} />
          </div>
        </div>
      </header>
    </>
  );
}

// Contact details come from the CMS (Website > Contact details). Anything not saved
// there is left out rather than shown as placeholder text.
export async function SiteFooter() {
  const site = await getSiteSettings().catch(() => ({}));
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p className="small mt" style={{ maxWidth: 340 }}>
              Tax preparation for individuals, families, self-employed workers and small businesses, with a secure
              portal for your documents.
            </p>
          </div>
          <div>
            <h4>Services</h4>
            <Link href="/services">All services</Link>
            <Link href="/business">Small business</Link>
            <Link href="/business/directory">Business directory</Link>
          </div>
          <div>
            <h4>Resources</h4>
            <Link href="/blog">Articles</Link>
            <Link href="/updates">Updates</Link>
            <Link href="/estimator">Refund estimator</Link>
            <Link href="/book">Book an appointment</Link>
            <Link href="/login">Client login</Link>
          </div>
          <div>
            <h4>Contact</h4>
            {site.phone && <a href={tel(site.phone)}><Icon name="phone" size={15} /> {site.phone}</a>}
            {site.email && <a href={`mailto:${site.email}`}><Icon name="mail" size={15} /> {site.email}</a>}
            {site.address && <span className="small muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="building" size={15} /> {site.address}</span>}
            {site.hours && <span className="small muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="clock" size={15} /> {site.hours}</span>}
            <Link href="/contact">Send us a message</Link>
          </div>
        </div>
        <div className="copyright row between">
          <span>© {new Date().getFullYear()} InnovaCare Tax. All rights reserved.</span>
          <span>Estimates are for information only and are not tax advice.</span>
        </div>
      </div>
    </footer>
  );
}
