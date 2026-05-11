import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { AuditWizardStore } from '../../../core/stores/audit-wizard.store';
import type { AuditDraftDocumentItem } from '../../../core/models/canonical/audit-draft.model';
import type { DossierImmigrationGoal } from '../../../core/models/canonical/dossier.model';

import {
  buildAuditSummary,
  buildIntakeCatalog,
  computeReadinessScore,
  computeRiskFlags,
  mergeIntakeWithExisting,
  type AuditWizardAnswers,
} from './audit-wizard-helpers';

type WizardStepId = 'profile' | 'goals' | 'documents' | 'review';

const STEP_ORDER: WizardStepId[] = ['profile', 'goals', 'documents', 'review'];

@Component({
  selector: 'sy-audit-wizard-premium-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-wizard-premium-page.component.html',
  styleUrls: ['./audit-wizard-premium-page.component.scss'],
})
export class AuditWizardPremiumPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authCtx = inject(AuthContextService);
  protected readonly store = inject(AuditWizardStore);

  // ─────────────────────────── State ────────────────────────────────────────
  protected readonly currentStep = signal<WizardStepId>('profile');
  protected readonly STEPS = STEP_ORDER;
  protected readonly stepIndex = computed(() => STEP_ORDER.indexOf(this.currentStep()));
  protected readonly isLastStep = computed(() => this.stepIndex() === STEP_ORDER.length - 1);
  protected readonly isFirstStep = computed(() => this.stepIndex() === 0);

  protected readonly submitInFlight = signal(false);
  protected readonly submitSuccess = signal(false);

  // ─────────────────────────── Forms ────────────────────────────────────────
  protected readonly profileForm = this.fb.nonNullable.group({
    fullName: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
    dateOfBirth: this.fb.nonNullable.control(''),
    nationality: this.fb.nonNullable.control('', Validators.required),
    countryOfResidence: this.fb.nonNullable.control('', Validators.required),
    phone: this.fb.nonNullable.control(''),
  });

  protected readonly goalsForm = this.fb.nonNullable.group({
    immigrationGoal: this.fb.nonNullable.control<DossierImmigrationGoal | ''>('', Validators.required),
    destinationCountry: this.fb.nonNullable.control('', Validators.required),
    secondaryDestinationCountry: this.fb.nonNullable.control(''),
    preferredTimeline: this.fb.nonNullable.control('6m'),
    urgencyLevel: this.fb.nonNullable.control<'low' | 'normal' | 'high' | 'urgent'>('normal'),
    previousVisaRefusal: this.fb.nonNullable.control(false),
    visaRefusalDetails: this.fb.nonNullable.control(''),
    currentImmigrationStatus: this.fb.nonNullable.control(''),
    passportValid: this.fb.nonNullable.control(true),
    passportExpirationDate: this.fb.nonNullable.control(''),
    proofOfFundsAvailable: this.fb.nonNullable.control(true),
    sponsorAvailable: this.fb.nonNullable.control(false),
  });

  // ────────────────────────── Computed ──────────────────────────────────────
  protected readonly answers = computed<AuditWizardAnswers>(() => {
    const draftAnswers = this.store.answers() as AuditWizardAnswers;
    return draftAnswers ?? {};
  });

  protected readonly intake = computed<AuditDraftDocumentItem[]>(() => this.store.documentIntake());

  protected readonly readinessScore = computed(() =>
    computeReadinessScore(this.answers(), this.intake()),
  );

  protected readonly riskFlags = computed(() =>
    computeRiskFlags(this.answers(), this.intake()),
  );

  protected readonly auditSummary = computed(() =>
    buildAuditSummary(this.answers(), this.readinessScore(), this.riskFlags()),
  );

  protected readonly requiredCount = computed(
    () => this.intake().filter((i) => i.required).length,
  );
  protected readonly readyCount = computed(
    () => this.intake().filter((i) => i.status === 'ready_to_upload' || i.status === 'uploaded').length,
  );

  // ───────────────────────── Lifecycle ──────────────────────────────────────
  constructor() {
    // Auto-load on entry. Si pas connecté → redirect login avec returnUrl.
    queueMicrotask(() => void this.bootstrap());

    // Sync forms ← store quand le draft est chargé.
    effect(() => {
      const draft = this.store.draft();
      if (!draft) return;
      const a = (draft.answers ?? {}) as AuditWizardAnswers;
      this.profileForm.patchValue(
        {
          fullName: a.fullName ?? '',
          dateOfBirth: a.dateOfBirth ?? '',
          nationality: a.nationality ?? '',
          countryOfResidence: a.countryOfResidence ?? '',
          phone: a.phone ?? '',
        },
        { emitEvent: false },
      );
      this.goalsForm.patchValue(
        {
          immigrationGoal: (a.immigrationGoal ?? '') as DossierImmigrationGoal | '',
          destinationCountry: a.destinationCountry ?? '',
          secondaryDestinationCountry: a.secondaryDestinationCountry ?? '',
          preferredTimeline: a.preferredTimeline ?? '6m',
          urgencyLevel: a.urgencyLevel ?? 'normal',
          previousVisaRefusal: a.previousVisaRefusal ?? false,
          visaRefusalDetails: a.visaRefusalDetails ?? '',
          currentImmigrationStatus: a.currentImmigrationStatus ?? '',
          passportValid: a.passportValid ?? true,
          passportExpirationDate: a.passportExpirationDate ?? '',
          proofOfFundsAvailable: a.proofOfFundsAvailable ?? true,
          sponsorAvailable: a.sponsorAvailable ?? false,
        },
        { emitEvent: false },
      );

      // Restaure l'étape courante depuis le draft (si déjà avancé).
      const remoteStep = draft.currentStep as WizardStepId;
      if (STEP_ORDER.includes(remoteStep) && this.currentStep() !== remoteStep) {
        this.currentStep.set(remoteStep);
      }
    });
  }

  private async bootstrap(): Promise<void> {
    if (this.authCtx.loading()) {
      // attendre 1 tick d'auth si en cours de chargement
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!this.authCtx.uid()) {
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: '/start-audit/premium' },
      });
      return;
    }
    await this.store.loadOrCreate();
  }

  // ───────────────────────── Step navigation ────────────────────────────────

  protected goToStep(step: WizardStepId): void {
    this.currentStep.set(step);
    this.store.patchProgress({ currentStep: step });
  }

  protected async nextStep(): Promise<void> {
    const step = this.currentStep();
    if (!this.persistCurrentStep(step)) return;

    const idx = this.stepIndex();
    if (idx < STEP_ORDER.length - 1) {
      const nextId = STEP_ORDER[idx + 1];
      const completed = Array.from(new Set([...(this.store.completedSteps() ?? []), step]));
      this.currentStep.set(nextId);
      this.store.patchProgress({ currentStep: nextId, completedSteps: completed });
      // Si on arrive à 'documents' et qu'on n'a pas d'intake : initialiser le catalogue
      if (nextId === 'documents' && this.intake().length === 0) {
        const catalog = buildIntakeCatalog(this.answers().immigrationGoal ?? null);
        this.store.setDocumentIntake(catalog);
      }
      // Si on arrive à 'review' : recalculer readiness/risk/summary
      if (nextId === 'review') {
        this.recomputeReviewSnapshot();
      }
    }
  }

  protected previousStep(): void {
    const idx = this.stepIndex();
    if (idx > 0) {
      this.currentStep.set(STEP_ORDER[idx - 1]);
      this.store.patchProgress({ currentStep: STEP_ORDER[idx - 1] });
    }
  }

  /**
   * Persiste l'étape courante dans le store. Retourne false si invalide.
   */
  private persistCurrentStep(step: WizardStepId): boolean {
    if (step === 'profile') {
      if (this.profileForm.invalid) {
        this.profileForm.markAllAsTouched();
        return false;
      }
      const v = this.profileForm.getRawValue();
      this.applyAnswers({
        fullName: v.fullName.trim(),
        dateOfBirth: v.dateOfBirth || null,
        nationality: v.nationality.trim(),
        countryOfResidence: v.countryOfResidence.trim(),
        phone: v.phone.trim() || null,
      });
      return true;
    }
    if (step === 'goals') {
      if (this.goalsForm.invalid) {
        this.goalsForm.markAllAsTouched();
        return false;
      }
      const v = this.goalsForm.getRawValue();
      this.applyAnswers({
        immigrationGoal: (v.immigrationGoal || null) as DossierImmigrationGoal | null,
        destinationCountry: v.destinationCountry.trim(),
        secondaryDestinationCountry: v.secondaryDestinationCountry.trim() || null,
        preferredTimeline: v.preferredTimeline,
        urgencyLevel: v.urgencyLevel,
        previousVisaRefusal: v.previousVisaRefusal,
        visaRefusalDetails: v.visaRefusalDetails.trim() || null,
        currentImmigrationStatus: v.currentImmigrationStatus.trim() || null,
        passportValid: v.passportValid,
        passportExpirationDate: v.passportExpirationDate || null,
        proofOfFundsAvailable: v.proofOfFundsAvailable,
        sponsorAvailable: v.sponsorAvailable,
      });
      // Re-merge intake avec nouveau goal pour ajuster les pièces attendues
      const next = buildIntakeCatalog(v.immigrationGoal as DossierImmigrationGoal | null);
      const merged = mergeIntakeWithExisting(next, this.intake());
      this.store.setDocumentIntake(merged);
      return true;
    }
    if (step === 'documents') {
      // documents : pas de validation bloquante, l'utilisateur peut soumettre incomplet
      return true;
    }
    return true;
  }

  private applyAnswers(patch: AuditWizardAnswers): void {
    const merged = { ...(this.store.answers() ?? {}), ...patch };
    // Astuce : patchAnswer ne fait que (key,value). On utilise un patch global via store interne.
    // On préfère passer par patchProgress + setter dédié → on n'expose pas ça côté store,
    // on injecte donc clé par clé.
    for (const [k, v] of Object.entries(patch)) {
      this.store.patchAnswer(k, v);
    }
    void merged;
  }

  // ─────────────────────── Documents intake actions ─────────────────────────

  protected toggleHave(item: AuditDraftDocumentItem): void {
    const next: AuditDraftDocumentItem[] = this.intake().map((i) => {
      if (i.category !== item.category) return i;
      const newStatus: AuditDraftDocumentItem['status'] =
        i.status === 'ready_to_upload' ? 'missing' : 'ready_to_upload';
      return { ...i, status: newStatus };
    });
    this.store.setDocumentIntake(next);
  }

  // ─────────────────────────── Review snapshot ──────────────────────────────
  private recomputeReviewSnapshot(): void {
    const score = this.readinessScore();
    const flags = this.riskFlags();
    const summary = this.auditSummary();
    this.store.patchProgress({
      readinessScore: score,
      riskFlags: flags,
      auditSummary: summary,
    });
  }

  // ─────────────────────────────── Submit ──────────────────────────────────
  protected async submit(): Promise<void> {
    if (this.submitInFlight()) return;
    this.recomputeReviewSnapshot();
    await this.store.flush();
    this.submitInFlight.set(true);
    const ok = await this.store.submit();
    this.submitInFlight.set(false);
    if (ok) {
      this.submitSuccess.set(true);
      // Marque l'étape review comme complétée
      const completed = Array.from(new Set([...(this.store.completedSteps() ?? []), 'review']));
      this.store.patchProgress({ completedSteps: completed });

      // Lot G — redirection vers l'espace documents du client après promotion
      // canonique (le service `AuditPromotionService` a créé le dossier et les
      // documents `requested`). Léger délai pour laisser le succès visible.
      setTimeout(() => {
        void this.router.navigate(['/client/documents']);
      }, 1500);
    }
  }

  protected isStepDone(step: WizardStepId): boolean {
    return (this.store.completedSteps() ?? []).includes(step);
  }

  protected stepLabel(step: WizardStepId): string {
    switch (step) {
      case 'profile': return 'Profil';
      case 'goals': return 'Objectif & risques';
      case 'documents': return 'Documents';
      case 'review': return 'Résumé';
    }
  }
}
