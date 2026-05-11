import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { LoggerService } from '../../../core/logging/logger.service';
import { AuditLogsRepository } from '../../admin/data/audit-logs.repository';

interface FlagRow {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
  isBuiltIn: boolean;
}

const BUILTIN: Array<Pick<FlagRow, 'key' | 'label' | 'description'>> = [
  { key: 'aiIntake', label: 'AI Intake widget', description: "Widget conversationnel public d'orientation immigration." },
  { key: 'byom', label: 'Bring Your Own Model', description: 'Permettre aux tenants de configurer leur propre fournisseur AI.' },
  { key: 'travelManual', label: 'Travel manuel', description: 'Demandes de vol/hébergement traitées manuellement par SYGEPEC.' },
  { key: 'trainingReferrals', label: 'Référencement training', description: 'Recommander des formations Innovacare Training.' },
  { key: 'humanReviewSLA', label: 'SLA revue humaine 24h', description: 'Garantir une revue humaine sous 24h ouvrables.' },
  { key: 'paymentsHybrid', label: 'Paiements hybrides', description: 'Activer Stripe + CinetPay sur le tenant.' },
  { key: 'analyticsCohort', label: 'Cohortes & rétention', description: 'Activer le panneau de cohortes dans le détail tenant.' },
];

@Component({
  standalone: true,
  selector: 'app-super-admin-feature-flags',
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sa">
      <header class="sa__hd">
        <a routerLink="/super-admin" class="back">← Super Admin</a>
        <h1>🚦 Feature flags & paramètres</h1>
        <p>Activation progressive de modules. Persisté dans <code>systemSettings/featureFlags</code>. Chaque modification est tracée.</p>
        <div class="actions">
          <button type="button" class="btn btn--mini" (click)="reload()" [disabled]="loading()">
            {{ loading() ? '…' : '↻ Recharger' }}
          </button>
          <button type="button" class="btn btn--mini btn--accent" (click)="toggleAddOpen()" [disabled]="busy()">
            {{ addOpen() ? '✕ Annuler' : '+ Ajouter un flag personnalisé' }}
          </button>
        </div>
      </header>

      @if (addOpen()) {
        <article class="card add-card">
          <h3>Nouveau flag</h3>
          <div class="add-form">
            <label class="field">
              <span>Clé (camelCase)</span>
              <input type="text" placeholder="myCustomFlag" [(ngModel)]="newFlag.key" />
            </label>
            <label class="field">
              <span>Label</span>
              <input type="text" placeholder="Mon nouveau flag" [(ngModel)]="newFlag.label" />
            </label>
            <label class="field field--wide">
              <span>Description</span>
              <input type="text" placeholder="Décrire l'usage…" [(ngModel)]="newFlag.description" />
            </label>
            <button type="button" class="btn btn--accent" (click)="addFlag()" [disabled]="!canAdd() || busy()">
              ✓ Créer
            </button>
          </div>
          @if (addError()) { <p class="err">{{ addError() }}</p> }
        </article>
      }

      @if (loading()) {
        <p class="muted">Chargement des flags…</p>
      } @else {
        <div class="grid">
          @for (f of flags(); track f.key) {
            <article class="card flag" [class.on]="f.enabled">
              <header>
                <strong>{{ f.label }}</strong>
                <button type="button" class="toggle" (click)="toggle(f)" [disabled]="busy()">
                  {{ f.enabled ? '● Activé' : '○ Désactivé' }}
                </button>
              </header>
              <p>{{ f.description }}</p>
              <footer>
                <code>{{ f.key }}</code>
                @if (f.isBuiltIn) { <span class="chip">built-in</span> } @else {
                  <button type="button" class="btn-del" (click)="removeFlag(f)" [disabled]="busy()">Supprimer</button>
                }
              </footer>
              @if (f.updatedAt) {
                <small class="muted-mini">MAJ {{ formatDate(f.updatedAt) }} @if (f.updatedBy) { · {{ f.updatedBy }} }</small>
              }
            </article>
          }
        </div>
        @if (flagMsg()) { <p class="msg">{{ flagMsg() }}</p> }
      }
    </section>
  `,
  styles: [`
    :host { display:block; padding:32px clamp(16px,4vw,48px); background:#F6F9FC; min-height:100%; }
    .sa { max-width:1200px; margin:0 auto; }
    .sa__hd { background:linear-gradient(135deg,#0B1F3A,#123C69); color:#fff; border-radius:24px; padding:28px; margin-bottom:20px; }
    .back { color:#F5B841; text-decoration:none; font-size:.85rem; }
    h1 { margin:8px 0; }
    .sa__hd code { background:rgba(255,255,255,.12); padding:2px 8px; border-radius:6px; font-size:.78rem; }
    .actions { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; }
    .btn { padding:8px 14px; border:1px solid #CBD5E1; background:#fff; border-radius:10px; cursor:pointer; font:inherit; color:#0B1F3A; font-weight:600; }
    .btn:hover:not(:disabled) { border-color:#F5B841; background:#FFFBEA; }
    .btn:disabled { opacity:.55; cursor:not-allowed; }
    .btn--mini { padding:6px 12px; font-size:.8rem; }
    .btn--accent { background:#F5B841; border-color:#F5B841; color:#0B1F3A; }
    .btn--accent:hover:not(:disabled) { background:#E0A82E; }
    .add-card { margin-bottom:16px; border-left:4px solid #F5B841; }
    .add-card h3 { margin:0 0 12px; color:#0B1F3A; }
    .add-form { display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:10px; align-items:end; }
    .add-form .field--wide { grid-column:span 2; }
    .field { display:flex; flex-direction:column; gap:4px; }
    .field span { font-size:.7rem; color:#64748b; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }
    .field input { padding:8px 10px; border:1px solid #E2E8F0; border-radius:8px; font:inherit; background:#F8FAFC; }
    .field input:focus { outline:none; border-color:#F5B841; background:#fff; }
    .err { color:#B91C1C; font-size:.82rem; margin:8px 0 0; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; }
    .card { background:#fff; padding:18px 20px; border-radius:16px; box-shadow:0 4px 14px rgba(11,31,58,.05); }
    .flag { border-left:4px solid #CBD5E1; transition:border-color .15s; }
    .flag.on { border-left-color:#16A34A; }
    .flag header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; }
    .flag header strong { color:#0B1F3A; }
    .toggle { background:#F1F5F9; border:0; padding:6px 14px; border-radius:999px; font-size:.75rem; cursor:pointer; font-weight:700; color:#64748b; transition:background .15s; }
    .toggle:hover:not(:disabled) { background:#E2E8F0; }
    .flag.on .toggle { background:#DCFCE7; color:#166534; }
    .flag p { margin:4px 0 8px; color:#475569; font-size:.88rem; line-height:1.45; }
    .flag footer { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px; }
    .flag code { background:#F1F5F9; padding:2px 8px; border-radius:6px; font-size:.7rem; color:#334155; }
    .chip { background:#E2E8F0; color:#475569; padding:2px 8px; border-radius:10px; font-size:.65rem; font-weight:700; text-transform:uppercase; }
    .btn-del { background:transparent; border:0; color:#B91C1C; font-size:.72rem; cursor:pointer; font-weight:600; padding:0; margin-left:auto; }
    .btn-del:hover:not(:disabled) { text-decoration:underline; }
    .muted { color:#64748b; padding:24px; text-align:center; }
    .muted-mini { color:#94a3b8; font-size:.7rem; display:block; margin-top:8px; }
    .msg { color:#0B1F3A; font-weight:600; margin-top:14px; padding:10px 14px; background:#FFFBEA; border-radius:10px; border:1px solid #F5B841; }
  `],
})
export class SuperAdminFeatureFlagsComponent {
  private readonly db = inject(FIRESTORE_DB);
  private readonly logger = inject(LoggerService);
  private readonly audit = inject(AuditLogsRepository);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly flags = signal<FlagRow[]>([]);
  readonly flagMsg = signal<string | null>(null);
  readonly addOpen = signal(false);
  readonly addError = signal<string | null>(null);

  newFlag = { key: '', label: '', description: '' };

  readonly canAdd = computed(() => {
    const k = this.newFlag.key.trim();
    return /^[a-z][a-zA-Z0-9_]+$/.test(k) && this.newFlag.label.trim().length >= 3;
  });

  constructor() {
    void this.reload();
  }

  toggleAddOpen(): void {
    this.addOpen.update((v) => !v);
    this.addError.set(null);
    this.newFlag = { key: '', label: '', description: '' };
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const snap = await getDocs(collection(this.db, 'systemSettings/featureFlags/items'));
      const stored = new Map<string, FlagRow>();
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        stored.set(d.id, {
          key: d.id,
          label: (x['label'] as string | undefined) ?? d.id,
          description: (x['description'] as string | undefined) ?? '',
          enabled: x['enabled'] === true,
          updatedAt: (x['updatedAt'] as Timestamp | undefined)?.toDate?.() ?? null,
          updatedBy: (x['updatedBy'] as string | undefined) ?? null,
          isBuiltIn: BUILTIN.some((b) => b.key === d.id),
        });
      }
      // Merger built-ins manquants (par défaut désactivés)
      const merged: FlagRow[] = [];
      for (const b of BUILTIN) {
        const existing = stored.get(b.key);
        merged.push(existing ?? {
          key: b.key, label: b.label, description: b.description,
          enabled: false, updatedAt: null, updatedBy: null, isBuiltIn: true,
        });
      }
      // Ajouter les flags personnalisés
      for (const [k, v] of stored.entries()) {
        if (!BUILTIN.some((b) => b.key === k)) merged.push(v);
      }
      this.flags.set(merged);
    } catch (err) {
      this.logger.error('FeatureFlags reload failed', err);
      this.flagMsg.set("✗ Lecture des flags impossible (vérifier les règles).");
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(f: FlagRow): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.flagMsg.set(null);
    const next = !f.enabled;
    try {
      await setDoc(doc(this.db, 'systemSettings/featureFlags/items', f.key), {
        label: f.label,
        description: f.description,
        enabled: next,
        updatedAt: serverTimestamp(),
        updatedBy: 'super-admin',
      }, { merge: true });
      await this.safeAudit(next ? 'FEATURE_FLAG_ENABLED' : 'FEATURE_FLAG_DISABLED', f.key, { label: f.label });
      this.flagMsg.set(`✓ Flag « ${f.label} » ${next ? 'activé' : 'désactivé'}.`);
      await this.reload();
    } catch (err) {
      this.logger.error('toggle flag failed', err);
      this.flagMsg.set(`✗ Impossible de modifier « ${f.label} ».`);
    } finally {
      this.busy.set(false);
    }
  }

  async addFlag(): Promise<void> {
    if (!this.canAdd() || this.busy()) return;
    this.busy.set(true);
    this.addError.set(null);
    const key = this.newFlag.key.trim();
    try {
      // Vérifier collision
      if (this.flags().some((f) => f.key === key)) {
        this.addError.set('Cette clé existe déjà.');
        return;
      }
      await setDoc(doc(this.db, 'systemSettings/featureFlags/items', key), {
        label: this.newFlag.label.trim(),
        description: this.newFlag.description.trim(),
        enabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: 'super-admin',
      });
      await this.safeAudit('FEATURE_FLAG_CREATED', key, { label: this.newFlag.label.trim() });
      this.flagMsg.set(`✓ Flag « ${this.newFlag.label} » créé (désactivé par défaut).`);
      this.addOpen.set(false);
      this.newFlag = { key: '', label: '', description: '' };
      await this.reload();
    } catch (err) {
      this.logger.error('addFlag failed', err);
      this.addError.set("Création refusée (vérifier droits ou collision).");
    } finally {
      this.busy.set(false);
    }
  }

  async removeFlag(f: FlagRow): Promise<void> {
    if (f.isBuiltIn || this.busy()) return;
    if (!confirm(`Supprimer le flag « ${f.label} » ?`)) return;
    this.busy.set(true);
    try {
      await deleteDoc(doc(this.db, 'systemSettings/featureFlags/items', f.key));
      await this.safeAudit('FEATURE_FLAG_DELETED', f.key, { label: f.label });
      this.flagMsg.set(`✓ Flag « ${f.label} » supprimé.`);
      await this.reload();
    } catch (err) {
      this.logger.error('removeFlag failed', err);
      this.flagMsg.set(`✗ Suppression échouée.`);
    } finally {
      this.busy.set(false);
    }
  }

  formatDate(d: Date): string {
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  private async safeAudit(action: string, key: string, meta: Record<string, unknown>): Promise<void> {
    try {
      await this.audit.log({
        action,
        targetType: 'systemSettings',
        targetId: `featureFlags/${key}`,
        meta,
      });
    } catch (err) {
      this.logger.warn('feature flag audit failed', { action, err });
    }
  }
}
