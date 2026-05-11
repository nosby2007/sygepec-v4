import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

interface ContentBlock {
  title: string;
  description: string;
  bullets: string[];
}

const DESTINATIONS: Record<string, ContentBlock> = {
  canada: {
    title: 'Canada pathway',
    description: 'Study, work, permanent residence and regulated-profession routes require strong audit preparation, document sequencing and language readiness.',
    bullets: ['Express Entry and provincial planning', 'Language and proof-of-funds readiness', 'Professional licensing and human review'],
  },
  usa: {
    title: 'USA pathway',
    description: 'US routes often depend on employer sponsorship, education pathway or licensing documentation. SYGEPEC focuses on readiness and administrative clarity first.',
    bullets: ['Licensing preparation for regulated professions', 'Employer-sponsored pathway preparation', 'Document alignment and timeline clarity'],
  },
  uae: {
    title: 'UAE pathway',
    description: 'UAE relocation requires document validation, professional readiness and strong relocation planning before travel preparation starts.',
    bullets: ['Credential and employment document preparation', 'Licensing roadmap readiness', 'Travel and accommodation support planning'],
  },
  qatar: {
    title: 'Qatar pathway',
    description: 'Qatar pathway planning needs document compliance, employment proof and relocation structure to reduce delays and missing requirements.',
    bullets: ['Employment-route documentation', 'Administrative compliance screening', 'Travel and first-arrival preparation'],
  },
  europe: {
    title: 'Europe pathway',
    description: 'Europe includes multiple destination rules. SYGEPEC helps compare requirements and identify the cleanest route based on the user profile.',
    bullets: ['Study and work route comparison', 'Destination-country profile fit', 'Document and training readiness'],
  },
  unknown: {
    title: 'Not sure yet',
    description: 'If the destination is not fixed yet, SYGEPEC uses the audit to narrow realistic pathway options before time and money are wasted.',
    bullets: ['Profile-first destination selection', 'Missing-document visibility', 'Training and readiness prioritisation'],
  },
};

const SERVICES: Record<string, ContentBlock> = {
  'document-review': {
    title: 'Document review and compliance screening',
    description: 'SYGEPEC pre-screens core immigration documents, flags missing items and routes the file to a human reviewer before final acceptance.',
    bullets: ['Missing-page and readability alerts', 'Translation and notarisation visibility', 'Human review remains mandatory'],
  },
  'travel-readiness': {
    title: 'Travel readiness operations',
    description: 'Once the case is ready, SYGEPEC tracks passport, visa, flight, accommodation, insurance and arrival readiness through one structured view.',
    bullets: ['Weighted readiness score', 'Flight and accommodation request workflow', 'Arrival planning and admin follow-up'],
  },
  'training-pathway': {
    title: 'Training pathway recommendations',
    description: 'When the audit reveals a gap, SYGEPEC recommends the right training pathway instead of sending users into the wrong procedure too early.',
    bullets: ['Language readiness recommendations', 'Licensing and profession-based referrals', 'Innovacare Training integration-ready flow'],
  },
};

