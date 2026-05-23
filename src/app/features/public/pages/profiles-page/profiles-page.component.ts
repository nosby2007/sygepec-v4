import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PUBLIC_PROFILES } from '../../data/profiles.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { ProfileCardComponent } from '../../components/profile-card/profile-card.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-profiles-page',
  standalone: true,
  imports: [CommonModule, PublicHeroComponent, PublicSectionHeaderComponent, ProfileCardComponent, CtaSectionComponent],
  template: `
    <app-public-hero
      eyebrow="Built around real candidate profiles"
      title="Different profiles need different workflows."
      description="A nurse, student, IT professional, family and agency do not need the same checklist. SYGEPEC prepares profile-specific pages for practical guidance and conversion."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'View services', url: '/public/services' }"
      visualLabel="Profile segments"
      [visualTags]="['Nurses', 'IT', 'Students', 'Agencies']"
      imageUrl="/assets/marketing/sygepec-profiles-candidates.png"
      imageAlt="Professional candidates using SYGEPEC profile readiness workflows"
      [compact]="true"
    />
    <section class="pub-section pub-section--white">
      <div class="sy-public-container">
        <app-public-section-header
          eyebrow="Candidate segments"
          title="Choose the guidance closest to your reality."
          description="These shells prepare the detailed Lot 5 pages with tailored documents, mistakes, services and next actions."
        />
        <div class="pub-grid">
          <app-profile-card *ngFor="let profile of profiles" [profile]="profile" />
        </div>
      </div>
    </section>
    <app-cta-section
      title="Your profile deserves more than a generic checklist."
      description="Start the assessment so SYGEPEC can connect your background to destinations, documents, jobs and coaching."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Contact SYGEPEC', url: '/public/contact' }"
    />
  `,
})
export class ProfilesPageComponent {
  readonly profiles = PUBLIC_PROFILES;
}
