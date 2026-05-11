import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sy-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div class="header-content">
        <h1 class="title">{{ title }}</h1>
        <p class="description" *ngIf="description">{{ description }}</p>
      </div>
      <div class="header-actions" *ngIf="hasActions">
        <ng-content select="[sy-action]"></ng-content>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--sy-spacing-xl);
      margin-bottom: var(--sy-spacing-2xl);
      padding-bottom: var(--sy-spacing-xl);
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    }

    .header-content {
      flex: 1;
    }

    .title {
      font-size: 28px;
      font-weight: 700;
      color: var(--sy-text-primary);
      margin: 0 0 8px 0;
    }

    .description {
      font-size: 14px;
      color: var(--sy-text-secondary);
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: var(--sy-spacing-md);
      align-items: center;
    }

    @media (max-width: 768px) {
      .page-header {
        flex-direction: column;
      }

      .title {
        font-size: 24px;
      }

      .header-actions {
        width: 100%;
        flex-direction: column-reverse;
      }

      ::ng-deep [sy-action] {
        width: 100%;
      }
    }
  `],
})
export class SyPageHeaderComponent {
  @Input() title: string = '';
  @Input() description: string | null = null;
  @Input() hasActions = false;
}
