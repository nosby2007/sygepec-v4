import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import ClientBooking from "@/components/mobile/ClientBooking";
import { getFirebaseSession } from "@/lib/auth";
import { publicServices, publicStaff, resolveBusiness } from "@/lib/business-booking";

export async function generateMetadata({ params }) {
  const profile = await resolveBusiness((await params).slug);
  return { title: profile ? `Book with ${profile.name}` : "Business not found" };
}

export default async function Page({ params, searchParams }) {
  const profile = await resolveBusiness((await params).slug);
  if (!profile) notFound();
  const [session, services, staff] = await Promise.all([getFirebaseSession(), publicServices(profile.businessId), publicStaff(profile.businessId)]);
  const pre = (await searchParams)?.service;
  const preselect = services.some((s) => s.id === pre) ? pre : services[0]?.id;
  const here = `/m/client/book/${profile.slug}${preselect ? `?service=${preselect}` : ""}`;

  return (
    <main className="m-main">
      <div className="m-head"><Link className="m-back" href={`/m/client/business/${profile.slug}`}><Icon name="back" size={24} /> Book</Link></div>
      <p className="m-sub">{profile.name} · {profile.autoConfirm ? "Bookings are confirmed right away." : "The business confirms each request."}</p>
      {!profile.publicBooking || services.length === 0 ? (
        <div className="m-alert info">Online booking is not available right now.{profile.phone ? ` Please call ${profile.phone}.` : ""}</div>
      ) : !session ? (
        <div className="m-card">
          <h3>Sign in to book</h3>
          <p>With an InnovaCare account your bookings are saved in the app, where you can move or cancel them.</p>
          <div className="m-btns m-gap">
            <Link className="m-btn" href={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link>
            <Link className="m-btn ghost" href={`/register?next=${encodeURIComponent(here)}`}>Create a free account</Link>
            <Link className="m-btn ghost" href={`/business/${profile.slug}/book${preselect ? `?service=${preselect}` : ""}`}>Book as a guest</Link>
          </div>
        </div>
      ) : (
        <ClientBooking
          slug={profile.slug}
          business={{ name: profile.name, autoConfirm: profile.autoConfirm }}
          services={services.map(({ id, name, priceCents, durationMinutes }) => ({ id, name, priceCents, durationMinutes }))}
          staff={staff.map(({ id, name, serviceIds }) => ({ id, name, serviceIds }))}
          preselect={preselect}
          me={{ name: session.name, email: session.email }}
        />
      )}
    </main>
  );
}
