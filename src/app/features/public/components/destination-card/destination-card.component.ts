import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PublicDestination } from '../../models/public-content.model';

@Component({
  selector: 'app-destination-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a class="pub-card pub-card--destination" [routerLink]="['/public/destinations', destination.slug]">
      <span class="pub-card__icon">{{ destination.countryCode }}</span>
      <p class="pub-card__eyebrow">{{ destination.eyebrow }}</p>
      <h3>{{ destination.title }}</h3>
      <p>{{ destination.description }}</p>
      <div class="pub-tags">
        <span *ngFor="let tag of destination.tags.slice(0, 3)">{{ tag }}</span>
      </div>
    </a>
  `,
})
export class DestinationCardComponent {
  @Input({ required: true }) destination!: PublicDestination;
}
