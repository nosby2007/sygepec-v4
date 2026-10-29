import { requireRole } from "@/lib/auth";
import { TwoStepSettings } from "@/components/TwoStep";
import { PageHead } from "@/components/ui";

export const metadata = { title: "Security" };

export default async function Page() {
  await requireRole("CLIENT");
  return (
    <>
      <PageHead kicker="Account" icon="shield" title="Security" desc="Protect the documents in your account with a code from your phone." />
      <div className="grid-2">
        <TwoStepSettings required={false} />
        <div className="card stack-sm">
          <div className="card-title"><h3>How we protect your data</h3></div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>You are signed out after 20 minutes without activity.</li>
            <li>Every upload is checked before it is stored; unsafe files are refused.</li>
            <li>Your signed Form 8879 and its identity-check record are kept for the 3 years the IRS requires and cannot be deleted.</li>
            <li>Each time staff open one of your documents, it is recorded.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
