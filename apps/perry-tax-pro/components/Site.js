import Link from "next/link";
import { getSession } from "@/lib/auth";
import Icon from "@/components/Icon";

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

export async function SiteHeader() {
  const s = await getSession();
  return (
    <>
      <div className="announce">
        <b>2026 filing season is open.</b> Book early for priority review.
        <Link href="/estimator">Estimate your refund →</Link>
      </div>
      <header className="site-header">
        <div className="container">
          <Logo />
          <nav className="nav" aria-label="Main">
            <Link href="/#services">Services</Link>
            <Link href="/business">Business</Link>
            <Link href="/#how">How It Works</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/estimator">Refund Estimator</Link>
            <Link href="/book">Book</Link>
          </nav>
          <div className="row">
            {s ? (
              <Link id="nav-portal" href={s.role === "PREPARER" ? "/admin" : s.accountType === "BUSINESS" ? "/portal/business" : "/portal"} className="btn btn-primary btn-sm">
                {s.role === "PREPARER" ? "Dashboard" : "My Portal"} <Icon name="arrow" size={16} className="icon-arrow" />
              </Link>
            ) : (
              <>
                <Link id="nav-login" href="/login" className="btn btn-ghost btn-sm">Log in</Link>
                <Link id="nav-register" href="/register" className="btn btn-primary btn-sm">Get Started <Icon name="arrow" size={16} className="icon-arrow" /></Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p className="small mt" style={{ maxWidth: 340 }}>
              Accurate, stress-free tax preparation for individuals, families, gig workers and small businesses.
            </p>
            <div className="footer-badges">
              <span><Icon name="lock" size={14} /> Encrypted portal</span>
              <span><Icon name="shield" size={14} /> IRS e-file provider</span>
              <span><Icon name="star" size={14} /> 4.9 client rating</span>
            </div>
          </div>
          <div>
            <h4>Services</h4>
            <Link href="/#services">Individual Returns</Link>
            <Link href="/#services">Self-Employed</Link>
            <Link href="/business">InnovaCare Business</Link>
            <Link href="/#services">IRS Notices</Link>
          </div>
          <div>
            <h4>Tools</h4>
            <Link href="/estimator">Refund Estimator</Link>
            <Link href="/book">Book Appointment</Link>
            <Link href="/portal">Client Portal</Link>
          </div>
          <div>
            <h4>Contact</h4>
            <a href="mailto:hello@innovacaretax.com"><Icon name="mail" size={15} /> hello@innovacaretax.com</a>
            <a href="tel:+15550102000"><Icon name="phone" size={15} /> (555) 010-2000</a>
            <span className="small muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="clock" size={15} /> Mon–Sat · 9am–7pm</span>
          </div>
        </div>
        <div className="copyright row between">
          <span>© {new Date().getFullYear()} InnovaCare Tax. All rights reserved.</span>
          <span>Estimates are for informational purposes and are not tax advice.</span>
        </div>
      </div>
    </footer>
  );
}
