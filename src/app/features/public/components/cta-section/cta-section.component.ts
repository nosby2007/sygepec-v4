import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PublicCta } from '../../models/public-content.model';

@Component({
  selector: 'app-cta-section',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="pub-cta">
      <div class="sy-public-container pub-cta__inner">
        <p class="pub-eyebrow" *ngIf="eyebrow">{{ eyebrow }}</p>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
        <div class="pub-cta__actions">
          <a *ngIf="primaryCta" class="pub-btn pub-btn--primary" [routerLink]="primaryCta.url">{{ primaryCta.label }}</a>
          <a *ngIf="secondaryCta" class="pub-btn pub-btn--secondary" [routerLink]="secondaryCta.url">{{ secondaryCta.label }}</a>
        </div>
      </div>
    </section>
  `,
})
export class CtaSectionComponent {
  @Input() eyebrow = 'Next step';
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() primaryCta: PublicCta | null = null;
  @Input() secondaryCta: PublicCta | null = null;
}
