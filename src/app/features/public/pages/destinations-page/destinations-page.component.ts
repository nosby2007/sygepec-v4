import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PUBLIC_DESTINATIONS } from '../../data/destinations.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { DestinationCardComponent } from '../../components/destination-card/destination-card.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-destinations-page',
  standalone: true,
  imports: [CommonModule, PublicHeroComponent, PublicSectionHeaderComponent, DestinationCardComponent, CtaSectionComponent],
  template: `
    <app-public-hero
      eyebrow="Destination intelligence"
      title="Compare pathways before you commit."
      description="SYGEPEC helps candidates compare destination requirements, document readiness, language planning and career alignment before spending time and money on the wrong route."
      [primaryCta]="{ label: 'Start your assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Explore profiles', url: '/public/profiles' }"
      visualLabel="Destination map"
      [visualTags]="['Canada', 'USA', 'UK', 'UAE']"
      imageUrl="/assets/marketing/sygepec-destinations-global.png"
      imageAlt="Abstract global destination map for SYGEPEC pathway planning"
      [compact]="true"
    />

    <section class="pub-section pub-section--white">
      <div class="sy-public-container">
        <app-public-section-header
          eyebrow="Prepared hubs"
          title="Country pages built for practical readiness."
          description="Each destination has a different sequence of documents, language evidence, licensing, funds and timing. These hubs prepare the deeper Lot 4 pages without forcing a generic template."
        />
        <div class="pub-grid">
          <app-destination-card *ngFor="let destination of destinations" [destination]="destination" />
        </div>
      </div>
    </section>

    <app-cta-section
      eyebrow="Not sure where to go?"
      title="Let the assessment compare your realistic options."
      description="Start with your profile, not assumptions. SYGEPEC turns your background into a clearer route, document and next-action picture."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Talk to SYGEPEC', url: '/public/contact' }"
    />
  `,
})
export class DestinationsPageComponent {
  readonly destinations = PUBLIC_DESTINATIONS;
}
