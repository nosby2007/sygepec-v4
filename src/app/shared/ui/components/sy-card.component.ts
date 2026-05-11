import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type CardVariant = 'default' | 'elevated' | 'bordered' | 'gradient';

@Component({
  selector: 'sy-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="classNames">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    div {
      border-radius: var(--sy-radius-xl);
      transition: all var(--sy-transition-normal);
    }

    .card-default {
      background: var(--sy-bg-card);
      border: 1px solid rgba(0, 0, 0, 0.05);
      padding: var(--sy-spacing-xl);
      box-shadow: var(--sy-shadow-sm);
    }

    .card-elevated {
      background: var(--sy-bg-card);
      padding: var(--sy-spacing-xl);
      box-shadow: var(--sy-shadow-card);

      &:hover {
        box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.12);
        transform: translateY(-4px);
      }
    }

    .card-bordered {
      background: var(--sy-bg-card);
      border: 2px solid var(--sy-primary-trust-blue);
      padding: var(--sy-spacing-xl);
    }

    .card-gradient {
      background: linear-gradient(135deg, rgba(11, 31, 58, 0.95) 0%, rgba(18, 60, 105, 0.95) 50%, rgba(30, 99, 214, 0.95) 100%);
      color: white;
      padding: var(--sy-spacing-xl);
      box-shadow: var(--sy-shadow-card);
    }
  `],
})
export class SyCardComponent {
  @Input() variant: CardVariant = 'default';

  get classNames(): string {
    return `card-${this.variant}`;
  }
}
