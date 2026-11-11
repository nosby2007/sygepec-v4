import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { loadBusinessHome } from "@/lib/mobile-business";
import { mediaUrl } from "@/lib/business-display";
import Icon from "@/components/Icon";
import { initials, shortDay } from "@/components/mobile/format";
import { CoverTools, ImagePicker, Portfolio, ShareButton } from "@/components/mobile/ProfileTools";

export const metadata = { title: "Profile" };

export default async function Page() {
  const h = await loadBusinessHome(await getFirebaseSession());
  const p = h.profile;
  const name = p?.name || "Your business";
  const level = h.growth.current;
  const reviews = h.feedback.filter((f) => f.comment).slice(0, 8);
  return (
    <main className="m-main m-flush" style={{ paddingTop: 0 }}>
      <div className="m-cover" style={p?.coverPath ? { backgroundImage: `url(${mediaUrl(p.coverPath)})` } : undefined}>
        <CoverTools publicUrl={h.published ? h.publicUrl : null} name={name} hasProfile={Boolean(p)} />
      </div>
      <div className="m-profile-card">
        <ImagePicker target="logo" label="Change profile photo" disabled={!p} className="m-profile-logo" style={p?.logoPath ? { backgroundImage: `url(${mediaUrl(p.logoPath)})` } : undefined}>
          {!p?.logoPath && initials(name)}
        </ImagePicker>
        {h.rating !== null && <span className="m-rating"><span className="m-stars" style={{ fontSize: 18 }}>★</span>{h.rating.toFixed(1)}</span>}
        <h1>{name}</h1>
        {!p && <div className="m-alert info">Start with your business details so clients can find you. <Link href="/portal/business/profile">Set up now</Link></div>}
        {p && !h.published && <div className="m-alert info">Your page is a draft. <Link href="/portal/business/profile">Publish it</Link> so clients can book online.</div>}
        <Link className="m-level" href="/m/business/levels">
          <div className="m-level-top"><b>{level.title}</b><span>{level.doneCount} of {level.total} completed <Icon name="chevron" size={16} /></span></div>
          <div className="m-progress"><i style={{ width: `${(level.doneCount / level.total) * 100}%` }} /></div>
        </Link>
        <div className="m-list m-gap" style={{ textAlign: "left", border: 0 }}>
          <Link className="m-row" href="/portal/business/plan">
            <div className="m-row-icon"><Icon name="wallet" size={26} /></div>
            <div className="m-row-text"><b>Business wallet</b><span>{h.payout?.chargesEnabled ? "Card payments are on. See payouts and tax set-aside." : "Connect your payment account to take cards and get paid out."}</span></div>
            <Icon name="chevron" size={20} className="m-chev" />
          </Link>
          <Link className="m-row" href="/portal/business">
            <div className="m-row-icon"><Icon name="bars" size={26} /></div>
            <div className="m-row-text"><b>Stats &amp; reports</b><span>Income, expenses, bookings and your books for tax time.</span></div>
            <Icon name="chevron" size={20} className="m-chev" />
          </Link>
        </div>
      </div>

      <div style={{ padding: "0 var(--m-gutter)" }}>
        <div className="m-invite">
          <h3><Icon name="gift" size={22} /> Know another business owner?</h3>
          <p>Invite them to InnovaCare. They get booking, payments and bookkeeping in one app, with tax help from our preparers.</p>
          <ShareButton title="Join me on InnovaCare" text="I run my bookings, payments and books on InnovaCare. Try it:" url={`${h.site}/business/register`} label="Share your invite link" />
        </div>

        <div className="m-card">
          <div className="m-card-row">
            <span className="m-orb blue"><Icon name="share" size={28} /></span>
            <div style={{ flex: 1 }}>
              <h3>Share a post</h3>
              <p>Tell your followers they can book you anytime. Shares your page with a ready-made message.</p>
            </div>
          </div>
          <div className="m-gap"><ShareButton title={name} text={`Book with ${name} anytime, online:`} url={h.publicUrl} label="Create and share a post" disabled={!h.published} /></div>
        </div>

        <div className="m-section" id="portfolio"><h2>Portfolio</h2><span className="m-sub" style={{ margin: 0 }}>{h.portfolio.length} photos</span></div>
        <Portfolio photos={h.portfolio.map((ph) => ({ ...ph, url: mediaUrl(ph.path) }))} disabled={!p} />

        <div className="m-section"><h2>Recent reviews</h2><Link href="/portal/business/growth">More <Icon name="chevron" size={16} /></Link></div>
        {reviews.length === 0 ? (
          <div className="m-card"><p>No reviews yet. After a visit, ask the client for feedback from the Growth hub. Good reviews bring new clients.</p></div>
        ) : (
          <div className="m-strip">
            {reviews.map((r) => (
              <div key={r.id} className="m-review">
                <div className="m-card-row"><span className="m-stars">{"★".repeat(r.rating)}<span style={{ color: "var(--track)" }}>{"★".repeat(5 - r.rating)}</span></span><small>{r.displayName || "Client"}<br />{shortDay(r.createdAt)}</small></div>
                <p>{r.comment}</p>
              </div>
            ))}
          </div>
        )}

        <div className="m-section"><h2>Help</h2></div>
        <div className="m-list">
          <Link className="m-row" href="/m/business/help"><div className="m-row-icon"><Icon name="help" size={24} /></div><div className="m-row-text"><b>Help center</b><span>How-tos, tips and contact</span></div><Icon name="chevron" size={20} className="m-chev" /></Link>
        </div>
      </div>
      <Link className="m-fab" href="/m/business/settings" aria-label="Settings"><Icon name="gear" size={28} /></Link>
    </main>
  );
}
