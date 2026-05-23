import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { findProfile, PUBLIC_PROFILES } from '../../data/profiles.data';
import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';
import { CtaSectionComponent } from '../../components/cta-section/cta-section.component';

@Component({
  selector: 'app-profile-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicHeroComponent, PublicSectionHeaderComponent, CtaSectionComponent],
  template: `
    <ng-container *ngIf="profile() as item; else missing">
      <app-public-hero
        [eyebrow]="item.eyebrow"
        [title]="item.headline"
        [description]="item.description"
        [primaryCta]="item.cta"
        [secondaryCta]="{ label: 'Explore services', url: '/public/services' }"
        [visualLabel]="item.title + ' workflow'"
        [visualTags]="item.tags"
        imageUrl="/assets/marketing/sygepec-profiles-candidates.png"
        [imageAlt]="item.title + ' candidate pathway visual'"
        [compact]="true"
      />
      <section class="pub-section pub-section--white">
        <div class="sy-public-container pub-grid-3">
          <article>
            <app-public-section-header align="left" eyebrow="Mistakes" title="Common issues to avoid" />
            <ul class="pub-detail-list"><li *ngFor="let row of item.commonMistakes">{{ row }}</li></ul>
          </article>
          <article>
            <app-public-section-header align="left" eyebrow="Journey" title="How the pathway is structured" />
            <ul class="pub-detail-list"><li *ngFor="let row of item.journeySteps">{{ row }}</li></ul>
          </article>
          <article>
            <app-public-section-header align="left" eyebrow="Services" title="Recommended support" />
            <ul class="pub-detail-list"><li *ngFor="let row of item.recommendedServices">{{ row }}</li></ul>
          </article>
        </div>
      </section>
      <app-cta-section
        [title]="'Build a stronger pathway for ' + item.title + '.'"
        description="Create your assessment and turn your profile into a structured dossier with documents, tasks and next best actions."
        [primaryCta]="item.cta"
        [secondaryCta]="{ label: 'Ask a question', url: '/public/contact' }"
      />
    </ng-container>
    <ng-template #missing>
      <section class="pub-section pub-section--white">
        <div class="sy-public-container">
          <app-public-section-header title="Profile not found" description="Choose one of the prepared profile segments." />
          <div class="pub-grid">
            <a class="pub-card" *ngFor="let item of profiles" [routerLink]="['/public/profiles', item.slug]">
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </a>
          </div>
        </div>
      </section>
    </ng-template>
  `,
})
export class ProfileDetailPageComponent {
  private route = inject(ActivatedRoute);
  readonly profiles = PUBLIC_PROFILES;
  readonly profile = computed(() => findProfile(this.route.snapshot.paramMap.get('slug')));
}
