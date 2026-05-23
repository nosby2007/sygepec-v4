import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PublicProfileSegment } from '../../models/public-content.model';

@Component({
  selector: 'app-profile-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a class="pub-card pub-card--profile" [routerLink]="['/public/profiles', profile.slug]">
      <span class="pub-card__icon">{{ profile.iconKey.slice(0, 2) }}</span>
      <p class="pub-card__eyebrow">{{ profile.eyebrow }}</p>
      <h3>{{ profile.title }}</h3>
      <p>{{ profile.description }}</p>
      <strong>{{ profile.cta.label }}</strong>
    </a>
  `,
})
export class ProfileCardComponent {
  @Input({ required: true }) profile!: PublicProfileSegment;
}
