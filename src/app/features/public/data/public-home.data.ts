import type { PublicFeature, PublicStat, PublicTimelineStep } from '../models/public-content.model';

export const PUBLIC_TRUST_ITEMS = [
  'Secure account and dossier workflow',
  'Document readiness before submission',
  'Human review where decisions are sensitive',
  'Built for candidates, families and agencies',
];

export const PUBLIC_GLOBAL_STATS: PublicStat[] = [
  { value: '6', label: 'Destination hubs', description: 'Canada, USA, UK, UAE, Europe and Australia prepared for Lot 3.' },
  { value: '10', label: 'Service tracks', description: 'From file setup to agency dashboard readiness.' },
  { value: '4', label: 'Core workflows', description: 'Assessment, documents, jobs and coaching.' },
];

export const PUBLIC_FOUNDATION_FEATURES: PublicFeature[] = [
  {
    title: 'Pathway intelligence',
    description: 'Turn a vague immigration idea into a profile, destination and next-action structure.',
    iconKey: 'route',
  },
  {
    title: 'Document readiness',
    description: 'Track missing, uploaded, under-review, approved and rejected documents with clearer accountability.',
    iconKey: 'documents',
  },
  {
    title: 'Career alignment',
    description: 'Connect CV, job applications, licensing and destination requirements instead of treating them separately.',
    iconKey: 'career',
  },
  {
    title: 'Agency-ready operations',
    description: 'Support tenant-based workflows for agencies, consultants and partner organizations.',
    iconKey: 'tenant',
  },
];

export const PUBLIC_PROCESS_STEPS: PublicTimelineStep[] = [
  { step: '01', title: 'Assess', description: 'Create a secure profile and clarify destination, goal, urgency and risk signals.' },
  { step: '02', title: 'Organize', description: 'Build the case, checklist, document vault and next tasks around the selected pathway.' },
  { step: '03', title: 'Review', description: 'Prepare for human review, advisor handoff, employer conversations or official next steps.' },
  { step: '04', title: 'Advance', description: 'Track jobs, coaching, training, travel readiness and post-approval preparation.' },
];
