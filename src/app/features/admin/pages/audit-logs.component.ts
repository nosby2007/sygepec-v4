import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';

import { AuditLogsRepository } from '../data/audit-logs.repository';
import { AdminContextService } from '../data/admin-context.service';
import { AuditLog } from '../data/audit.models';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  standalone: true,
  selector: 'app-audit-logs',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button [routerLink]="backLink()" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Audit logs</span>
      <span class="spacer"></span>

      @if (scope() === 'platform') {
        <a mat-button routerLink="/admin/users"><mat-icon>group</mat-icon>Users</a>
      } @else {
        <a mat-button routerLink="/admin/org/users"><mat-icon>group</mat-icon>Users</a>
      }
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-content class="filters">
          <div class="muted small">Scope: <b>{{ scope() }}</b></div>
          @if (scope() === 'tenant') {
            <div class="muted small">Tenant: <b>{{ tenantId() || '—' }}</b></div>
          }

          <mat-form-field appearance="outline" class="full">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="q" placeholder="action, target, actor, tenant..." />
          </mat-form-field>

          <div class="muted small">Showing {{ filtered().length }} logs</div>
        </mat-card-content>
      </mat-card>

      <mat-card class="card">
        <mat-card-content>
          @if (filtered().length === 0) {
            <div class="muted">No logs.</div>
          } @else {
            <div class="list">
              @for (l of filtered(); track l.id) {
                <div class="row">
                  <div class="main">
                    <div class="title">{{ l.action }}</div>
                    <div class="muted small">
                      {{ toDate(l.createdAt) | date:'MMM d, y · h:mm a' }}
                      · actor: {{ l.actorEmail || l.actorUid }}
                      · target: {{ l.targetType }}/{{ l.targetId }}
                      · tenant: {{ l.tenantId ?? 'GLOBAL' }}
                    </div>

                    @if (l.meta) {
                      <pre class="meta">{{ l.meta | json }}</pre>
                    }
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
    .filters { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .full { width: 100%; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .title { font-weight: 800; }
    .divider { margin: 10px 0; }
    .meta { margin: 8px 0 0; white-space: pre-wrap; font-size: 12px; opacity: .85; }
  `]
})
export class AuditLogsComponent {
  private route = inject(ActivatedRoute);
  private repo = inject(AuditLogsRepository);
  private ctx = inject(AdminContextService);

  readonly q = new FormControl('', { nonNullable: true });

  readonly scope = toSignal(
    this.route.data.pipe(map(d => (d['scope'] as 'platform' | 'tenant') ?? 'platform')),
    { initialValue: 'platform' as const }
  );

  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });

  readonly logs = toSignal(
    this.route.data.pipe(
      map(d => (d['scope'] as 'platform' | 'tenant') ?? 'platform'),
      switchMap(scope => {
        if (scope === 'tenant') {
          return this.ctx.tenantId$.pipe(
            switchMap(tid => this.repo.listLogs({ tenantId: tid ?? null, max: 300 }))
          );
        }
        return this.repo.listLogs({ max: 300 });
      })
    ),
    { initialValue: [] as AuditLog[] }
  );

  readonly queryText = toSignal(
    this.q.valueChanges.pipe(
      startWith(this.q.value),
      debounceTime(200),
      distinctUntilChanged(),
      map(v => (v ?? '').trim().toLowerCase())
    ),
    { initialValue: '' }
  );

  readonly filtered = computed(() => {
    const text = this.queryText();
    const list = this.logs();
    if (!text) return list;

    return list.filter(l => {
      const hay = [
        l.action,
        l.targetType,
        l.targetId,
        l.actorUid,
        l.actorEmail ?? '',
        String(l.tenantId ?? 'GLOBAL'),
        JSON.stringify(l.meta ?? {})
      ].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  backLink() {
    return this.scope() === 'tenant' ? '/admin/org' : '/admin';
  }

  toDate(v: any): Date {
    if (!v) return new Date();
    if (v?.toMillis) return new Date(v.toMillis());
    return new Date(v);
  }
}
