import Link from "next/link";
import Icon from "@/components/Icon";
import { bookingSettingsOf, guestCanChange, openGuestBooking } from "@/lib/business-booking";
import { money } from "@/lib/business-display";
import { formatInZone, zoneLabel } from "@/lib/timezone";
import GuestBookingActions from "./GuestBookingActions";

// The token in the URL is the guest's only key to this booking: never index or cache it.
export const metadata = { title: "Your booking", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS = {
  REQUESTED: "Waiting for the business to confirm", CONFIRMED: "Confirmed", COMPLETED: "Completed",
  CANCELLED: "Cancelled", NO_SHOW: "Marked as missed",
};

export default async function GuestBookingPage({ params }) {
  const { slug, token } = await params;
  const opened = await openGuestBooking(token);
  if (!opened) {
    return (
      <main className="section container" style={{ maxWidth: 720, paddingTop: 60 }}>
        <div className="alert alert-error"><Icon name="alert" size={16} />This booking link is not valid. Check that you copied the whole link, or contact the business.</div>
        <Link href={`/business/${slug}`} className="btn btn-ghost mt">Back to the business</Link>
      </main>
    );
  }
  const { dto: b, profile } = opened;
  const settings = bookingSettingsOf(profile);
  const canChange = guestCanChange({ status: b.status, startMs: b.start_ms }, settings, new Date().getTime());
  const zone = b.time_zone || settings.timeZone;

  return (
    <main className="section container" style={{ maxWidth: 760, paddingTop: 48 }}>
      <Link href={`/business/${opened.slug || slug}`} className="small muted row nowrap" style={{ marginBottom: 12 }}><Icon name="back" size={14} /> {profile?.name}</Link>
      <div className="card stack">
        <div className="card-title">
          <h1 style={{ margin: 0, fontSize: "1.6rem" }}>Your booking</h1>
          <span className={`badge s-${b.status}`}>{STATUS[b.status] || b.status}</span>
        </div>
        <div className="row nowrap">
          <div className="date-tile"><span>{formatInZone(b.scheduled_at, zone, { month: "short" })}</span><b>{formatInZone(b.scheduled_at, zone, { day: "numeric" })}</b></div>
          <div>
            <b>{formatInZone(b.scheduled_at, zone, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} {zoneLabel(zone, new Date(b.start_ms))}</b>
            <div className="small muted">{b.service} · {b.duration_minutes} min · {money(b.price_cents)}{b.staff_name ? ` · with ${b.staff_name}` : ""}</div>
          </div>
        </div>
        <div className="breakdown" style={{ marginTop: 0 }}>
          <div><span>Name</span><b>{b.name}</b></div>
          <div><span>Email</span><b>{b.email}</b></div>
          {profile?.phone && <div><span>Business phone</span><b><a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}>{profile.phone}</a></b></div>}
        </div>
        {b.status === "CANCELLED" && b.cancel_reason && <p className="small">Reason: {b.cancel_reason}</p>}
        {canChange
          ? <GuestBookingActions token={token} slug={opened.slug || slug} booking={{ id: b.id, serviceId: b.service_id, staffId: b.staff_id, rescheduleLeft: settings.maxReschedules - b.reschedule_count }} />
          : ["REQUESTED", "CONFIRMED"].includes(b.status) && (
            <p className="hint">Online changes close {settings.cancelCutoffHours} hours before the appointment.{profile?.phone ? ` Please call ${profile.phone}.` : " Please contact the business."}</p>
          )}
      </div>
    </main>
  );
}
