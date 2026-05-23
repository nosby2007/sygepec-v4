import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { findService, PUBLIC_SERVICES } from '../../data/services.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-service-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicHeroComponent, PublicSectionHeaderComponent, CtaSectionComponent],
  template: `
    <ng-container *ngIf="service() as item; else missing">
      <app-public-hero
        [eyebrow]="item.eyebrow"
        [title]="item.headline"
        [description]="item.description"
        [primaryCta]="item.cta"
        [secondaryCta]="{ label: 'All services', url: '/public/services' }"
        [visualLabel]="item.title"
        [visualTags]="item.tags"
        imageUrl="/assets/marketing/sygepec-services-workflow.png"
        [imageAlt]="item.title + ' service workflow visual'"
        [compact]="true"
      />
      <section class="pub-section pub-section--white">
        <div class="sy-public-container pub-grid-3">
          <article class="pub-card">
            <p class="pub-card__eyebrow">For who</p>
            <h3>Best fit</h3>
            <p>{{ item.forWho }}</p>
          </article>
          <article>
            <app-public-section-header align="left" eyebrow="Included" title="What is included" />
            <ul class="pub-detail-list"><li *ngFor="let row of item.includes">{{ row }}</li></ul>
          </article>
          <article class="pub-card">
            <p class="pub-card__eyebrow">Outcome</p>
            <h3>Expected result</h3>
            <p>{{ item.expectedOutcome }}</p>
          </article>
        </div>
      </section>
      <app-cta-section
        [title]="'Move forward with ' + item.title + '.'"
        description="Use SYGEPEC to keep the workflow structured, visible and ready for human review where needed."
        [primaryCta]="item.cta"
        [secondaryCta]="{ label: 'Ask SYGEPEC', url: '/public/contact' }"
      />
    </ng-container>
    <ng-template #missing>
      <section class="pub-section pub-section--white">
        <div class="sy-public-container">
          <app-public-section-header title="Service not found" description="Choose one of the prepared service tracks." />
          <div class="pub-grid">
            <a class="pub-card" *ngFor="let item of services" [routerLink]="['/public/services', item.slug]">
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </a>
          </div>
        </div>
      </section>
    </ng-template>
  `,
})
export class ServiceDetailPageComponent {
  private route = inject(ActivatedRoute);
  readonly services = PUBLIC_SERVICES;
  readonly service = computed(() => findService(this.route.snapshot.paramMap.get('slug')));
}
