import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { LoggerService } from '../../../core/logging/logger.service';

type Status = 'ok' | 'warn' | 'ko';

interface Probe {
  key: string;
  label: string;
  status: Status;
  value: string;
  hint: string | null;
  durationMs: number;
}

interface CollectionStat {
  name: string;
  count: number;
  status: Status;
  durationMs: number;
  error: string | null;
}

@Component({
  standalone: true,
  selector: 'app-super-admin-health',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sa">
      <header class="sa__hd">
        <a routerLink="/super-admin" class="back">← Super Admin</a>
        <h1>🩺 Monitoring santé plateforme</h1>
        <p>Vue temps réel des collections critiques, latences Firestore et activité récente.</p>
        <div class="actions">
          <button type="button" class="btn btn--accent" (click)="refresh()" [disabled]="busy()">
            {{ busy() ? '⏳ Analyse en cours…' : '↻ Rafraîchir' }}
          </button>
          @if (lastRun()) { <span class="last">Dernière analyse : {{ lastRun() }}</span> }
        </div>
      </header>

      <!-- Score global -->
      <article class="card">
        <header class="card__hd">
          <h3>Score global</h3>
          <span class="badge" [class.badge--ok]="globalStatus() === 'ok'"
                [class.badge--warn]="globalStatus() === 'warn'"
                [class.badge--ko]="globalStatus() === 'ko'">
            {{ globalStatusLabel() }}
          </span>
        </header>
        <div class="score">
          <div class="score__num" [class.s-ok]="okCount() === probes().length"
                                   [class.s-warn]="warnCount() > 0 && koCount() === 0"
                                   [class.s-ko]="koCount() > 0">
            {{ okCount() }}<small>/{{ probes().length }}</small>
          </div>
          <div class="score__breakdown">
            <span class="b b--ok">✓ {{ okCount() }} OK</span>
            <span class="b b--warn">⚠ {{ warnCount() }} Warn</span>
            <span class="b b--ko">✗ {{ koCount() }} KO</span>
          </div>
        </div>
      </article>

      <!-- Probes -->
      <article class="card">
        <header class="card__hd"><h3>Sondes</h3></header>
        @if (probes().length === 0) {
          <p class="muted">Lancez une analyse pour démarrer.</p>
        } @else {
          <ul class="probes">
            @for (p of probes(); track p.key) {
              <li [class.p-ok]="p.status === 'ok'" [class.p-warn]="p.status === 'warn'" [class.p-ko]="p.status === 'ko'">
                <span class="dot"></span>
                <div>
                  <strong>{{ p.label }}</strong>
                  @if (p.hint) { <em>{{ p.hint }}</em> }
                </div>
                <span class="value">{{ p.value }}</span>
                <span class="duration">{{ p.durationMs }} ms</span>
              </li>
            }
          </ul>
        }
      </article>

      <!-- Collections -->
      <article class="card">
        <header class="card__hd">
          <h3>Volumes par collection</h3>
        </header>
        @if (collections().length === 0) {
          <p class="muted">—</p>
        } @else {
          <table class="tbl">
            <thead><tr><th>Collection</th><th>Documents</th><th>Latence</th><th>État</th></tr></thead>
            <tbody>
              @for (c of collections(); track c.name) {
                <tr>
                  <td><code>{{ c.name }}</code></td>
                  <td><strong>{{ c.count.toLocaleString('fr-FR') }}</strong></td>
                  <td>{{ c.durationMs }} ms</td>
                  <td>
                    <span class="badge" [class.badge--ok]="c.status === 'ok'"
                                         [class.badge--warn]="c.status === 'warn'"
                                         [class.badge--ko]="c.status === 'ko'">
                      {{ c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗' }}
                    </span>
                    @if (c.error) { <small class="muted-mini">{{ c.error }}</small> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </article>

      <!-- Activité récente -->
      <article class="card">
        <header class="card__hd"><h3>Activité récente (24 h)</h3></header>
        @if (activityWindow24h() === null) {
          <p class="muted">—</p>
        } @else {
          <div class="stat-grid">
            <div class="stat"><span>Audit logs</span><strong>{{ activityWindow24h() }}</strong><small>évènements 24 h</small></div>
            <div class="stat"><span>Dernier évènement</span><strong>{{ lastAuditLabel() }}</strong><small>{{ lastAuditAction() }}</small></div>
            <div class="stat"><span>Tenants actifs (signaux)</span><strong>{{ activeTenants().size }}</strong><small>vu en audit 24 h</small></div>
          </div>
        }
      </article>
    </section>
  `,
  styles: [`
    :host { display:block; padding:32px clamp(16px,4vw,48px); background:#F6F9FC; min-height:100%; }
    .sa { max-width:1200px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
    .sa__hd { background:linear-gradient(135deg,#0B1F3A,#123C69); color:#fff; border-radius:24px; padding:28px; }
    .back { color:#F5B841; text-decoration:none; font-size:.85rem; }
    h1 { margin:8px 0; }
    .actions { display:flex; gap:12px; align-items:center; margin-top:14px; }
    .last { color:#cbd5e1; font-size:.78rem; }
    .btn { padding:10px 18px; border:1px solid #CBD5E1; background:#fff; border-radius:10px; cursor:pointer; font:inherit; color:#0B1F3A; font-weight:600; }
    .btn--accent { background:#F5B841; border-color:#F5B841; color:#0B1F3A; }
    .btn--accent:hover:not(:disabled) { background:#E0A82E; }
    .btn:disabled { opacity:.55; cursor:not-allowed; }
    .card { background:#fff; border-radius:16px; padding:18px 22px; box-shadow:0 4px 14px rgba(11,31,58,.04); }
    .card__hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .card__hd h3 { margin:0; color:#0B1F3A; font-size:1.05rem; }
    .muted { color:#64748b; }
    .muted-mini { color:#94a3b8; font-size:.7rem; }
    .badge { padding:4px 10px; border-radius:999px; font-size:.72rem; font-weight:700; background:#E2E8F0; color:#475569; }
    .badge--ok { background:#16A34A; color:#fff; }
    .badge--warn { background:#F5B841; color:#0B1F3A; }
    .badge--ko { background:#B91C1C; color:#fff; }
    .score { display:flex; gap:32px; align-items:center; }
    .score__num { font-size:3.4rem; font-weight:800; color:#0B1F3A; line-height:1; }
    .score__num small { font-size:1.4rem; color:#94a3b8; font-weight:600; }
    .score__num.s-ok { color:#16A34A; }
    .score__num.s-warn { color:#D97706; }
    .score__num.s-ko { color:#B91C1C; }
    .score__breakdown { display:flex; flex-direction:column; gap:6px; }
    .b { font-size:.85rem; font-weight:600; }
    .b--ok { color:#16A34A; }
    .b--warn { color:#D97706; }
    .b--ko { color:#B91C1C; }
    .probes { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
    .probes li { display:grid; grid-template-columns:14px 1fr auto auto; gap:14px; align-items:center; padding:10px 12px; border-radius:10px; border:1px solid #E2E8F0; background:#F8FAFC; }
    .probes li.p-ok { border-color:#86EFAC; background:#F0FDF4; }
    .probes li.p-warn { border-color:#FCD34D; background:#FFFBEA; }
    .probes li.p-ko { border-color:#FCA5A5; background:#FEF2F2; }
    .probes strong { color:#0B1F3A; display:block; }
    .probes em { font-style:normal; color:#64748b; font-size:.72rem; }
    .dot { width:10px; height:10px; border-radius:50%; background:#94a3b8; }
    .p-ok .dot { background:#16A34A; }
    .p-warn .dot { background:#F5B841; }
    .p-ko .dot { background:#B91C1C; }
    .value { font-weight:700; color:#0B1F3A; font-size:.95rem; }
    .duration { color:#94a3b8; font-size:.72rem; min-width:60px; text-align:right; }
    .tbl { width:100%; border-collapse:collapse; }
    .tbl th, .tbl td { padding:10px 12px; text-align:left; border-bottom:1px solid #F1F5F9; font-size:.85rem; }
    .tbl th { color:#64748b; font-weight:600; text-transform:uppercase; font-size:.7rem; letter-spacing:.05em; }
    .tbl code { background:#F1F5F9; padding:2px 6px; border-radius:4px; font-size:.78rem; }
    .stat-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; }
    .stat { background:#F8FAFC; padding:14px 16px; border-radius:12px; border:1px solid #E2E8F0; }
    .stat span { font-size:.7rem; color:#64748b; text-transform:uppercase; letter-spacing:.05em; font-weight:600; display:block; }
    .stat strong { font-size:1.4rem; color:#0B1F3A; display:block; margin-top:4px; }
    .stat small { color:#94a3b8; font-size:.7rem; }
  `],
})
export class SuperAdminHealthComponent {
  private readonly db = inject(FIRESTORE_DB);
  private readonly logger = inject(LoggerService);

  readonly busy = signal(false);
  readonly lastRun = signal<string | null>(null);
  readonly probes = signal<Probe[]>([]);
  readonly collections = signal<CollectionStat[]>([]);
  readonly activityWindow24h = signal<number | null>(null);
  readonly lastAuditAt = signal<Date | null>(null);
  readonly lastAuditAction = signal<string>('—');
  readonly activeTenants = signal<Set<string>>(new Set());

  readonly okCount = computed(() => this.probes().filter((p) => p.status === 'ok').length);
  readonly warnCount = computed(() => this.probes().filter((p) => p.status === 'warn').length);
  readonly koCount = computed(() => this.probes().filter((p) => p.status === 'ko').length);

  readonly globalStatus = computed<Status>(() => {
    if (this.koCount() > 0) return 'ko';
    if (this.warnCount() > 0) return 'warn';
    if (this.probes().length === 0) return 'warn';
    return 'ok';
  });

  readonly globalStatusLabel = computed(() => {
    const s = this.globalStatus();
    return s === 'ok' ? 'OPÉRATIONNEL' : s === 'warn' ? 'DÉGRADÉ' : 'INCIDENT';
  });

  readonly lastAuditLabel = computed(() => {
    const d = this.lastAuditAt();
    if (!d) return '—';
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffMin < 1440) return `il y a ${Math.round(diffMin / 60)} h`;
    return `il y a ${Math.round(diffMin / 1440)} j`;
  });

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const probes: Probe[] = [];
      const collections: CollectionStat[] = [];

      // 1. Latence Firestore (ping simple)
      const tPing = Date.now();
      try {
        await getCountFromServer(query(collection(this.db, 'organizations'), limit(1)));
        const ms = Date.now() - tPing;
        probes.push({
          key: 'ping',
          label: 'Latence Firestore',
          status: ms < 500 ? 'ok' : ms < 1500 ? 'warn' : 'ko',
          value: `${ms} ms`,
          hint: ms < 500 ? 'Excellent' : ms < 1500 ? 'Élevé — vérifier la région' : 'Critique',
          durationMs: ms,
        });
      } catch (err) {
        probes.push({
          key: 'ping',
          label: 'Latence Firestore',
          status: 'ko',
          value: 'KO',
          hint: (err as Error).message ?? 'Erreur connexion',
          durationMs: Date.now() - tPing,
        });
      }

      // 2. Compte par collection
      const colsToCheck = [
        { name: 'organizations', warn: 0, ko: -1 },
        { name: 'users', warn: 0, ko: -1 },
        { name: 'orgMembers', warn: 0, ko: -1 },
        { name: 'dossiers', warn: 0, ko: -1 },
        { name: 'payments', warn: 0, ko: -1 },
        { name: 'auditLogs', warn: 0, ko: -1 },
        { name: 'notifications', warn: 0, ko: -1 },
      ];
      for (const c of colsToCheck) {
        const t = Date.now();
        try {
          const r = await getCountFromServer(collection(this.db, c.name));
          const count = r.data().count ?? 0;
          collections.push({
            name: c.name,
            count,
            status: 'ok',
            durationMs: Date.now() - t,
            error: null,
          });
        } catch (err) {
          collections.push({
            name: c.name,
            count: 0,
            status: 'ko',
            durationMs: Date.now() - t,
            error: (err as Error).message ?? 'Erreur',
          });
        }
      }

      // 3. Probe : organisations actives ratio
      const orgs = collections.find((c) => c.name === 'organizations');
      if (orgs && orgs.count > 0) {
        const tA = Date.now();
        try {
          const active = await getCountFromServer(
            query(collection(this.db, 'organizations'), where('status', '==', 'active')),
          );
          const ratio = (active.data().count ?? 0) / orgs.count;
          probes.push({
            key: 'org-active',
            label: 'Tenants actifs',
            status: ratio > 0.6 ? 'ok' : ratio > 0.3 ? 'warn' : 'ko',
            value: `${active.data().count ?? 0}/${orgs.count} (${Math.round(ratio * 100)}%)`,
            hint: ratio > 0.6 ? null : 'Beaucoup de tenants suspendus/archivés',
            durationMs: Date.now() - tA,
          });
        } catch (err) {
          probes.push({
            key: 'org-active', label: 'Tenants actifs', status: 'ko', value: 'KO',
            hint: (err as Error).message ?? 'Erreur', durationMs: Date.now() - tA,
          });
        }
      }

      // 4. Activité audit 24h
      const t24 = Date.now();
      const cutoff = Timestamp.fromDate(new Date(Date.now() - 86_400_000));
      let activity24 = 0;
      let lastDate: Date | null = null;
      let lastAction = '—';
      const tenants = new Set<string>();
      try {
        const cnt = await getCountFromServer(
          query(collection(this.db, 'auditLogs'), where('createdAt', '>=', cutoff)),
        );
        activity24 = cnt.data().count ?? 0;

        // Dernier évènement détaillé
        const lastSnap = await getDocs(
          query(collection(this.db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(50)),
        );
        for (const d of lastSnap.docs) {
          const x = d.data() as Record<string, unknown>;
          const created = (x['createdAt'] as Timestamp | undefined)?.toDate?.();
          if (created && (!lastDate || created > lastDate)) {
            lastDate = created;
            lastAction = (x['action'] as string | undefined) ?? '—';
          }
          const t = x['tenantId'] as string | undefined;
          if (t && created && created.getTime() > Date.now() - 86_400_000) tenants.add(t);
        }

        probes.push({
          key: 'audit-24h',
          label: 'Audit 24 h',
          status: activity24 > 0 ? 'ok' : 'warn',
          value: `${activity24} évènement(s)`,
          hint: activity24 === 0 ? 'Aucune activité — vérifier les writers' : null,
          durationMs: Date.now() - t24,
        });
      } catch (err) {
        probes.push({
          key: 'audit-24h', label: 'Audit 24 h', status: 'ko', value: 'KO',
          hint: (err as Error).message ?? 'Erreur', durationMs: Date.now() - t24,
        });
      }

      // 5. Probe : paiements failed récents
      const tPay = Date.now();
      try {
        const failed = await getCountFromServer(
          query(collection(this.db, 'payments'), where('status', '==', 'failed')),
        );
        const f = failed.data().count ?? 0;
        probes.push({
          key: 'pay-failed',
          label: 'Paiements en échec',
          status: f === 0 ? 'ok' : f < 10 ? 'warn' : 'ko',
          value: `${f}`,
          hint: f === 0 ? null : `${f} paiement(s) à inspecter`,
          durationMs: Date.now() - tPay,
        });
      } catch (err) {
        probes.push({
          key: 'pay-failed', label: 'Paiements en échec', status: 'warn', value: 'N/A',
          hint: 'Index/regle manquante', durationMs: Date.now() - tPay,
        });
      }

      // 6. Probe : notifications failed
      const tNotif = Date.now();
      try {
        const failed = await getCountFromServer(
          query(collection(this.db, 'notifications'), where('status', '==', 'failed')),
        );
        const f = failed.data().count ?? 0;
        probes.push({
          key: 'notif-failed',
          label: 'Notifications en échec',
          status: f === 0 ? 'ok' : f < 20 ? 'warn' : 'ko',
          value: `${f}`,
          hint: f === 0 ? null : 'Utiliser le rejeu depuis le tenant',
          durationMs: Date.now() - tNotif,
        });
      } catch (err) {
        probes.push({
          key: 'notif-failed', label: 'Notifications en échec', status: 'warn', value: 'N/A',
          hint: 'Index/regle manquante', durationMs: Date.now() - tNotif,
        });
      }

      this.probes.set(probes);
      this.collections.set(collections);
      this.activityWindow24h.set(activity24);
      this.lastAuditAt.set(lastDate);
      this.lastAuditAction.set(lastAction);
      this.activeTenants.set(tenants);
      this.lastRun.set(new Date().toLocaleTimeString('fr-FR'));
    } catch (err) {
      this.logger.error('SuperAdminHealth refresh failed', err);
    } finally {
      this.busy.set(false);
    }
  }
}
