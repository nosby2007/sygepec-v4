import { computed, inject, Injectable, signal } from '@angular/core';

import { AuthContextService } from '../auth/auth-context.service';
import type { ActorRef } from '../models/canonical/base.entity';
import type {
  AuditDraft,
  AuditDraftDocumentItem,
} from '../models/canonical/audit-draft.model';
import type { DossierRiskFlag } from '../models/canonical/dossier.model';
import { AuditDraftRepository } from '../repositories/audit-draft.repository';
import { AuditPromotionService } from '../services/audit-promotion.service';
/**
 * AuditWizardStore — façade signal-based pour le wizard d'audit premium (Lot D).
 *
 * Responsabilités :
 *  - Charger/créer un draft pour le user courant (status='draft').
 *  - Exposer un état réactif (currentStep, completedSteps, answers, …).
 *  - Sérialiser les autosaves serveur (debounce léger) sans bloquer la UI.
 *  - Soumettre / abandonner un draft.
 *
 * Hors-périmètre Lot D :
 *  - Aucun upload (Lot F).
 *  - Aucune promotion vers Dossier/DossierDocument/Checklist (Lot G).
 *  - Aucune mutation de schéma legacy (le `AuditDraftService` localStorage
 *    existant reste intact).
 */
@Injectable({ providedIn: 'root' })
export class AuditWizardStore {
  private readonly repo = inject(AuditDraftRepository);
  private readonly authCtx = inject(AuthContextService);
  private readonly promotion = inject(AuditPromotionService);

  // ────────────────────────────── État ──────────────────────────────────────
  private readonly _draft = signal<AuditDraft | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _saving = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly draft = this._draft.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();

  readonly currentStep = computed(() => this._draft()?.currentStep ?? null);
  readonly completedSteps = computed(() => this._draft()?.completedSteps ?? []);
  readonly answers = computed(() => this._draft()?.answers ?? {});
  readonly readinessScore = computed(() => this._draft()?.readinessScore ?? null);
  readonly riskFlags = computed(() => this._draft()?.riskFlags ?? []);
  readonly documentIntake = computed(() => this._draft()?.documentIntake ?? []);
  readonly status = computed(() => this._draft()?.status ?? null);
  readonly isSubmitted = computed(() => this._draft()?.status === 'submitted');

  // ───────────────────────── Autosave debounce ──────────────────────────────
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTOSAVE_DEBOUNCE_MS = 800;

  // ──────────────────────── Lifecycle / loading ─────────────────────────────

