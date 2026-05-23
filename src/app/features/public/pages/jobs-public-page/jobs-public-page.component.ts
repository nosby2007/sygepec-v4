import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

const JOB_CARDS = [
  {
    title: 'Registered Nurse - International readiness',
    location: 'Canada / UK pathway preparation',
    tags: ['Healthcare', 'Visa support signal', 'IELTS/OET'],
    description: 'Prepare credentials, license evidence, CV and document readiness before approaching employers or partner recruiters.',
  },
  {
    title: 'Cloud Support Specialist',
    location: 'Europe / remote-aligned screening',
    tags: ['IT', 'Portfolio', 'Sponsorship possible'],
    description: 'Align CV, certifications, references and relocation documents with international technical job expectations.',
  },
  {
    title: 'Care Assistant / Healthcare Support',
    location: 'UK / UAE preparation',
    tags: ['Healthcare', 'Interview coaching', 'Document review'],
    description: 'Prepare identity, training, experience and interview material for healthcare support roles and relocation conversations.',
  },
];

@Component({
  selector: 'app-jobs-public-page',
  standalone: true,
  imports: [CommonModule, PublicHeroComponent, PublicSectionHeaderComponent, CtaSectionComponent],
  template: `
    <app-public-hero
      eyebrow="International opportunities"
      title="Find opportunities aligned with your profile."
      description="SYGEPEC connects job interest with immigration readiness, documents, CV quality and destination-specific preparation. Public jobs are a conversion layer; authenticated applications remain protected."
      [primaryCta]="{ label: 'Apply with SYGEPEC profile', url: '/auth/register' }"
      [secondaryCta]="{ label: 'Prepare my dossier first', url: '/start-audit' }"
      visualLabel="Opportunity board"
      [visualTags]="['Visa support', 'Healthcare', 'IT', 'Coaching']"
      imageUrl="/assets/marketing/sygepec-jobs-opportunities.png"
      imageAlt="International job opportunities connected to SYGEPEC dossier readiness"
      [compact]="true"
    />
    <section class="pub-section pub-section--white">
      <div class="sy-public-container">
        <app-public-section-header
          eyebrow="Preview board"
          title="Jobs and readiness belong together."
          description="These public cards prepare the future opportunity marketplace while making clear that candidates should apply with structured documents and a SYGEPEC profile."
        />
        <div class="pub-grid">
          <article class="pub-card" *ngFor="let job of jobs">
            <p class="pub-card__eyebrow">{{ job.location }}</p>
            <h3>{{ job.title }}</h3>
            <p>{{ job.description }}</p>
            <div class="pub-tags"><span *ngFor="let tag of job.tags">{{ tag }}</span></div>
          </article>
        </div>
      </div>
    </section>
    <app-cta-section
      title="Applications are stronger when the dossier is ready."
      description="Use your SYGEPEC assessment, CV, documents and readiness score to understand which opportunities are realistic and what must be fixed first."
      [primaryCta]="{ label: 'Start Assessment', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Sign in to jobs', url: '/auth/login' }"
    />
  `,
})
export class JobsPublicPageComponent {
  readonly jobs = JOB_CARDS;
}
