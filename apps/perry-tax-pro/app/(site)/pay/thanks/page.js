import Link from "next/link";
import Icon from "@/components/Icon";
import { money } from "@/lib/billing";
import { confirmInvoicePayment } from "@/lib/connect";

export const metadata = { title: "Payment", robots: { index: false } };

// Where a business's customer lands after paying an invoice online.
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const result = params?.cancelled ? null : await confirmInvoicePayment(params?.session_id, params?.acct).catch(() => null);
  const view = params?.cancelled
    ? { icon: "x", title: "Payment cancelled", text: "Nothing was charged. You can use the same link again to pay." }
    : result?.paid
      ? { icon: "check", title: "Payment received", text: `Thank you. ${money(result.amountCents)} was paid to ${result.business}. A receipt from Stripe is on its way to your email.` }
      : result
        ? { icon: "clock", title: "Payment processing", text: `Your payment to ${result.business} is still being confirmed. Refresh this page in a minute.` }
        : { icon: "alert", title: "We could not find this payment", text: "If you were charged, your receipt from Stripe is the proof of payment. Contact the business with it." };
  return (
    <main className="signed-out">
      <div className="signed-out-card">
        <span className="signed-out-icon"><Icon name={view.icon} size={30} /></span>
        <h1>{view.title}</h1>
        <p>{view.text}</p>
        <Link href="/" className="btn btn-ghost btn-lg">Close</Link>
      </div>
    </main>
  );
}
