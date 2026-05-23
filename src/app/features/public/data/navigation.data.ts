import { PUBLIC_DESTINATIONS } from './destinations.data';
import { PUBLIC_PROFILES } from './profiles.data';
import { PUBLIC_SERVICES } from './services.data';
import type { PublicNavigationGroup } from '../models/public-content.model';

export const PUBLIC_NAVIGATION: PublicNavigationGroup[] = [
  {
    label: 'Destinations',
    url: '/public/destinations',
    description: 'Compare country pathways before committing resources.',
    items: PUBLIC_DESTINATIONS.map((destination) => ({
      label: destination.title,
      slug: destination.slug,
      url: `/public/destinations/${destination.slug}`,
      description: destination.eyebrow,
      iconKey: destination.iconKey,
    })),
  },
  {
    label: 'Profiles',
    url: '/public/profiles',
    description: 'Guidance by candidate segment.',
    items: PUBLIC_PROFILES.map((profile) => ({
      label: profile.title,
      slug: profile.slug,
      url: `/public/profiles/${profile.slug}`,
      description: profile.eyebrow,
      iconKey: profile.iconKey,
    })),
  },
  {
    label: 'Services',
    url: '/public/services',
    description: 'Preparation, review, jobs and coaching services.',
    items: PUBLIC_SERVICES.slice(0, 6).map((service) => ({
      label: service.title,
      slug: service.slug,
      url: `/public/services/${service.slug}`,
      description: service.eyebrow,
      iconKey: service.iconKey,
    })),
  },
];
