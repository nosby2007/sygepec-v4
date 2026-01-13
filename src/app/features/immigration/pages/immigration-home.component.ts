import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

import { DossiersRepository, Dossier } from '../data/dossiers.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  standalone: true,
  selector: 'app-immigration-home',
  imports: [
    CommonModule,
    RouterLink,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>Immigration</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/immigration/dossiers"><mat-icon>folder</mat-icon>Dossiers</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Overview</mat-card-title>
        <mat-card-content>
          <div class="muted">Tenant: <b>{{ tenantId() || 'PUBLIC/None' }}</b></div>
          <div class="muted">User: <b>{{ uid() || 'Not signed in' }}</b></div>

          <mat-divider class="divider"></mat-divider>

          <div class="kpis">
            <div class="kpi">
              <div class="label">Total dossiers</div>
              <div class="value">{{ dossiers().length }}</div>
            </div>
            <div class="kpi">
              <div class="label">New</div>
              <div class="value">{{ countByStatus('new') }}</div>
            </div>
            <div class="kpi">
              <div class="label">Docs required</div>
              <div class="value">{{ countByStatus('docs_required') }}</div>
            </div>
          </div>
        </mat-card-content>

        <mat-card-actions align="end">
          <a mat-stroked-button routerLink="/immigration/dossiers">Open dossiers</a>
          <a mat-flat-button routerLink="/immigration/dossiers">Create dossier</a>
        </mat-card-actions>
      </mat-card>

      <mat-card class="card">
        <mat-card-title>Recent activity</mat-card-title>
        <mat-card-content>
          <div *ngIf="recent().length === 0" class="muted">No dossiers yet.</div>

          <div class="list" *ngIf="recent().length > 0">
            <div class="row" *ngFor="let d of recent(); trackBy: trackById">
              <div class="main">
                <div class="title">{{ d.title }}</div>
                <div class="muted small">
                  {{ d.clientFullName }} · {{ d.destinationCountry }} · {{ d.program }} · {{ d.status }}
                </div>
              </div>
              <div class="actions">
                <a mat-stroked-button [routerLink]="['/immigration/dossiers', d.id]">Open</a>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .divider { margin: 12px 0; }
    .kpis { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
    .kpi { padding: 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; }
    .label { font-size: 12px; opacity: .75; }
    .value { font-size: 24px; font-weight: 800; }
    .list { margin-top: 6px; display: grid; gap: 10px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
    .title { font-weight: 800; }
    .actions { display: flex; align-items: center; }
  `]
})
export class ImmigrationHomeComponent {
  private dossiersRepo = inject(DossiersRepository);

  private db = getFirestore();
  private auth = getAuth();

  // Minimal context: uid + tenantId from users/{uid}.tenantId
  readonly uid = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)),
    { initialValue: null }
  );

  readonly tenantId = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve(null));
        return from(getDoc(doc(this.db, 'users', uid))).pipe(
          map(s => (s.exists() ? ((s.data() as any).tenantId ?? (s.data() as any).organizationId ?? null) : null))
        );
      })
    ),
    { initialValue: null as string | null }
  );

  readonly dossiers = toSignal(
    this.tenantId.pipe(switchMap(tid => this.dossiersRepo.listDossiers({ tenantId: tid ?? null, max: 200 }))),
    { initialValue: [] as Dossier[] }
  );

  readonly recent = computed(() => this.dossiers().slice(0, 8));

  countByStatus(status: any): number {
    return this.dossiers().filter(d => d.status === status).length;
  }

  trackById(_: number, d: Dossier) { return d.id; }
}
