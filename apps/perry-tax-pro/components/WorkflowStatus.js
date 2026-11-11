import { SIGNATURE_STATUSES, SUBMISSION_STATUSES, workflowLabel } from "@/lib/constants";

export function SignatureBadge({ status }) {
  return <span className={`badge wf-${status}`}>{workflowLabel(SIGNATURE_STATUSES, status)}</span>;
}

export function SubmissionBadge({ status }) {
  return <span className={`badge wf-${status}`}>{workflowLabel(SUBMISSION_STATUSES, status)}</span>;
}
