import type { DocumentStatus, DocumentCategory } from '../models/canonical/dossier-document.model';

export interface DocumentStatusView {
  label: string;
  cssClass: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  description: string;
}

const STATUS_VIEWS: Record<DocumentStatus, DocumentStatusView> = {
  requested: {
    label: 'Requested',
    cssClass: 'warning',
    description: 'Your advisor requested this document. Upload it when ready.',
  },
  uploaded: {
    label: 'Submitted',
    cssClass: 'info',
    description: 'Document uploaded. Awaiting human review.',
  },
  in_review: {
    label: 'In review',
    cssClass: 'info',
    description: 'A SYGEPEC advisor is reviewing this document.',
  },
  approved: {
    label: 'Approved',
    cssClass: 'success',
    description: 'Approved by your advisor. No further action required.',
  },
  rejected: {
    label: 'Needs correction',
    cssClass: 'danger',
    description: 'Document rejected. Please re-upload a corrected version.',
  },
  expired: {
    label: 'Expired',
    cssClass: 'danger',
    description: 'Document expired. A new copy is required.',
  },
};

const FALLBACK: DocumentStatusView = {
  label: 'Pending',
  cssClass: 'neutral',
  description: 'Awaiting processing.',
};

export function viewForDocumentStatus(status: string | null | undefined): DocumentStatusView {
  if (!status) return FALLBACK;
  return STATUS_VIEWS[status as DocumentStatus] ?? FALLBACK;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  passport: 'Passport',
  diploma: 'Diploma',
  transcripts: 'Academic transcripts',
  work_experience_letter: 'Work experience letter',
  birth_certificate: 'Birth certificate',
  police_clearance: 'Police clearance',
  proof_of_funds: 'Proof of funds',
  language_test: 'Language test',
  cv_resume: 'CV / Résumé',
  visa_photo: 'Visa photo',
  other: 'Other document',
  // Lot B — audit wizard premium
  transcript: 'Academic transcript',
  professional_license: 'Professional license',
  reference_letter: 'Reference letter',
  employment_letter: 'Employment letter',
  marriage_certificate: 'Marriage certificate',
  visa_refusal_letter: 'Visa refusal letter',
  medical_exam: 'Medical exam',
  sponsor_letter: 'Sponsor letter',
  bank_statement: 'Bank statement',
  identity_document: 'Identity document',
  photo: 'Photo',
};

export function labelForDocumentCategory(category: string | null | undefined): string {
  if (!category) return 'Document';
  return CATEGORY_LABELS[category as DocumentCategory] ?? category;
}
