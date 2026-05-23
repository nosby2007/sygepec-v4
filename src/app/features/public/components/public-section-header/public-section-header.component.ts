import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-public-section-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="pub-section-header" [class.pub-section-header--left]="align === 'left'">
      <p class="pub-eyebrow" *ngIf="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p *ngIf="description">{{ description }}</p>
    </header>
  `,
})
export class PublicSectionHeaderComponent {
  @Input() eyebrow = '';
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Input() align: 'center' | 'left' = 'center';
}
