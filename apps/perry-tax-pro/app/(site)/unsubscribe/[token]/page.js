import UnsubscribeButton from "./UnsubscribeButton";

export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

// Opening the link changes nothing (mail scanners open links); the reader confirms.
export default async function UnsubscribePage({ params }) {
  const { token } = await params;
  return (
    <main className="section container" style={{ maxWidth: 560, paddingTop: 60 }}>
      <div className="card stack">
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>Stop marketing emails?</h1>
        <p className="small" style={{ margin: 0 }}>You will no longer receive promotional emails from this business. Messages about bookings you make are not affected.</p>
        <UnsubscribeButton token={token} />
      </div>
    </main>
  );
}
