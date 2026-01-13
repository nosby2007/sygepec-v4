import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { OrganizationsRepository } from '../data/organizations.repository';
import { Organization } from '../data/admin.models';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  standalone: true,
  selector: 'app-organizations-list',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatSlideToggleModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/admin" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Organizations</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/admin/users"><mat-icon>group</mat-icon>Users</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Create organization</mat-card-title>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="createOrg()">
            <div class="grid">
              <mat-form-field appearance="outline">
                <mat-label>Name</mat-label>
                <input matInput formControlName="name" placeholder="Perry Home Wound Care" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Code (optional)</mat-label>
                <input matInput formControlName="code" placeholder="SYG-PHWC" />
              </mat-form-field>
            </div>

            <button mat-flat-button type="submit" [disabled]="form.invalid || saving">
              {{ saving ? 'Creating…' : 'Create' }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card class="card">
        <mat-card-title>Organizations</mat-card-title>
        <mat-card-content>
          @if (orgs().length === 0) {
            <div class="muted">No organizations found.</div>
          } @else {
            <div class="list">
              @for (o of orgs(); track o.id) {
                <div class="row">
                  <div class="main">
                    <div class="title">{{ o.name }}</div>
                    <div class="muted small">ID: {{ o.id }}</div>
                    <div class="muted small">Code: {{ o.code || '—' }}</div>
                  </div>
                  <div class="actions">
                    <mat-slide-toggle [checked]="o.isActive" (change)="setActive(o, $event.checked)">
                      Active
                    </mat-slide-toggle>
                  </div>
                </div>
                <mat-divider class="divider"></mat-divider>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 10px 0; }
    .title { font-weight: 800; }
    .divider { margin: 10px 0; }
    .actions { display: flex; align-items: center; }
  `]
})
export class OrganizationsListComponent {
  private repo = inject(OrganizationsRepository);
  private fb = inject(FormBuilder);

  saving = false;

  readonly orgs = toSignal(this.repo.listOrgs(), { initialValue: [] as Organization[] });

  readonly form = this.fb.group({
    name: ['', Validators.required],
    code: ['']
  });

  async createOrg() {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const { name, code } = this.form.value;
      await this.repo.createOrg({
        name: name!,
        code: code || null,
        isActive: true
      } as any);
      this.form.reset({ name: '', code: '' });
    } finally {
      this.saving = false;
    }
  }

  async setActive(org: Organization, isActive: boolean) {
    await this.repo.updateOrg(org.id, { isActive });
  }
}
