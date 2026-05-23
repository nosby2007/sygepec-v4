import type { PublicFaqItem } from '../models/public-content.model';

export const PUBLIC_FAQS: PublicFaqItem[] = [
  {
    question: 'Is SYGEPEC an immigration law firm?',
    answer:
      'No. SYGEPEC is a preparation and workflow platform. It helps users organize, prepare and track immigration, career and document workflows. Legal or regulated advice should be verified with official authorities or licensed professionals when required.',
  },
  {
    question: 'Does SYGEPEC guarantee visa approval or job placement?',
    answer:
      'No. SYGEPEC does not guarantee visa approval, job placement or legal outcomes. The platform improves organization, visibility and preparation quality.',
  },
  {
    question: 'Can I use SYGEPEC before I choose a destination?',
    answer:
      'Yes. The assessment is designed to compare route fit and show which documents, language tests and career steps may matter before you commit.',
  },
  {
    question: 'Can agencies or consultants use SYGEPEC?',
    answer:
      'Yes. SYGEPEC is being structured for tenant-based agency and partner workflows with client portfolios, document review, tasks and admin visibility.',
  },
  {
    question: 'Are my documents stored securely?',
    answer:
      'SYGEPEC uses Firebase Auth, Firestore rules and Storage rules to separate access by user, role and tenant. Sensitive workflows still require careful operational review and production hardening.',
  },
];
