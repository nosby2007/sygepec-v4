import type { PublicPricingPlan } from '../models/public-content.model';

export const PUBLIC_PRICING_PLANS: PublicPricingPlan[] = [
  {
    name: 'Free / Starter',
    slug: 'starter',
    price: '$0',
    audience: 'For candidates exploring their first route.',
    description: 'Start with a profile assessment, basic readiness view and first pathway clarity.',
    cta: { label: 'Start free assessment', url: '/start-audit', variant: 'primary' },
    features: ['Profile assessment', 'Basic destination guidance', 'Initial document visibility', 'Secure account access'],
  },
  {
    name: 'Premium Candidate',
    slug: 'premium-candidate',
    price: 'Planned',
    audience: 'For candidates preparing a serious immigration or career file.',
    description: 'Add stronger document readiness, task visibility and premium follow-up structure.',
    cta: { label: 'Request premium access', url: '/public/contact', variant: 'primary' },
    features: ['Readiness score', 'Document checklist', 'Task follow-up', 'Training and job readiness signals', 'Priority support inquiry'],
    highlighted: true,
  },
  {
    name: 'Professional Support',
    slug: 'professional-support',
    price: 'Custom',
    audience: 'For candidates needing human review or coaching.',
    description: 'Request structured support for case review, CV, interviews, documents or family planning.',
    cta: { label: 'Talk to SYGEPEC', url: '/public/contact', variant: 'secondary' },
    features: ['Case review workflow', 'CV and interview support', 'Document review notes', 'Family relocation planning'],
  },
  {
    name: 'Agency / Partner',
    slug: 'agency-partner',
    price: 'Custom',
    audience: 'For agencies, consultants and partner organizations.',
    description: 'Prepare tenant-based operations for client intake, document tracking and admin workflows.',
    cta: { label: 'Discuss partnership', url: '/public/contact', variant: 'secondary' },
    features: ['Tenant workspace planning', 'Client portfolio visibility', 'Admin roles', 'Agency dashboard option'],
  },
];
