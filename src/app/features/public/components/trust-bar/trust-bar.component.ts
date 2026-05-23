import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-trust-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="pub-trust" aria-label="SYGEPEC trust signals">
      <div class="sy-public-container pub-trust__inner">
        <span *ngFor="let item of items"><i aria-hidden="true"></i>{{ item }}</span>
      </div>
    </section>
  `,
})
export class TrustBarComponent {
  @Input() items: string[] = [];
}
