import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PUBLIC_SERVICES } from '../../data/services.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { ServiceCardComponent } from '../../components/service-card/service-card.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-services-page',
  standalone: true,
  imports: [CommonModule, PublicHeroComponent, PublicSectionHeaderComponent, ServiceCardComponent, CtaSectionComponent],
  template: `
    <app-public-hero
      eyebrow="Preparation services"
      title="Services built around dossier readiness."
      description="SYGEPEC connects immigration file setup, document checklists, case review, CV support, job applications, language orientation, coaching and partner workflows."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'View pricing', url: '/public/pricing' }"
      visualLabel="Service suite"
      [visualTags]="['Files', 'Docs', 'Jobs', 'Coaching']"
      imageUrl="/assets/marketing/sygepec-services-workflow.png"
      imageAlt="SYGEPEC service workflow with secure documents and case review"
      [compact]="true"
    />
    <section class="pub-section pub-section--white">
      <div class="sy-public-container">
        <app-public-section-header
          eyebrow="Service catalog"
          title="A commercial foundation ready for Lot 6."
          description="Each service already includes audience, inclusions, expected outcome and a conversion path so future pricing and payments can be added without rewriting the public site."
        />
        <div class="pub-grid">
          <app-service-card *ngFor="let service of services" [service]="service" />
        </div>
      </div>
    </section>
    <app-cta-section
      title="Need help choosing the right service?"
      description="Start with the assessment or contact SYGEPEC with your destination, profile and urgency so the next step is clearer."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Contact SYGEPEC', url: '/public/contact' }"
    />
  `,
})
export class ServicesPageComponent {
  readonly services = PUBLIC_SERVICES;
}
