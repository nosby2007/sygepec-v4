import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PublicTimelineStep } from '../../models/public-content.model';

@Component({
  selector: 'app-process-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pub-timeline">
      <article class="pub-timeline__step" *ngFor="let item of steps">
        <span>{{ item.step }}</span>
        <h3>{{ item.title }}</h3>
        <p>{{ item.description }}</p>
      </article>
    </div>
  `,
})
export class ProcessTimelineComponent {
  @Input() steps: PublicTimelineStep[] = [];
}
