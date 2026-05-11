import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sy-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-container">
      <div class="progress-header" *ngIf="label">
        <span class="progress-label">{{ label }}</span>
        <span class="progress-percent">{{ percent }}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" [style.width.%]="percent"></div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .progress-container {
      width: 100%;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .progress-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--sy-text-primary);
    }

    .progress-percent {
      font-size: 13px;
      font-weight: 600;
      color: var(--sy-primary-trust-blue);
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background-color: var(--sy-bg-soft);
      border-radius: var(--sy-radius-full);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--sy-accent-teal) 0%, var(--sy-primary-trust-blue) 100%);
      border-radius: var(--sy-radius-full);
      transition: width var(--sy-transition-slow);
    }
  `],
})
export class SyProgressBarComponent {
  @Input() percent: number = 0;
  @Input() label: string | null = null;
}
