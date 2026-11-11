import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { loadBusinessHome } from "@/lib/mobile-business";
import { allows } from "@/lib/plans";
import Icon from "@/components/Icon";
import { dollars, shortDay } from "@/components/mobile/format";
import InviteClients from "@/components/mobile/InviteClients";
import { ShareButton } from "@/components/mobile/ProfileTools";

export const metadata = { title: "Marketing" };

export default async function Page() {
  const h = await loadBusinessHome(await getFirebaseSession());
  const name = h.profile?.name || "my business";
  // Clients not seen yet: added to the list but never booked.
  const toInvite = h.customers.filter((c) => c.source !== "walk-in" && !c.visits && !c.nextVisitMs && (c.phone || c.email));
  const sent = h.campaigns.filter((c) => c.status === "SENT");
  const lastCampaign = sent.map((c) => c.sentAt).filter(Boolean).sort().at(-1);
  const yearStart = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const onlineYtd = h.bookings.filter((b) => b.source !== "OWNER" && b.start_ms >= yearStart && b.status !== "CANCELLED");
  const canCampaign = allows(h.plan, "CAMPAIGNS");
  const canFeedback = allows(h.plan, "FEEDBACK");

  return (
    <main className="m-main">
      <div className="m-head"><h1>Marketing</h1></div>

      <div className="m-hero">
        <h3>More bookings from Google?</h3>
        <p>{h.published ? "Your page is live. Add its link to your Google Business Profile, Instagram and Facebook so clients can book in a tap." : "Publish your page so clients can find and book you online."}</p>
        {h.published ? (
          <ShareButton title={name} text={`Book with ${name} online:`} url={h.publicUrl} label="Share your booking link" />
        ) : (
          <Link className="m-btn" href="/portal/business/profile">Publish my page <Icon name="arrow" size={18} /></Link>
        )}
      </div>

      <div className="m-card">
        <div className="m-card-row">
          <div>
            <span className={`m-status ${toInvite.length ? "warn" : "on"}`}>{toInvite.length ? `${toInvite.length} clients to invite` : "Everyone invited"}</span>
            <h3>Invite clients</h3>
            <p>Invite your clients to book you online 24/7.</p>
          </div>
          <span className="m-orb gold"><Icon name="mail" size={28} /></span>
        </div>
        <div className="m-gap"><InviteClients clients={toInvite.map(({ id, name: n, phone, email }) => ({ id, name: n, phone: phone || "", email: email || "" }))} url={h.publicUrl} business={name} /></div>
      </div>

      <div className="m-card">
        <div className="m-card-row">
          <div>
            <span className={`m-status ${sent.length ? "on" : "off"}`}>{sent.length ? "Sent" : canCampaign ? "Not started" : "Premium plan"}</span>
            <h3>Email marketing</h3>
            <p>Send news, offers and reminders to clients who agreed to hear from you.</p>
          </div>
          <span className={`m-orb ${sent.length ? "green" : "grey"}`}><Icon name="send" size={28} /></span>
        </div>
        <div className="m-stats">
          <div><span>Last sent</span><b>{lastCampaign ? shortDay(lastCampaign) : "—"}</b></div>
          <div><span>Campaigns</span><b>{sent.length}</b></div>
          <div><span>Can receive</span><b>{h.customers.filter((c) => c.marketingConsent && c.email).length}</b></div>
        </div>
        <Link className="m-btn ghost m-gap" href={canCampaign ? "/portal/business/growth" : "/portal/business/plan?upgrade=CAMPAIGNS"}>{canCampaign ? "Write a campaign" : "See plans"}</Link>
      </div>

      <div className="m-card">
        <div className="m-card-row">
          <div>
            <span className={`m-status ${h.reviewCount ? "on" : "off"}`}>{h.reviewCount ? `${h.rating?.toFixed(1)} ★ average` : "No reviews yet"}</span>
            <h3>Reviews</h3>
            <p>Ask happy clients for a review after their visit. Featured reviews show on your page.</p>
          </div>
          <span className="m-orb violet"><Icon name="star" size={28} /></span>
        </div>
        <div className="m-stats">
          <div><span>Reviews</span><b>{h.reviewCount}</b></div>
          <div><span>Requested</span><b>{h.feedbackRequests.length}</b></div>
          <div><span>Featured</span><b>{h.feedback.filter((f) => f.featured).length}</b></div>
        </div>
        <Link className="m-btn ghost m-gap" href={canFeedback ? "/portal/business/growth" : "/portal/business/plan?upgrade=FEEDBACK"}>{canFeedback ? "Manage reviews" : "See plans"}</Link>
      </div>

      <div className="m-card">
        <div className="m-card-row">
          <div>
            <span className={`m-status ${h.published && h.profile?.publicBooking ? "on" : "off"}`}>{h.published && h.profile?.publicBooking ? "Taking online bookings" : "Online booking off"}</span>
            <h3>Online bookings</h3>
            <p>Bookings clients made themselves from your page this year.</p>
          </div>
          <span className="m-orb teal"><Icon name="calendar" size={28} /></span>
        </div>
        <div className="m-stats">
          <div><span>This year</span><b>{onlineYtd.length}</b></div>
          <div><span>Completed</span><b>{onlineYtd.filter((b) => b.status === "COMPLETED").length}</b></div>
          <div><span>Value</span><b>{dollars(onlineYtd.filter((b) => b.status === "COMPLETED").reduce((a, b) => a + (b.price_cents || 0), 0))}</b></div>
        </div>
      </div>

      <div className="m-card">
        <div className="m-card-row">
          <div>
            <h3>Social media post</h3>
            <p>Share a ready-made post with your booking link to Instagram, Facebook, WhatsApp or any app on your phone.</p>
          </div>
          <span className="m-orb blue"><Icon name="share" size={28} /></span>
        </div>
        <div className="m-gap"><ShareButton title={name} text={`✨ Now booking at ${name}! Pick your time online, 24/7:`} url={h.publicUrl} label="Share a post" disabled={!h.published} /></div>
      </div>
    </main>
  );
}
