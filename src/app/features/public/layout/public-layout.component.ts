import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { PUBLIC_NAVIGATION } from '../data/navigation.data';
import { PUBLIC_DESTINATIONS } from '../data/destinations.data';
import { PUBLIC_PROFILES } from '../data/profiles.data';
import { PUBLIC_SERVICES } from '../data/services.data';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './public-layout.component.html',
  styleUrls: ['./public-layout.component.scss'],
})
export class PublicLayoutComponent {
  readonly navGroups = PUBLIC_NAVIGATION;
  readonly footerDestinations = PUBLIC_DESTINATIONS;
  readonly footerProfiles = PUBLIC_PROFILES;
  readonly footerServices = PUBLIC_SERVICES.slice(0, 6);
  readonly mobileOpen = signal(false);

  toggleMobile(): void {
    this.mobileOpen.update((open) => !open);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}
