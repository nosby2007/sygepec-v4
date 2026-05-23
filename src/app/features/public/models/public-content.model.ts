export interface PublicCta {
  label: string;
  url: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface PublicStat {
  value: string;
  label: string;
  description?: string;
}

export interface PublicFaqItem {
  question: string;
  answer: string;
}

export interface PublicNavigationGroup {
  label: string;
  url: string;
  description?: string;
  items?: PublicNavigationItem[];
}

export interface PublicNavigationItem {
  label: string;
  slug?: string;
  url: string;
  description: string;
  iconKey?: string;
}

export interface PublicMarketingItem {
  title: string;
  slug: string;
  eyebrow: string;
  headline: string;
  description: string;
  benefits: string[];
  cta: PublicCta;
  iconKey: string;
  tags: string[];
  stats?: PublicStat[];
  faq?: PublicFaqItem[];
}

export interface PublicDestination extends PublicMarketingItem {
  countryCode: string;
  pathways: string[];
  documents: string[];
  readinessSignals: string[];
  disclaimer: string;
}

export interface PublicProfileSegment extends PublicMarketingItem {
  commonMistakes: string[];
  recommendedServices: string[];
  journeySteps: string[];
}

export interface PublicService extends PublicMarketingItem {
  forWho: string;
  includes: string[];
  expectedOutcome: string;
}

export interface PublicPricingPlan {
  name: string;
  slug: string;
  price: string;
  description: string;
  audience: string;
  cta: PublicCta;
  features: string[];
  highlighted?: boolean;
}

export interface PublicFeature {
  title: string;
  description: string;
  iconKey: string;
}

export interface PublicTimelineStep {
  step: string;
  title: string;
  description: string;
}
