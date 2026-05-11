import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sy-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [style.background-color]="backgroundColor" [style.color]="textColor" class="badge">
      <ng-content></ng-content>
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      border-radius: var(--sy-radius-md);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
  `],
})
export class SyBadgeComponent {
  @Input() backgroundColor = 'var(--sy-bg-soft)';
  @Input() textColor = 'var(--sy-text-primary)';
}
