import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { FeatureGridComponent } from '../../components/feature-grid/feature-grid.component';
import { ProcessTimelineComponent } from '../../components/process-timeline/process-timeline.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';
import { PUBLIC_FOUNDATION_FEATURES, PUBLIC_PROCESS_STEPS } from '../../data/public-home.data';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [CommonModule, PublicHeroComponent, PublicSectionHeaderComponent, FeatureGridComponent, ProcessTimelineComponent, CtaSectionComponent],
  template: `
    <app-public-hero
      eyebrow="About SYGEPEC"
      title="A calmer operating system for global mobility."
      description="SYGEPEC exists because candidates often navigate immigration, jobs, documents and training through disconnected messages, folders and advice. The platform brings structure, visibility and human review points to that journey."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Explore services', url: '/public/services' }"
      visualLabel="Mission system"
      [visualTags]="['Prepare', 'Track', 'Review', 'Advance']"
      imageUrl="/assets/marketing/sygepec-hero-global.png"
      imageAlt="SYGEPEC global immigration and career readiness platform visual"
      [compact]="true"
    />
    <section class="pub-section pub-section--white">
      <div class="sy-public-container">
        <app-public-section-header
          eyebrow="Why it exists"
          title="Better preparation reduces confusion."
          description="SYGEPEC does not promise outcomes. It helps people understand their readiness, organize the evidence, and communicate with advisors, employers or partners from a cleaner file."
        />
        <app-feature-grid [features]="features" />
      </div>
    </section>
    <section class="pub-section">
      <div class="sy-public-container">
        <app-public-section-header
          eyebrow="Operating model"
          title="Profile first, documents second, decisions carefully."
          description="The workflow is designed to protect users from rushing into expensive or sensitive steps before their case is structured."
        />
        <app-process-timeline [steps]="steps" />
      </div>
    </section>
    <app-cta-section
      title="Build your pathway with more structure."
      description="Start with assessment, then move toward a dossier, documents, coaching, jobs and review points."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Contact SYGEPEC', url: '/public/contact' }"
    />
  `,
})
export class AboutPageComponent {
  readonly features = PUBLIC_FOUNDATION_FEATURES;
  readonly steps = PUBLIC_PROCESS_STEPS;
}
