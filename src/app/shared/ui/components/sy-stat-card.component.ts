import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sy-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stat-card">
      <div class="stat-label">{{ label }}</div>
      <div class="stat-value">{{ value }}</div>
      <div class="stat-change" [class.positive]="isPositive" *ngIf="change !== null">
        <span>{{ change > 0 ? '+' : '' }}{{ change }}%</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .stat-card {
      background: var(--sy-bg-card);
      border: 1px solid rgba(0, 0, 0, 0.05);
      border-radius: var(--sy-radius-xl);
      padding: var(--sy-spacing-xl);
      box-shadow: var(--sy-shadow-sm);
      transition: all var(--sy-transition-normal);

      &:hover {
        box-shadow: var(--sy-shadow-card);
      }
    }

    .stat-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--sy-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: var(--sy-text-primary);
      margin-bottom: 8px;
    }

    .stat-change {
      font-size: 13px;
      font-weight: 500;
      color: var(--sy-danger);

      &.positive {
        color: var(--sy-success);
      }
    }
  `],
})
export class SyStatCardComponent {
  @Input() label = '';
  @Input() value: string | number = 0;
  @Input() change: number | null = null;

  get isPositive(): boolean {
    return (this.change ?? 0) >= 0;
  }
}