  /**
   * Charge le draft actif du user (le plus récent, status='draft'),
   * en crée un nouveau si aucun n'existe.
   */
  async loadOrCreate(): Promise<AuditDraft | null> {
    const uid = this.authCtx.uid();
    if (!uid) {
      this._error.set('not-authenticated');
      return null;
    }

    this._loading.set(true);
    this._error.set(null);
    try {
      const existing = await this.repo.findActiveDraft(uid);
      if (existing) {
        this._draft.set(existing);
        return existing;
      }

      const ctx = this.authCtx.context();
      const auditId = await this.repo.createDraft(
        uid,
        { tenantId: ctx.tenantId, orgId: ctx.orgId },
        this.actor(),
      );
      const created = await this.repo.getForUser(uid, auditId);
      this._draft.set(created);
      return created;
    } catch (err) {
      this._error.set(this.toMessage(err));
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  /** Recharge depuis Firestore le draft courant (utile après merge serveur). */
  async refresh(): Promise<void> {
    const uid = this.authCtx.uid();
    const current = this._draft();
    if (!uid || !current) return;
    const fresh = await this.repo.getForUser(uid, current.id);
    if (fresh) this._draft.set(fresh);
  }

  // ──────────────────────────── Mutations ───────────────────────────────────

  /**
   * Pose une réponse pour une question donnée et déclenche un autosave debounced.
   * `value` est volontairement `unknown` (validation côté wizard).
   */
  patchAnswer(key: string, value: unknown): void {
    const draft = this._draft();
    if (!draft || draft.status !== 'draft') return;
    const next: AuditDraft = {
      ...draft,
      answers: { ...draft.answers, [key]: value },
      lastSavedAt: Date.now(),
    };
    this._draft.set(next);
    this.scheduleAutosave({ answers: next.answers });
  }

  /** Met à jour plusieurs champs de progression d'un coup. */
  patchProgress(patch: {
    currentStep?: string;
    completedSteps?: string[];
    readinessScore?: number | null;
    riskFlags?: DossierRiskFlag[];
    auditSummary?: string | null;
  }): void {
    const draft = this._draft();
    if (!draft || draft.status !== 'draft') return;
    const next: AuditDraft = {
      ...draft,
      ...patch,
      lastSavedAt: Date.now(),
    };
    this._draft.set(next);
    this.scheduleAutosave(patch);
  }

  /** Met à jour la liste documentaire intermédiaire. */
  setDocumentIntake(items: AuditDraftDocumentItem[]): void {
    const draft = this._draft();
    if (!draft || draft.status !== 'draft') return;
    this._draft.set({ ...draft, documentIntake: items, lastSavedAt: Date.now() });
    this.scheduleAutosave({ documentIntake: items });
  }

  /** Force un flush immédiat de l'autosave en attente. */
  async flush(): Promise<void> {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    const draft = this._draft();
    const uid = this.authCtx.uid();
    if (!draft || !uid || draft.status !== 'draft') return;
    await this.persist(uid, draft.id, {
      currentStep: draft.currentStep,
      completedSteps: draft.completedSteps,
      answers: draft.answers,
      documentIntake: draft.documentIntake ?? [],
      readinessScore: draft.readinessScore ?? null,
      riskFlags: draft.riskFlags ?? [],
      auditSummary: draft.auditSummary ?? null,
    });
  }

  /** Soumet le draft (transition draft → submitted). Idempotent côté UI. */
  async submit(): Promise<boolean> {
    const draft = this._draft();
    const uid = this.authCtx.uid();
    if (!draft || !uid) return false;
    if (draft.status === 'submitted') return true;
    if (draft.status !== 'draft') return false;

    await this.flush();

    this._saving.set(true);
    this._error.set(null);
    try {
      // Lot G — promotion canonique (Dossier + Documents + Checklist + Profile +
      // AuditLog + Notification) avant le flip de status='submitted'.
      // Le service fait lui-même `submitDraft` à la toute fin (étape 9).
      const result = await this.promotion.promote(draft.id);
      if (!result.ok) {
        this._error.set(result.error ?? 'promotion-failed');
        return false;
      }
      await this.refresh();
      return this._draft()?.status === 'submitted';
    } catch (err) {
      this._error.set(this.toMessage(err));
      return false;
    } finally {
      this._saving.set(false);
    }
  }

  /** Marque le draft comme abandonné. */
  async abandon(): Promise<boolean> {
    const draft = this._draft();
    const uid = this.authCtx.uid();
    if (!draft || !uid) return false;
    if (draft.status !== 'draft') return false;

    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }

    this._saving.set(true);
    this._error.set(null);
    try {
      await this.repo.abandonDraft(uid, draft.id, this.actor());
      await this.refresh();
      return true;
    } catch (err) {
      this._error.set(this.toMessage(err));
      return false;
    } finally {
      this._saving.set(false);
    }
  }

  /** Réinitialise l'état local (n'efface PAS le serveur). */
  reset(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this._draft.set(null);
    this._error.set(null);
    this._saving.set(false);
    this._loading.set(false);
  }

  // ──────────────────────────── Internes ────────────────────────────────────

  private scheduleAutosave(patch: Parameters<AuditDraftRepository['updateDraft']>[2]): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      const draft = this._draft();
      const uid = this.authCtx.uid();
      if (!draft || !uid || draft.status !== 'draft') return;
      void this.persist(uid, draft.id, patch);
    }, this.AUTOSAVE_DEBOUNCE_MS);
  }

  private async persist(
    uid: string,
    auditId: string,
    patch: Parameters<AuditDraftRepository['updateDraft']>[2],
  ): Promise<void> {
    this._saving.set(true);
    try {
      await this.repo.updateDraft(uid, auditId, patch, this.actor());
    } catch (err) {
      this._error.set(this.toMessage(err));
    } finally {
      this._saving.set(false);
    }
  }

  private actor(): ActorRef | null {
    const ctx = this.authCtx.context();
    if (!ctx.uid) return null;
    return { uid: ctx.uid, role: ctx.role };
  }

  private toMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const m = (err as { message?: unknown }).message;
      if (typeof m === 'string') return m;
    }
    return 'unknown-error';
  }
}
