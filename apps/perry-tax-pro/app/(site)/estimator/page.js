export const metadata = {
  title: "2026 Federal Refund Estimator",
  description: "Estimate your 2026 federal tax refund or balance due in seconds with the free InnovaCare Tax refund calculator.",
};
import Estimator from "./Estimator";

export default function Page() {
  return (
    <main className="section" style={{ paddingTop: 60 }}>
      <div className="container">
        <div className="section-head">
          <span className="eyebrow"><span className="dot" /> Free Tool · Live results</span>
          <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)", margin: "16px 0 12px" }}>
            2026 <span className="grad-text">Refund Estimator</span>
          </h1>
          <p>See where you stand in seconds. Results update as you type.</p>
        </div>
        <Estimator />
      </div>
    </main>
  );
}
