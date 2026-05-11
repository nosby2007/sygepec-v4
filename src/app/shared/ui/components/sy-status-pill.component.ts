import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type StatusType = 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'approved' | 'rejected';

@Component({
  selector: 'sy-status-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="classNames">
      <ng-content></ng-content>
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: var(--sy-radius-full);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    /* Status variants */
    .status-success {
      background-color: rgba(22, 163, 74, 0.1);
      color: var(--sy-success);
    }

    .status-warning {
      background-color: rgba(245, 158, 11, 0.1);
      color: var(--sy-warning);
    }

    .status-danger {
      background-color: rgba(220, 38, 38, 0.1);
      color: var(--sy-danger);
    }

    .status-info {
      background-color: rgba(37, 99, 235, 0.1);
      color: var(--sy-info);
    }

    .status-pending {
      background-color: rgba(245, 158, 11, 0.1);
      color: #d97706;
    }

    .status-approved {
      background-color: rgba(22, 163, 74, 0.1);
      color: var(--sy-success);
    }

    .status-rejected {
      background-color: rgba(220, 38, 38, 0.1);
      color: var(--sy-danger);
    }
  `],
})
export class SyStatusPillComponent {
  @Input() status: StatusType = 'info';

  get classNames(): string {
    return `status-${this.status}`;
  }
}
