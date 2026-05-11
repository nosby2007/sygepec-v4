import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'sy-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button 
      [class]="classNames"
      [disabled]="disabled"
      [type]="type">
      <ng-content></ng-content>
    </button>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    button {
      font-family: inherit;
      border: none;
      border-radius: var(--sy-radius-lg);
      cursor: pointer;
      font-weight: 500;
      transition: all var(--sy-transition-fast);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
      letter-spacing: 0.5px;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    /* Sizes */
    .btn-sm {
      padding: 8px 12px;
      font-size: 14px;
    }

    .btn-md {
      padding: 10px 16px;
      font-size: 16px;
    }

    .btn-lg {
      padding: 12px 24px;
      font-size: 16px;
    }

    /* Variants */
    .btn-primary {
      background: linear-gradient(135deg, #0B1F3A 0%, #123C69 50%, #1E63D6 100%);
      color: white;

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 10px 25px -5px rgba(30, 99, 214, 0.3);
      }
    }

    .btn-secondary {
      background-color: var(--sy-accent-teal);
      color: white;

      &:hover:not(:disabled) {
        background-color: #0d9488;
      }
    }

    .btn-outline {
      border: 2px solid var(--sy-primary-trust-blue);
      color: var(--sy-primary-trust-blue);
      background-color: transparent;

      &:hover:not(:disabled) {
        background-color: rgba(30, 99, 214, 0.05);
      }
    }

    .btn-ghost {
      color: var(--sy-text-primary);
      background-color: transparent;

      &:hover:not(:disabled) {
        background-color: var(--sy-bg-soft);
      }
    }

    .btn-danger {
      background-color: var(--sy-danger);
      color: white;

      &:hover:not(:disabled) {
        background-color: #b91c1c;
      }
    }
  `],
})
export class SyButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() disabled = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';

  get classNames(): string {
    return `btn-${this.size} btn-${this.variant}`;
  }
}
