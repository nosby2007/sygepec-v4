import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-admin-settings',
  imports: [CommonModule, RouterLink, MatToolbarModule, MatCardModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/admin" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Settings</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/admin/users"><mat-icon>group</mat-icon>Users</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Admin settings</mat-card-title>
        <mat-card-content>
          <div class="muted">
            Placeholder. Typical next steps:
            <ul>
              <li>Global settings: <code>settings/global</code></li>
              <li>Tenant settings: <code>organizations/&#123;orgId&#125;/settings</code></li>
              <li>Branding, feature flags, roles policy, audit configuration</li>
            </ul>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .8; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  `]
})
export class SettingsComponent {}
