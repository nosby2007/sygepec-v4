import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PUBLIC_FAQS } from '../../data/faq.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { FaqAccordionComponent } from '../../components/faq-accordion/faq-accordion.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-faq-page',
  standalone: true,
  imports: [CommonModule, PublicHeroComponent, FaqAccordionComponent, CtaSectionComponent],
  template: `
    <app-public-hero
      eyebrow="FAQ"
      title="Clear answers before you start."
      description="Understand what SYGEPEC does, what it does not promise, and how preparation workflows connect to immigration, jobs and document review."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Contact SYGEPEC', url: '/public/contact' }"
      visualLabel="Trust center"
      [visualTags]="['Security', 'Legal', 'Jobs', 'Agencies']"
      imageUrl="/assets/marketing/sygepec-hero-global.png"
      imageAlt="SYGEPEC secure global platform visual"
      [compact]="true"
    />
    <section class="pub-section pub-section--white">
      <div class="sy-public-container">
        <app-faq-accordion [items]="faqs" />
      </div>
    </section>
    <app-cta-section
      title="Ready to turn answers into a dossier?"
      description="Start with an assessment and build a clearer picture of your route, documents and next actions."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Explore services', url: '/public/services' }"
    />
  `,
})
export class FaqPageComponent {
  readonly faqs = PUBLIC_FAQS;
}
