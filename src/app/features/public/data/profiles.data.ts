import type { PublicProfileSegment } from '../models/public-content.model';

export const PUBLIC_PROFILES: PublicProfileSegment[] = [
  {
    title: 'Nurses',
    slug: 'nurses',
    eyebrow: 'Licensing, English tests and career relocation',
    headline: 'Move from scattered nursing requirements to a tracked licensing pathway.',
    description:
      'SYGEPEC helps nurses organize credentials, English tests, licensing documents, employer material and visa-readiness in one structured dossier.',
    benefits: ['Track license, transcript and work letters.', 'Prepare IELTS/OET, NCLEX or destination-specific steps.', 'Connect job readiness with visa documentation.'],
    cta: { label: 'Start nurse assessment', url: '/start-audit', variant: 'primary' },
    iconKey: 'nurse',
    tags: ['Licensing', 'IELTS/OET', 'NCLEX', 'Healthcare jobs'],
    commonMistakes: ['Starting job applications before credential files are complete.', 'Ignoring expiration dates on police clearances and language tests.', 'Using a local CV format for international healthcare employers.'],
    recommendedServices: ['Document Checklist', 'Case Review', 'Interview Coaching', 'Job Application Support'],
    journeySteps: ['Profile audit', 'Credential inventory', 'Language and licensing plan', 'Job-ready dossier', 'Human review'],
  },
  {
    title: 'IT Professionals',
    slug: 'it-professionals',
    eyebrow: 'CV, portfolio and relocation document readiness',
    headline: 'Turn your technical experience into an international opportunity file.',
    description:
      'SYGEPEC helps IT professionals align CV, portfolio, work evidence, certifications and relocation documents for global job and visa pathways.',
    benefits: ['Build an international CV and evidence trail.', 'Track certifications, references and portfolio proof.', 'Connect job applications with destination requirements.'],
    cta: { label: 'Prepare my IT pathway', url: '/start-audit', variant: 'primary' },
    iconKey: 'code',
    tags: ['CV', 'Portfolio', 'Sponsorship', 'Remote-ready'],
    commonMistakes: ['Sending a CV without measurable project outcomes.', 'Missing reference letters or proof of employment scope.', 'Separating job search from immigration readiness.'],
    recommendedServices: ['CV International', 'Job Application Support', 'Interview Coaching', 'Case Review'],
    journeySteps: ['Experience mapping', 'CV and portfolio readiness', 'Destination fit', 'Application tracking', 'Relocation file'],
  },
  {
    title: 'Students',
    slug: 'students',
    eyebrow: 'School, budget and study permit preparation',
    headline: 'Prepare a study pathway with documents, budget and timelines under control.',
    description:
      'SYGEPEC helps students organize academic records, proof of funds, destination selection, language planning and post-study career preparation.',
    benefits: ['Track admissions and visa documents together.', 'Understand budget and proof-of-funds gaps.', 'Prepare for study-to-work transitions early.'],
    cta: { label: 'Plan my study route', url: '/start-audit', variant: 'primary' },
    iconKey: 'student',
    tags: ['Study permit', 'Budget', 'Admissions', 'Language'],
    commonMistakes: ['Applying without a realistic funding file.', 'Missing translated transcripts or academic evidence.', 'Choosing a program without career or immigration fit.'],
    recommendedServices: ['Immigration File Setup', 'IELTS/TEF Orientation', 'Document Checklist', 'Case Review'],
    journeySteps: ['Academic profile', 'Destination and program fit', 'Document checklist', 'Budget readiness', 'Submission preparation'],
  },
  {
    title: 'Skilled Workers',
    slug: 'skilled-workers',
    eyebrow: 'Work history, credentials and visa documentation',
    headline: 'Make your skilled worker profile easier to review and stronger to present.',
    description:
      'SYGEPEC structures employment history, education evidence, language readiness and destination fit for skilled worker pathways.',
    benefits: ['Clarify work evidence and references.', 'Track education, language and funds requirements.', 'Prioritize the route most aligned with your profile.'],
    cta: { label: 'Assess skilled worker fit', url: '/start-audit', variant: 'primary' },
    iconKey: 'briefcase',
    tags: ['Work permit', 'References', 'Language', 'Readiness score'],
    commonMistakes: ['Unclear employment letters.', 'No timeline between work history and education claims.', 'Choosing a destination before checking document feasibility.'],
    recommendedServices: ['Case Review', 'Document Checklist', 'CV International', 'Premium Case Follow-up'],
    journeySteps: ['Profile scoring', 'Evidence cleanup', 'Destination comparison', 'Document review', 'Next action plan'],
  },
  {
    title: 'Families',
    slug: 'families',
    eyebrow: 'Accompanying members and relocation planning',
    headline: 'Plan immigration as a family file, not isolated documents.',
    description:
      'SYGEPEC helps families track civil status documents, dependents, school planning, budget, travel readiness and shared timelines.',
    benefits: ['See every family member document requirement.', 'Track civil status, passports and dependent details.', 'Prepare relocation steps after the file is ready.'],
    cta: { label: 'Plan family relocation', url: '/start-audit', variant: 'primary' },
    iconKey: 'family',
    tags: ['Dependents', 'Civil status', 'Budget', 'Relocation'],
    commonMistakes: ['Treating dependents as an afterthought.', 'Missing marriage, birth or custody documents.', 'Planning travel before approval and document readiness.'],
    recommendedServices: ['Family Relocation Planning', 'Document Checklist', 'Premium Case Follow-up', 'Case Review'],
    journeySteps: ['Family profile', 'Member-by-member checklist', 'Budget and travel history', 'Document review', 'Relocation readiness'],
  },
  {
    title: 'Agencies / Consultants',
    slug: 'agencies',
    eyebrow: 'Partner dashboard and organized client intake',
    headline: 'Give your clients a cleaner intake, document and follow-up experience.',
    description:
      'SYGEPEC prepares agencies and consultants for a tenant-based workflow with client dossiers, document tracking, tasks and operational visibility.',
    benefits: ['Standardize intake and document review.', 'Track client tasks and statuses across a portfolio.', 'Prepare for agency dashboards and partner workflows.'],
    cta: { label: 'Discuss agency access', url: '/public/contact', variant: 'primary' },
    iconKey: 'agency',
    tags: ['Tenant dashboard', 'Client pipeline', 'Document review', 'Operations'],
    commonMistakes: ['Collecting documents in messages and email threads.', 'No clear status visibility for clients.', 'Mixing admin notes with client-facing updates.'],
    recommendedServices: ['Agency Dashboard Option', 'Premium Case Follow-up', 'Case Review', 'Document Checklist'],
    journeySteps: ['Partner discovery', 'Workflow mapping', 'Tenant setup', 'Client onboarding', 'Operational review'],
  },
];

export function findProfile(slug: string | null): PublicProfileSegment | undefined {
  return PUBLIC_PROFILES.find((profile) => profile.slug === slug);
}
