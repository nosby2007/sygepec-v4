import Link from "next/link";
import Icon from "@/components/Icon";
import { APP_SCHEMES } from "@/lib/app-mode";

export const metadata = { title: "Back to the app", robots: { index: false } };

const VIEWS = {
  paid: { icon: "check", title: "Payment received", text: "Thank you. Your payment is recorded and a receipt from Stripe is on its way." },
  pending: { icon: "clock", title: "Payment processing", text: "Your payment is still being confirmed. It will show in the app shortly." },
  cancelled: { icon: "x", title: "Payment cancelled", text: "Nothing was charged. You can pay from the app whenever you are ready." },
  connect: { icon: "check", title: "Back to InnovaCare Business", text: "You can return to the app to see where your payment account stands." },
};

// Stripe's pages open in the phone's browser, which is not signed in. People who started
// in a native app land here (lib/payments.js, lib/connect.js) with a button back to it.
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const view = VIEWS[params?.status] || VIEWS.pending;
  const scheme = APP_SCHEMES[params?.app];
  return (
    <main className="signed-out">
      <div className="signed-out-card">
        <span className="signed-out-icon"><Icon name={view.icon} size={30} /></span>
        <h1>{view.title}</h1>
        <p>{view.text}</p>
        {scheme
          ? <a id="back-to-app" href={`${scheme}://open`} className="btn btn-primary btn-lg">Back to the app</a>
          : <Link href="/tax" className="btn btn-ghost btn-lg">Close</Link>}
      </div>
    </main>
  );
}
