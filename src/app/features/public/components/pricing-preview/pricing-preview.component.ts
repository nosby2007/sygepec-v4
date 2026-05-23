import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PublicPricingPlan } from '../../models/public-content.model';

@Component({
  selector: 'app-pricing-preview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="pub-pricing-grid">
      <article class="pub-price" *ngFor="let plan of plans" [class.pub-price--highlight]="plan.highlighted">
        <p class="pub-card__eyebrow">{{ plan.audience }}</p>
        <h3>{{ plan.name }}</h3>
        <strong>{{ plan.price }}</strong>
        <p>{{ plan.description }}</p>
        <ul>
          <li *ngFor="let feature of plan.features">{{ feature }}</li>
        </ul>
        <a class="pub-btn" [class.pub-btn--primary]="plan.highlighted" [class.pub-btn--secondary]="!plan.highlighted" [routerLink]="plan.cta.url">
          {{ plan.cta.label }}
        </a>
      </article>
    </div>
  `,
})
export class PricingPreviewComponent {
  @Input() plans: PublicPricingPlan[] = [];
}
