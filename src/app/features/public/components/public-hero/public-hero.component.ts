import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PublicCta } from '../../models/public-content.model';

@Component({
  selector: 'app-public-hero',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="pub-hero" [class.pub-hero--compact]="compact">
      <div class="sy-public-container pub-hero__inner">
        <div class="pub-hero__copy">
          <p class="pub-eyebrow">{{ eyebrow }}</p>
          <h1>{{ title }}</h1>
          <p class="pub-hero__lead">{{ description }}</p>
          <div class="pub-hero__actions" *ngIf="primaryCta || secondaryCta">
            <a
              *ngIf="primaryCta"
              class="pub-btn pub-btn--primary"
              [routerLink]="primaryCta.url"
            >
              {{ primaryCta.label }}
            </a>
            <a
              *ngIf="secondaryCta"
              class="pub-btn pub-btn--secondary"
              [routerLink]="secondaryCta.url"
            >
              {{ secondaryCta.label }}
            </a>
          </div>
        </div>

        <article
          class="pub-command-card"
          [class.pub-command-card--image]="!!imageUrl"
          aria-label="SYGEPEC visual preview"
        >
          <img *ngIf="imageUrl" [src]="imageUrl" [alt]="imageAlt" />
          <div class="pub-command-card__top">
            <span>Readiness command center</span>
            <strong>{{ visualLabel }}</strong>
          </div>
          <div class="pub-orbit" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="pub-command-card__grid">
            <span *ngFor="let tag of visualTags">{{ tag }}</span>
          </div>
        </article>
      </div>
    </section>
  `,
})
export class PublicHeroComponent {
  @Input({ required: true }) eyebrow = '';
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() primaryCta: PublicCta | null = null;
  @Input() secondaryCta: PublicCta | null = null;
  @Input() visualLabel = 'Global dossier';
  @Input() visualTags: string[] = ['Profile', 'Documents', 'Timeline', 'Jobs'];
  @Input() imageUrl = '';
  @Input() imageAlt = 'SYGEPEC platform visual';
  @Input() compact = false;
}
