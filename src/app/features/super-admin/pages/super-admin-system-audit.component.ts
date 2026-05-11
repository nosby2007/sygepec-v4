import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { LoggerService } from '../../../core/logging/logger.service';

interface AuditRow {
  id: string;
  action: string;
  actorEmail: string | null;
  actorUid: string | null;
  tenantId: string | null;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date | null;
}

@Component({
  standalone: true,
  selector: 'app-super-admin-system-audit',
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sa">
      <header class="sa__hd">
        <a routerLink="/super-admin" class="back">← Super Admin</a>
        <h1>Audit système</h1>
        <p>Journaux immuables. Recherche et filtres côté client (max 500 lignes chargées).</p>
      </header>

      <div class="filters">
        <label class="field">
          <span>Recherche</span>
          <input type="text" placeholder="action, email, tenant, target…"
            [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </label>
        <label class="field">
          <span>Action</span>
          <select [ngModel]="actionFilter()" (ngModelChange)="actionFilter.set($event)">
            <option value="">Toutes ({{ rows().length }})</option>
            @for (a of actionsList(); track a.key) {
              <option [value]="a.key">{{ a.key }} ({{ a.count }})</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Tenant</span>
          <select [ngModel]="tenantFilter()" (ngModelChange)="tenantFilter.set($event)">
            <option value="">Tous</option>
            @for (t of tenantsList(); track t) {
              <option [value]="t">{{ t }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Depuis</span>
          <input type="date" [ngModel]="dateFrom()" (ngModelChange)="dateFrom.set($event)" />
        </label>
        <label class="field">
          <span>Jusqu'à</span>
          <input type="date" [ngModel]="dateTo()" (ngModelChange)="dateTo.set($event)" />
        </label>
        <button type="button" class="btn btn--mini" (click)="reset()">✕ Réinitialiser</button>
        <button type="button" class="btn btn--mini" (click)="load()" [disabled]="loading()">
          {{ loading() ? '…' : '↻ Recharger' }}
        </button>
        <button type="button" class="btn btn--mini btn--accent" (click)="exportCsv()" [disabled]="filtered().length === 0">
          ⬇ CSV ({{ filtered().length }})
        </button>
      </div>

      @if (loading()) {
        <p class="muted">Chargement de l'audit…</p>
      } @else if (filtered().length === 0) {
        <div class="empty">
          @if (rows().length === 0) {
            Aucun évènement enregistré.
          } @else {
            Aucun évènement ne correspond aux filtres ({{ rows().length }} total).
          }
        </div>
      } @else {
        <p class="muted-mini">{{ filtered().length }} résultat(s) sur {{ rows().length }} chargé(s).</p>
        <ul class="feed">
          @for (e of filtered(); track e.id) {
            <li>
              <header>
                <strong class="action">{{ e.action }}</strong>
                @if (e.tenantId) { <span class="chip chip--tenant">tenant: {{ e.tenantId }}</span> }
                @if (e.targetType) { <span class="chip">{{ e.targetType }}{{ e.targetId ? ':' + e.targetId : '' }}</span> }
                <time>{{ formatDate(e.createdAt) }}</time>
              </header>
              <div class="actor">
                @if (e.actorEmail) { <span>👤 {{ e.actorEmail }}</span> }
                @if (e.actorUid) { <span class="muted-mini">{{ e.actorUid }}</span> }
              </div>
              @if (e.meta && hasMeta(e.meta)) {
                <details>
                  <summary>Metadata</summary>
                  <pre>{{ formatMeta(e.meta) }}</pre>
                </details>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    :host { display:block; padding:32px clamp(16px,4vw,48px); background:#F6F9FC; min-height:100%; }
    .sa { max-width:1200px; margin:0 auto; }
    .sa__hd { background:linear-gradient(135deg,#0B1F3A,#123C69); color:#fff; border-radius:24px; padding:28px; margin-bottom:20px; }
    .back { color:#F5B841; text-decoration:none; font-size:.85rem; }
    h1 { margin:8px 0; }
    .filters { background:#fff; padding:14px 16px; border-radius:14px; margin-bottom:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; box-shadow:0 4px 12px rgba(11,31,58,.05); }
    .field { display:flex; flex-direction:column; gap:4px; flex:1 1 160px; min-width:140px; }
    .field span { font-size:.7rem; color:#64748b; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }
    .field input, .field select { padding:8px 10px; border:1px solid #E2E8F0; border-radius:8px; font:inherit; background:#F8FAFC; }
    .field input:focus, .field select:focus { outline:none; border-color:#F5B841; background:#fff; }
    .btn { padding:8px 14px; border:1px solid #CBD5E1; background:#fff; border-radius:10px; cursor:pointer; font:inherit; color:#0B1F3A; font-weight:600; }
    .btn:hover:not(:disabled) { border-color:#F5B841; background:#FFFBEA; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn--mini { padding:6px 12px; font-size:.8rem; }
    .btn--accent { background:#F5B841; border-color:#F5B841; color:#0B1F3A; }
    .btn--accent:hover:not(:disabled) { background:#E0A82E; }
    .muted { color:#64748b; padding:24px; text-align:center; }
    .muted-mini { color:#94a3b8; font-size:.75rem; }
    .empty { background:#fff; padding:32px; border-radius:16px; color:#475569; text-align:center; }
    .feed { list-style:none; padding:0; margin:10px 0 0; background:#fff; border-radius:16px; box-shadow:0 8px 24px rgba(11,31,58,.06); overflow:hidden; }
    .feed li { padding:14px 18px; border-bottom:1px solid #F1F5F9; transition:background .12s; }
    .feed li:hover { background:#F8FAFC; }
    .feed li:last-child { border-bottom:0; }
    .feed header { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
    .action { color:#0B1F3A; font-size:.92rem; }
    .chip { background:#E2E8F0; color:#475569; padding:2px 8px; border-radius:10px; font-size:.7rem; font-weight:600; }
    .chip--tenant { background:#FFFBEA; color:#92400E; }
    time { margin-left:auto; color:#94a3b8; font-size:.72rem; }
    .actor { display:flex; gap:10px; align-items:center; font-size:.78rem; color:#475569; }
    details summary { cursor:pointer; color:#64748b; font-size:.72rem; margin-top:6px; user-select:none; }
    details summary:hover { color:#0B1F3A; }
    pre { margin:6px 0 0; padding:10px; background:#0B1F3A; color:#E2E8F0; border-radius:8px; font-size:.72rem; overflow-x:auto; }
  `],
})
export class SuperAdminSystemAuditComponent {
  private readonly db = inject(FIRESTORE_DB);
  private readonly logger = inject(LoggerService);

  readonly loading = signal(true);
  readonly rows = signal<AuditRow[]>([]);

  readonly search = signal('');
  readonly actionFilter = signal('');
  readonly tenantFilter = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');

  readonly actionsList = computed(() => {
    const counts = new Map<string, number>();
    for (const r of this.rows()) counts.set(r.action, (counts.get(r.action) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  });

  readonly tenantsList = computed(() => {
    const set = new Set<string>();
    for (const r of this.rows()) if (r.tenantId) set.add(r.tenantId);
    return Array.from(set).sort();
  });

  readonly filtered = computed<AuditRow[]>(() => {
    const q = this.search().trim().toLowerCase();
    const a = this.actionFilter();
    const t = this.tenantFilter();
    const from = this.dateFrom() ? new Date(this.dateFrom() + 'T00:00:00') : null;
    const to = this.dateTo() ? new Date(this.dateTo() + 'T23:59:59') : null;
    return this.rows().filter((r) => {
      if (a && r.action !== a) return false;
      if (t && r.tenantId !== t) return false;
      if (from && (!r.createdAt || r.createdAt < from)) return false;
      if (to && (!r.createdAt || r.createdAt > to)) return false;
      if (q) {
        const hay = [r.action, r.actorEmail, r.actorUid, r.tenantId, r.targetType, r.targetId, JSON.stringify(r.meta ?? {})]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      let snap;
      try {
        snap = await getDocs(query(collection(this.db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(500)));
      } catch (err) {
        this.logger.warn('audit ordered query failed, fallback', { err });
        const cutoff = Timestamp.fromDate(new Date(Date.now() - 90 * 86_400_000));
        snap = await getDocs(query(collection(this.db, 'auditLogs'), where('createdAt', '>=', cutoff), limit(500)));
      }
      const rows: AuditRow[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const created = x['createdAt'] as Timestamp | undefined;
        return {
          id: d.id,
          action: (x['action'] as string | undefined) ?? (x['type'] as string | undefined) ?? 'unknown',
          actorEmail: (x['actorEmail'] as string | undefined) ?? null,
          actorUid: (x['actorUid'] as string | undefined) ?? null,
          tenantId: (x['tenantId'] as string | undefined) ?? null,
          targetType: (x['targetType'] as string | undefined) ?? null,
          targetId: (x['targetId'] as string | undefined) ?? null,
          meta: (x['meta'] as Record<string, unknown> | undefined) ?? null,
          createdAt: created?.toDate?.() ?? null,
        };
      });
      rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      this.rows.set(rows);
    } catch (e) {
      this.logger.error('SuperAdminSystemAudit load failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  reset(): void {
    this.search.set('');
    this.actionFilter.set('');
    this.tenantFilter.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  formatDate(d: Date | null): string {
    if (!d) return '—';
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
  }

  hasMeta(m: Record<string, unknown>): boolean {
    return Object.keys(m).length > 0;
  }

  formatMeta(m: Record<string, unknown>): string {
    try {
      return JSON.stringify(m, null, 2);
    } catch {
      return String(m);
    }
  }

  exportCsv(): void {
    const rows = this.filtered();
    if (rows.length === 0) return;
    const header = ['id', 'createdAt', 'action', 'actorEmail', 'actorUid', 'tenantId', 'targetType', 'targetId', 'meta'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const cells = [
        r.id,
        r.createdAt?.toISOString() ?? '',
        r.action,
        r.actorEmail ?? '',
        r.actorUid ?? '',
        r.tenantId ?? '',
        r.targetType ?? '',
        r.targetId ?? '',
        r.meta ? JSON.stringify(r.meta) : '',
      ].map((v) => {
        const s = String(v).replace(/"/g, '""');
        return /[",\n;]/.test(s) ? `"${s}"` : s;
      });
      lines.push(cells.join(','));
    }
    const blob = new Blob(["\uFEFF" + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
