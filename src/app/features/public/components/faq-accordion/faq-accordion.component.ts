import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PublicFaqItem } from '../../models/public-content.model';

@Component({
  selector: 'app-faq-accordion',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pub-faq">
      <details *ngFor="let item of items">
        <summary>{{ item.question }}</summary>
        <p>{{ item.answer }}</p>
      </details>
    </div>
  `,
})
export class FaqAccordionComponent {
  @Input() items: PublicFaqItem[] = [];
}
