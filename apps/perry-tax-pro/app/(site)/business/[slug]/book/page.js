import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { publicServices, publicStaff, resolveBusiness } from "@/lib/business-booking";
import PublicBookingForm from "./PublicBookingForm";

export async function generateMetadata({ params }) {
  const profile = await resolveBusiness((await params).slug);
  if (!profile) return { title: "Business not found", robots: { index: false } };
  return { title: `Book with ${profile.name}`, alternates: { canonical: `/business/${profile.slug}/book` } };
}

export default async function BookBusinessPage({ params, searchParams }) {
  const profile = await resolveBusiness((await params).slug);
  if (!profile) notFound();
  const [services, staff] = await Promise.all([publicServices(profile.businessId), publicStaff(profile.businessId)]);
  const preselect = (await searchParams)?.service;

  return (
    <main className="section" style={{ paddingTop: 48 }}>
      <div className="container" style={{ maxWidth: 1100 }}>
        <Link href={`/business/${profile.slug}`} className="small muted row nowrap" style={{ marginBottom: 12 }}><Icon name="back" size={14} /> {profile.name}</Link>
        <div className="section-head" style={{ textAlign: "left", marginLeft: 0 }}>
          <span className="eyebrow">Online booking</span>
          <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)", margin: "14px 0 8px" }}>Book with <span className="grad-text">{profile.name}</span></h1>
          <p>{profile.autoConfirm ? "Bookings are confirmed right away." : "Your request goes to the business, who will confirm it."}</p>
        </div>
        {!profile.publicBooking || services.length === 0 ? (
          <div className="alert alert-info"><Icon name="info" size={16} />Online booking is not available right now.{profile.phone ? ` Please call ${profile.phone}.` : ""}</div>
        ) : (
          <PublicBookingForm
            slug={profile.slug}
            business={{ name: profile.name, autoConfirm: profile.autoConfirm, phone: profile.phone || "" }}
            services={services.map(({ id, name, priceCents, durationMinutes, description }) => ({ id, name, priceCents, durationMinutes, description }))}
            staff={staff.map(({ id, name, title, serviceIds }) => ({ id, name, title, serviceIds }))}
            preselect={services.some((s) => s.id === preselect) ? preselect : services[0].id}
          />
        )}
      </div>
    </main>
  );
}
