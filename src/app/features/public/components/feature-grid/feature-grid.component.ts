import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PublicFeature } from '../../models/public-content.model';

@Component({
  selector: 'app-feature-grid',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pub-feature-grid">
      <article class="pub-feature" *ngFor="let feature of features">
        <span>{{ feature.iconKey.slice(0, 2) }}</span>
        <h3>{{ feature.title }}</h3>
        <p>{{ feature.description }}</p>
      </article>
    </div>
  `,
})
export class FeatureGridComponent {
  @Input() features: PublicFeature[] = [];
}
