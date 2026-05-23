import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PUBLIC_PRICING_PLANS } from '../../data/pricing.data';
import { PUBLIC_FAQS } from '../../data/faq.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { PricingPreviewComponent } from '../../components/pricing-preview/pricing-preview.component';
import { FaqAccordionComponent } from '../../components/faq-accordion/faq-accordion.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-pricing-page',
  standalone: true,
  imports: [CommonModule, PublicHeroComponent, PublicSectionHeaderComponent, PricingPreviewComponent, FaqAccordionComponent, CtaSectionComponent],
  template: `
    <app-public-hero
      eyebrow="SaaS pricing foundation"
      title="Clear plans for candidates and partners."
      description="Pricing is structured for the future payment layer without overpromising today. Start free, request premium support, or discuss an agency workspace."
      [primaryCta]="{ label: 'Start free assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Contact sales', url: '/public/contact' }"
      visualLabel="Plan matrix"
      [visualTags]="['Starter', 'Premium', 'Support', 'Agency']"
      imageUrl="/assets/marketing/sygepec-services-workflow.png"
      imageAlt="SYGEPEC premium plans and service workflow visual"
      [compact]="true"
    />
    <section class="pub-section pub-section--white">
      <div class="sy-public-container">
        <app-public-section-header
          eyebrow="Plans"
          title="Prepared for payment readiness."
          description="The structure is ready for future checkout and service requests while keeping current claims honest and operationally safe."
        />
        <app-pricing-preview [plans]="plans" />
      </div>
    </section>
    <section class="pub-section">
      <div class="sy-public-container pub-grid-2">
        <app-public-section-header
          align="left"
          eyebrow="Pricing FAQ"
          title="What to know before paying."
          description="SYGEPEC separates preparation, support and regulated advice so candidates understand what the platform can and cannot promise."
        />
        <app-faq-accordion [items]="faqs" />
      </div>
    </section>
    <app-cta-section
      title="Start with clarity before choosing a paid service."
      description="The assessment helps you understand your profile, route and document gaps before requesting premium follow-up."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Ask a pricing question', url: '/public/contact' }"
    />
  `,
})
export class PricingPageComponent {
  readonly plans = PUBLIC_PRICING_PLANS;
  readonly faqs = PUBLIC_FAQS;
}
