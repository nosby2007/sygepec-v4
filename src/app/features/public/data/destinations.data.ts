import type { PublicDestination } from '../models/public-content.model';

const destinationDisclaimer =
  'SYGEPEC helps organize, prepare and track immigration and career workflows. It does not replace official authorities, licensed consultants or immigration lawyers where required.';

export const PUBLIC_DESTINATIONS: PublicDestination[] = [
  {
    title: 'Canada',
    slug: 'canada',
    countryCode: 'CA',
    eyebrow: 'Express Entry, study and skilled work readiness',
    headline: 'Prepare a Canada-ready file before you spend on submissions.',
    description:
      'Structure language results, ECA, proof of funds, work history and document timing for Canadian study, skilled worker and permanent residence pathways.',
    benefits: [
      'Clarify whether your profile fits study, work, provincial or Express Entry planning.',
      'Track ECA, language test, funds, passport and employment letters in one dossier.',
      'Spot missing evidence before a human review or official submission.',
    ],
    cta: { label: 'Start Canada assessment', url: '/start-audit', variant: 'primary' },
    iconKey: 'maple',
    tags: ['Express Entry', 'ECA', 'IELTS/TEF', 'Proof of funds'],
    pathways: ['Express Entry preparation', 'Provincial program readiness', 'Study-to-work planning', 'Skilled worker file organization'],
    documents: ['Passport', 'Language test', 'ECA report', 'Proof of funds', 'Employment letters', 'Diplomas and transcripts'],
    readinessSignals: ['Language score status', 'Funds evidence quality', 'Credential evaluation progress', 'Work history consistency'],
    stats: [
      { value: '6+', label: 'Core document groups' },
      { value: '100%', label: 'Readiness visibility' },
    ],
    faq: [
      {
        question: 'Does SYGEPEC guarantee Canadian immigration approval?',
        answer: 'No. SYGEPEC helps you organize and review your preparation. Decisions remain with official authorities and licensed professionals where required.',
      },
    ],
    disclaimer: destinationDisclaimer,
  },
  {
    title: 'USA',
    slug: 'usa',
    countryCode: 'US',
    eyebrow: 'Study, employment, sponsorship and licensing support',
    headline: 'Bring structure to complex US study, work and sponsorship planning.',
    description:
      'Organize education records, employer documents, licensing evidence and visa-related materials before approaching schools, employers or advisors.',
    benefits: [
      'Map your route around study, employer sponsorship, healthcare licensing or professional relocation.',
      'Prepare resume, credentials and evidence for opportunity-driven pathways.',
      'Keep application material aligned with your immigration dossier.',
    ],
    cta: { label: 'Build my USA file', url: '/start-audit', variant: 'primary' },
    iconKey: 'skyline',
    tags: ['Sponsorship', 'Nursing', 'Study', 'Credential review'],
    pathways: ['Employer-sponsored preparation', 'Student file readiness', 'Nursing pathway organization', 'Professional relocation planning'],
    documents: ['Passport', 'Diplomas', 'Transcripts', 'Resume', 'Licensing evidence', 'Employer letters'],
    readinessSignals: ['Sponsor readiness', 'Credential completeness', 'Resume quality', 'Licensing document status'],
    disclaimer: destinationDisclaimer,
  },
  {
    title: 'United Kingdom',
    slug: 'uk',
    countryCode: 'UK',
    eyebrow: 'Skilled Worker, healthcare and study readiness',
    headline: 'Prepare for UK pathways with clean documentation and job-readiness.',
    description:
      'Track sponsorship evidence, English test planning, healthcare credentials and core identity documents for UK skilled worker, study and healthcare routes.',
    benefits: [
      'Connect job-readiness with visa document preparation.',
      'Track IELTS/OET, professional credentials and sponsor-related tasks.',
      'Prepare a dossier that is easier for reviewers and advisors to understand.',
    ],
    cta: { label: 'Check UK readiness', url: '/start-audit', variant: 'primary' },
    iconKey: 'bridge',
    tags: ['Skilled Worker', 'Healthcare', 'IELTS/OET', 'Sponsorship'],
    pathways: ['Skilled Worker planning', 'Healthcare worker preparation', 'Student route organization', 'Family relocation checklist'],
    documents: ['Passport', 'English test', 'Certificate of sponsorship evidence', 'Credentials', 'CV', 'Family documents'],
    readinessSignals: ['English readiness', 'Sponsor evidence', 'Role fit', 'Document validity'],
    disclaimer: destinationDisclaimer,
  },
  {
    title: 'UAE',
    slug: 'uae',
    countryCode: 'AE',
    eyebrow: 'Employment, attestation and licensing readiness',
    headline: 'Prepare UAE career relocation with document attestation visibility.',
    description:
      'Organize professional records, attestation needs, licensing steps and relocation preparation for UAE employment and regulated professions.',
    benefits: [
      'Understand attestation, credential and licensing dependencies early.',
      'Prepare documents for employer screening and relocation logistics.',
      'Track what is missing before travel planning begins.',
    ],
    cta: { label: 'Plan UAE relocation', url: '/start-audit', variant: 'primary' },
    iconKey: 'tower',
    tags: ['DHA/DOH', 'Attestation', 'Employment', 'Relocation'],
    pathways: ['Healthcare licensing support', 'Employment document readiness', 'Credential attestation planning', 'Arrival checklist'],
    documents: ['Passport', 'Diploma', 'License', 'Experience letters', 'Attested documents', 'CV'],
    readinessSignals: ['Attestation status', 'License evidence', 'Employer material', 'Travel readiness'],
    disclaimer: destinationDisclaimer,
  },
  {
    title: 'Europe',
    slug: 'europe',
    countryCode: 'EU',
    eyebrow: 'Study, work and mobility comparison',
    headline: 'Compare European options before committing to the wrong route.',
    description:
      'Use a profile-first approach to compare study, work, family and skilled mobility options across European destinations with cleaner document planning.',
    benefits: [
      'Compare destination fit instead of guessing based on social media advice.',
      'Centralize education, work and family documents for route planning.',
      'Prepare a dossier that can adapt when requirements differ by country.',
    ],
    cta: { label: 'Compare Europe routes', url: '/start-audit', variant: 'primary' },
    iconKey: 'eu',
    tags: ['Study', 'Work', 'Mobility', 'Family'],
    pathways: ['Study route comparison', 'Work permit preparation', 'Family mobility planning', 'Professional document readiness'],
    documents: ['Passport', 'Diplomas', 'Transcripts', 'Financial evidence', 'Accommodation evidence', 'Civil status documents'],
    readinessSignals: ['Destination fit', 'Financial preparation', 'Document translations', 'Timeline clarity'],
    disclaimer: destinationDisclaimer,
  },
  {
    title: 'Australia',
    slug: 'australia',
    countryCode: 'AU',
    eyebrow: 'Skills assessment, English and points-readiness',
    headline: 'Build an Australia-ready profile with skills and document discipline.',
    description:
      'Prepare skills assessment material, English testing, work evidence and family documentation for Australian skilled, study and career pathways.',
    benefits: [
      'Track skills assessment dependencies before you rush into applications.',
      'Connect English readiness, work history and education evidence.',
      'Keep family and settlement planning visible from the beginning.',
    ],
    cta: { label: 'Check Australia readiness', url: '/start-audit', variant: 'primary' },
    iconKey: 'coast',
    tags: ['Skills assessment', 'English', 'Points', 'Skilled work'],
    pathways: ['Skilled migration preparation', 'Study pathway organization', 'Professional evidence review', 'Family relocation planning'],
    documents: ['Passport', 'Skills evidence', 'English test', 'Employment references', 'Education records', 'Family documents'],
    readinessSignals: ['Skills evidence completeness', 'English test plan', 'Employment proof quality', 'Family file readiness'],
    disclaimer: destinationDisclaimer,
  },
];

export function findDestination(slug: string | null): PublicDestination | undefined {
  return PUBLIC_DESTINATIONS.find((destination) => destination.slug === slug);
}
