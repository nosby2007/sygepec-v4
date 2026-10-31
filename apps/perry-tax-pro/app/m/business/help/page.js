import Link from "next/link";
import Icon from "@/components/Icon";
import { getSiteSettings } from "@/lib/cms";

export const metadata = { title: "Help center" };

const TOPICS = [
  {
    title: "Calendar & appointments",
    items: [
      ["Add a booking", "On Appointments, tap +. Pick or type the client, the service, the day and the time. The calendar refuses times that are already taken."],
      ["Confirm an online request", "New online requests show on the bell and the clipboard button. Open one and tap Confirm. Turn on automatic confirmation under Settings › Online booking."],
      ["Move or cancel", "Tap the booking, then Reschedule or Cancel booking. A cancelled time becomes free for others to book."],
      ["Send a reminder", "Open a confirmed booking and tap Text reminder or Email reminder. Automatic reminders are part of the Advanced plan."],
    ],
  },
  {
    title: "Clients",
    items: [
      ["Add a client", "On Clients, tap Add Client. Tick “Agreed to marketing messages” only if the client said yes."],
      ["Groups", "Clients are grouped by stage (lead, customer, regular, lapsed) and by any tags you add."],
      ["Notes and history", "Open a client and tap Show under History to read and add notes, calls and visits."],
    ],
  },
  {
    title: "Checkout & payments",
    items: [
      ["Take a card payment", "On Checkout, add the items, then Charge card. The client scans the QR code (or you open the page on your phone) and pays by card, Apple Pay or Google Pay."],
      ["Cash", "Tap Cash. The sale is added to your books as income straight away."],
      ["Payouts", "Card payments go to your bank through your own payment account. Set it up under Settings › Payments & checkout."],
    ],
  },
  {
    title: "Marketing & profile",
    items: [
      ["Get more bookings", "Publish your page, then put its link on Google, Instagram and Facebook. Share it from Marketing or Profile."],
      ["Portfolio", "On Profile, tap Add from phone. Photos show on your public page."],
      ["Growth levels", "Profile › level card lists the next steps that bring in more clients."],
    ],
  },
];

export default async function Page() {
  const site = await getSiteSettings().catch(() => null);
  return (
    <main className="m-main">
      <div className="m-head"><Link className="m-back" href="/m/business/profile"><Icon name="back" size={24} /> Help center</Link></div>
      {TOPICS.map((t) => (
        <section key={t.title}>
          <div className="m-section"><h2>{t.title}</h2></div>
          <div className="m-list">
            {t.items.map(([q, a]) => (
              <details key={q} className="m-row" style={{ display: "block" }}>
                <summary style={{ fontSize: 17, fontWeight: 600, cursor: "pointer" }}>{q}</summary>
                <p className="m-sub" style={{ margin: "10px 0 0" }}>{a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <div className="m-section"><h2>Still need help?</h2></div>
      <div className="m-btns">
        {site?.phone && <a className="m-btn ghost" href={`tel:${site.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={18} /> Call {site.phone}</a>}
        {site?.email && <a className="m-btn ghost" href={`mailto:${site.email}?subject=${encodeURIComponent("Help with the InnovaCare app")}`}><Icon name="mail" size={18} /> Email us</a>}
        <Link className="m-btn" href="/contact"><Icon name="chat" size={18} /> Send a message</Link>
      </div>
    </main>
  );
}
