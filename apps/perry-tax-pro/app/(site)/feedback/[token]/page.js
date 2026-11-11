import Icon from "@/components/Icon";
import { openFeedbackRequest } from "@/lib/business-growth";
import FeedbackForm from "./FeedbackForm";

export const metadata = { title: "Share your feedback", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params }) {
  const { token } = await params;
  const opened = await openFeedbackRequest(token);
  return (
    <main className="section container" style={{ maxWidth: 640, paddingTop: 48 }}>
      {!opened ? (
        <div className="alert alert-error"><Icon name="alert" size={16} />This feedback link is not valid or has expired.</div>
      ) : (
        <div className="card stack">
          <span className="eyebrow" style={{ alignSelf: "flex-start" }}>Feedback</span>
          <h1 style={{ margin: 0, fontSize: "1.8rem" }}>How was your {opened.request.serviceName}{opened.businessName !== "the business" ? ` at ${opened.businessName}` : ""}?</h1>
          <p className="small" style={{ margin: 0 }}>Your answer goes to the business. It is only shown publicly if you allow it below.</p>
          <FeedbackForm token={token} />
        </div>
      )}
    </main>
  );
}
