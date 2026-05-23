import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { findDestination, PUBLIC_DESTINATIONS } from '../../data/destinations.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { FaqAccordionComponent } from '../../components/faq-accordion/faq-accordion.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-destination-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicHeroComponent, PublicSectionHeaderComponent, FaqAccordionComponent, CtaSectionComponent],
  template: `
    <ng-container *ngIf="destination() as item; else missing">
      <app-public-hero
        [eyebrow]="item.eyebrow"
        [title]="item.headline"
        [description]="item.description"
        [primaryCta]="item.cta"
        [secondaryCta]="{ label: 'Compare destinations', url: '/public/destinations' }"
        [visualLabel]="item.title + ' readiness'"
        [visualTags]="item.tags"
        imageUrl="/assets/marketing/sygepec-destinations-global.png"
        [imageAlt]="item.title + ' immigration readiness visual'"
        [compact]="true"
      />

      <section class="pub-section pub-section--white">
        <div class="sy-public-container pub-grid-3">
          <article>
            <app-public-section-header align="left" eyebrow="Pathways" title="Common planning routes" />
            <ul class="pub-detail-list"><li *ngFor="let row of item.pathways">{{ row }}</li></ul>
          </article>
          <article>
            <app-public-section-header align="left" eyebrow="Documents" title="Often needed evidence" />
            <ul class="pub-detail-list"><li *ngFor="let row of item.documents">{{ row }}</li></ul>
          </article>
          <article>
            <app-public-section-header align="left" eyebrow="Readiness" title="Signals SYGEPEC tracks" />
            <ul class="pub-detail-list"><li *ngFor="let row of item.readinessSignals">{{ row }}</li></ul>
          </article>
        </div>
      </section>

      <section class="pub-section">
        <div class="sy-public-container pub-grid-2">
          <article class="pub-card">
            <p class="pub-card__eyebrow">How SYGEPEC helps</p>
            <h3>Preparation before pressure</h3>
            <p *ngFor="let benefit of item.benefits">{{ benefit }}</p>
          </article>
          <article>
            <app-public-section-header align="left" eyebrow="FAQ" title="Destination questions" />
            <app-faq-accordion [items]="item.faq || []" />
          </article>
        </div>
      </section>

      <section class="pub-section pub-section--white">
        <div class="sy-public-container">
          <p class="sy-muted">{{ item.disclaimer }}</p>
        </div>
      </section>

      <app-cta-section
        eyebrow="Create a dossier"
        [title]="'Prepare your ' + item.title + ' file with structure.'"
        description="Start with assessment, then use SYGEPEC to organize profile data, documents, tasks and review readiness."
        [primaryCta]="item.cta"
        [secondaryCta]="{ label: 'Contact support', url: '/public/contact' }"
      />
    </ng-container>

    <ng-template #missing>
      <section class="pub-section pub-section--white">
        <div class="sy-public-container">
          <app-public-section-header
            eyebrow="Destination not found"
            title="Choose a prepared destination hub."
            description="The requested destination is not available yet. You can compare the prepared hubs or start an assessment without choosing a final country."
          />
          <div class="pub-grid">
            <a class="pub-card" *ngFor="let item of destinations" [routerLink]="['/public/destinations', item.slug]">
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </a>
          </div>
        </div>
      </section>
    </ng-template>
  `,
})
export class DestinationDetailPageComponent {
  private route = inject(ActivatedRoute);
  readonly destinations = PUBLIC_DESTINATIONS;
  readonly destination = computed(() => findDestination(this.route.snapshot.paramMap.get('slug')));
}