@Component({
  standalone: true,
  selector: 'app-public-info-page',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="sy-public-page">
      <section class="sy-public-hero">
        <div class="sy-container sy-public-hero__inner">
          <div>
            <p class="eyebrow">SYGEPEC pathway intelligence</p>
            <h1>{{ pageTitle() }}</h1>
            <p class="intro">{{ pageDescription() }}</p>
            <div class="hero-actions">
              <a routerLink="/start-audit" class="sy-btn-gold">Start My Immigration Audit</a>
              <a routerLink="/public/contact" class="sy-btn-secondary">Talk to an Advisor</a>
            </div>
          </div>
          <article class="hero-card sy-card-premium">
            <div class="hero-card__head">
              <span class="sy-status-pill info">AI-assisted</span>
              <span class="sy-status-pill warning">Human review required</span>
            </div>
            <h2>{{ content().title }}</h2>
            <p>{{ content().description }}</p>
            <ul>
              <li *ngFor="let bullet of content().bullets">{{ bullet }}</li>
            </ul>
          </article>
        </div>
      </section>

      <section class="sy-container sy-public-grid">
        <article class="sy-card" *ngIf="isHubPage()">
          <div class="sy-section-title"><h2>Popular destination pathways</h2></div>
          <div class="cards-grid">
            <a *ngFor="let entry of destinationEntries" class="info-card" [routerLink]="['/public/destinations', entry.slug]">
              <strong>{{ entry.block.title }}</strong>
              <p>{{ entry.block.description }}</p>
            </a>
          </div>
        </article>

        <article class="sy-card" *ngIf="isContactPage()">
          <div class="sy-section-title"><h2>Contact and advisory workflow</h2></div>
          <div class="contact-grid">
            <div class="contact-card">
              <strong>Audit-first onboarding</strong>
              <p>Start with the structured personal audit so an advisor receives a usable profile rather than scattered messages.</p>
            </div>
            <div class="contact-card">
              <strong>Human review</strong>
              <p>SYGEPEC advisors validate sensitive document and pathway decisions before any final step is taken.</p>
            </div>
            <div class="contact-card">
              <strong>Travel operations support</strong>
              <p>Flight and accommodation requests remain manual in MVP to keep confirmations controlled and traceable.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  `,
  styles: [`
    .sy-public-page { background: var(--sy-bg); min-height: 100vh; }
    .sy-public-hero {
      padding: 5rem 0 3rem;
      background:
        radial-gradient(circle at 85% 10%, rgba(245,184,65,.14), transparent 22%),
        radial-gradient(circle at 0% 100%, rgba(20,184,166,.12), transparent 28%),
        linear-gradient(145deg, #0b1f3a, #123c69 58%, #1e63d6);
      color: #fff;
    }
    .sy-public-hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr);
      gap: 1.5rem;
      align-items: start;
    }
    .eyebrow { margin: 0 0 .75rem; text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; color: rgba(245,184,65,.92); font-weight: 700; }
    h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.2rem); line-height: 1.08; }
    .intro { margin: 1rem 0 0; font-size: 1rem; line-height: 1.7; color: rgba(230,239,255,.88); max-width: 64ch; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
    .hero-card { background: rgba(255,255,255,.98); }
    .hero-card__head { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: .75rem; }
    .hero-card h2 { margin: 0; color: var(--sy-text); font-size: 1.25rem; }
    .hero-card p { color: var(--sy-muted); line-height: 1.65; }
    .hero-card ul { margin: 0; padding-left: 1.1rem; display: grid; gap: .55rem; color: var(--sy-text); }
    .sy-public-grid { display: grid; gap: 1.25rem; padding: 2rem 0 3rem; }
    .cards-grid, .contact-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
    .info-card, .contact-card {
      display: grid;
      gap: .6rem;
      padding: 1rem;
      border-radius: 18px;
      border: 1px solid rgba(16,32,51,.08);
      background: #fff;
      text-decoration: none;
      color: inherit;
      box-shadow: 0 4px 12px rgba(10,22,40,.06);
    }
    .info-card strong, .contact-card strong { color: #0b1f3a; font-size: .98rem; }
    .info-card p, .contact-card p { margin: 0; color: var(--sy-muted); line-height: 1.6; font-size: .9rem; }
    @media (max-width: 980px) {
      .sy-public-hero__inner, .cards-grid, .contact-grid { grid-template-columns: 1fr; }
      .sy-public-hero { padding-top: 4.25rem; }
    }
  `],
})
export class PublicInfoPageComponent {
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private meta = inject(Meta);

  readonly slug = computed(() => this.route.snapshot.paramMap.get('slug'));
  readonly pageKind = computed(() => this.route.snapshot.data['pageKind'] as string);
  readonly content = computed(() => {
    const slug = this.slug();
    if (this.pageKind() === 'destination-detail' && slug) return DESTINATIONS[slug] ?? DESTINATIONS['unknown'];
    if (this.pageKind() === 'service-detail' && slug) return SERVICES[slug] ?? SERVICES['document-review'];
    if (this.pageKind() === 'destinations') {
      return {
        title: 'Compare destination pathways before you commit',
        description: 'Every destination demands a different sequence of documents, training, readiness checks and human review. SYGEPEC structures that comparison early.',
        bullets: ['Destination comparison before procedural spend', 'Audit-led pathway prioritisation', 'Travel and document readiness tied to the same case'],
      };
    }
    return {
      title: 'Talk to SYGEPEC',
      description: 'Use the audit first, then bring a structured profile to a human advisor for review, corrections and controlled next steps.',
      bullets: ['Audit first, advisor second', 'Human review for critical decisions', 'Manual travel support where needed'],
    };
  });

  readonly destinationEntries = Object.entries(DESTINATIONS).map(([slug, block]) => ({ slug, block }));
  readonly pageTitle = computed(() => this.route.snapshot.data['title'] || this.content().title);
  readonly pageDescription = computed(() => this.route.snapshot.data['description'] || this.content().description);

  constructor() {
    const title = this.route.snapshot.data['title'] || 'SYGEPEC pathway information';
    const description = this.route.snapshot.data['description'] || 'SYGEPEC destination and service information pages for immigration readiness.';
    this.title.setTitle(`SYGEPEC | ${title}`);
    this.meta.updateTag({ name: 'description', content: description });
  }

  isHubPage(): boolean {
    return this.pageKind() === 'destinations';
  }

  isContactPage(): boolean {
    return this.pageKind() === 'contact';
  }
}
