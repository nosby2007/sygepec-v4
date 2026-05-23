import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PublicStat } from '../../models/public-content.model';

@Component({
  selector: 'app-global-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pub-stats">
      <article *ngFor="let stat of stats">
        <strong>{{ stat.value }}</strong>
        <span>{{ stat.label }}</span>
        <p *ngIf="stat.description">{{ stat.description }}</p>
      </article>
    </div>
  `,
})
export class GlobalStatsComponent {
  @Input() stats: PublicStat[] = [];
}
