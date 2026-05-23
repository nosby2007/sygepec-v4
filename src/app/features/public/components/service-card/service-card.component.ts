import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PublicService } from '../../models/public-content.model';

@Component({
  selector: 'app-service-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a class="pub-card pub-card--service" [routerLink]="['/public/services', service.slug]">
      <span class="pub-card__icon">{{ service.iconKey.slice(0, 2) }}</span>
      <p class="pub-card__eyebrow">{{ service.eyebrow }}</p>
      <h3>{{ service.title }}</h3>
      <p>{{ service.description }}</p>
      <ul>
        <li *ngFor="let benefit of service.benefits.slice(0, 2)">{{ benefit }}</li>
      </ul>
    </a>
  `,
})
export class ServiceCardComponent {
  @Input({ required: true }) service!: PublicService;
}
