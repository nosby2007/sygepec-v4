import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { AssessmentAiService } from '../services/assessment-ai.service';
import { AuditDraftService } from '../services/audit-draft.service';
import {
  AssessmentAnswers,
  AssessmentStep,
  SummaryResult,
} from '../models/assessment.models';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { AuthService } from '../../../core/auth/auth-state.service';
import { LoggerService } from '../../../core/logging/logger.service';
import { SygepecDataService } from '../../../core/services/sygepec-data.service';

// ─── Step Definitions ────────────────────────────────────────────────────────

const ASSESSMENT_STEPS: AssessmentStep[] = [
  // Step 1: Destination
  {
    id: 'destination',
    type: 'question',
    title: 'Vers quel pays veux-tu construire ton projet ?',
    subtitle: 'Choisis ta destination principale. Si tu n\'es pas encore sûr, sélectionne "Je ne sais pas encore".',
    fieldKey: 'destinationCountry',
    inputType: 'cards',
    required: true,
    options: [
      { label: 'Canada', value: 'canada', icon: '🍁', description: 'Immigration économique, études, travail' },
      { label: 'États-Unis', value: 'usa', icon: '🇺🇸', description: 'Visas travail, études, licensing' },
      { label: 'UAE / Dubaï', value: 'uae', icon: '🇦🇪', description: 'Emploi, DHA/MOH, professions réglementées' },
      { label: 'Qatar', value: 'qatar', icon: '🇶🇦', description: 'QCHP, emploi, professions réglementées' },
      { label: 'Europe', value: 'europe', icon: '🇪🇺', description: 'France, Allemagne, Belgique, Portugal...' },
      { label: 'Je ne sais pas encore', value: 'unknown', icon: '🌍', description: 'SYGEPEC analysera les meilleures options' },
    ],
  },

  // Step 2: AI Country Explanation
  {
    id: 'country_info',
    type: 'ai_info',
    title: '',
    ctaLabel: 'Continuer',
  },

  // Step 3: Audit awareness
  {
    id: 'audit_awareness',
    type: 'question',
    title: 'As-tu déjà fait ton audit personnel pour cette destination ?',
    subtitle: 'L\'audit personnel permet de savoir si ton profil est prêt avant de commencer à payer des procédures.',
    fieldKey: 'auditAwareness',
    inputType: 'cards',
    required: true,
    options: [
      { label: 'Oui, déjà fait', value: 'yes', icon: '✅', description: 'J\'ai déjà analysé mon profil' },
      { label: 'Non, explique-moi', value: 'no', icon: '❓', description: 'Je veux comprendre ce que c\'est' },
      { label: 'Je ne suis pas sûr', value: 'unsure', icon: '🤔', description: 'Peut-être, mais pas certain' },
    ],
  },

  // Step 4: AI Audit explanation
  {
    id: 'audit_info',
    type: 'ai_info',
    title: '',
    ctaLabel: 'D\'accord, commençons mon audit',
  },

  // Step 5: Immigration goal
  {
    id: 'goal',
    type: 'question',
    title: 'Quel est ton objectif principal ?',
    subtitle: 'Cela nous permet de t\'orienter vers les meilleures voies selon ta situation.',
    fieldKey: 'immigrationGoal',
    inputType: 'cards',
    required: true,
    options: [
      { label: 'Étudier', value: 'study', icon: '🎓', description: 'Université, formation, diplôme reconnu' },
      { label: 'Travailler', value: 'work', icon: '💼', description: 'Emploi, visa travail, profession réglementée' },
      { label: 'Résidence permanente', value: 'permanent', icon: '🏠', description: 'S\'établir durablement' },
      { label: 'Rejoindre la famille', value: 'family', icon: '👨‍👩‍👧', description: 'Regroupement familial' },
      { label: 'Créer une entreprise', value: 'business', icon: '🚀', description: 'Entrepreneur, startup, investissement' },
      { label: 'Je ne sais pas encore', value: 'unknown', icon: '💡', description: 'SYGEPEC peut t\'aider à définir ton objectif' },
    ],
  },

  // Step 6: Identity
  {
    id: 'identity',
    type: 'form',
    title: 'Commençons par tes informations de base.',
    subtitle: 'Ces informations sont confidentielles et servent uniquement à construire ton dossier.',
    required: true,
    fields: [
      { key: 'fullName', label: 'Nom complet', inputType: 'text', placeholder: 'Ex: Jean-Paul Mbeki', required: true },
      { key: 'email', label: 'Adresse e-mail', inputType: 'email', placeholder: 'exemple@email.com', required: true },
      { key: 'phone', label: 'Téléphone / WhatsApp', inputType: 'phone', placeholder: '+237 6XX XXX XXX' },
      { key: 'nationality', label: 'Nationalité', inputType: 'text', placeholder: 'Ex: Camerounais(e)' },
      { key: 'residenceCountry', label: 'Pays de résidence actuel', inputType: 'text', placeholder: 'Ex: Cameroun' },
    ],
  },

  // Step 7: Personal profile
  {
    id: 'personal',
    type: 'form',
    title: 'Parlons de ton profil personnel.',
    subtitle: 'Ces informations aident à organiser ton dossier et anticiper certains documents.',
    fields: [
      { key: 'age', label: 'Âge', inputType: 'number', placeholder: 'Ex: 28' },
      {
        key: 'maritalStatus', label: 'Situation maritale', inputType: 'select',
        options: [
          { label: 'Célibataire', value: 'single' },
          { label: 'Marié(e)', value: 'married' },
          { label: 'Divorcé(e)', value: 'divorced' },
          { label: 'Veuf/veuve', value: 'widowed' },
        ],
      },
      { key: 'numberOfChildren', label: 'Nombre d\'enfants', inputType: 'number', placeholder: '0' },
      {
        key: 'passportValid', label: 'Passeport valide ?', inputType: 'select',
        options: [
          { label: 'Oui, valide plus de 6 mois', value: 'valid' },
          { label: 'Oui, mais expire bientôt', value: 'expiring' },
          { label: 'Non / pas encore', value: 'none' },
        ],
      },
    ],
  },

  // Step 8: Education
  {
    id: 'education',
    type: 'form',
    title: 'Quel est ton niveau d\'études ?',
    subtitle: 'Les diplômes et documents académiques sont souvent au cœur des dossiers d\'immigration.',
    fields: [
      {
        key: 'educationLevel', label: 'Niveau d\'études', inputType: 'select',
        options: [
          { label: 'Baccalauréat / High School', value: 'high_school' },
          { label: 'BTS / Diplôme', value: 'diploma' },
          { label: 'Licence / Bachelor', value: 'bachelor' },
          { label: 'Master', value: 'master' },
          { label: 'Doctorat', value: 'doctorate' },
          { label: 'Certificat professionnel', value: 'certificate' },
          { label: 'Autre', value: 'other' },
        ],
      },
      { key: 'fieldOfStudy', label: 'Domaine d\'études', inputType: 'text', placeholder: 'Ex: Infirmier, Génie civil, Finance' },
      { key: 'graduationYear', label: 'Année d\'obtention', inputType: 'number', placeholder: 'Ex: 2018' },
      {
        key: 'diplomaAvailable', label: 'Diplôme disponible ?', inputType: 'select',
        options: [{ label: 'Oui', value: 'yes' }, { label: 'Non', value: 'no' }, { label: 'En cours', value: 'pending' }],
      },
      {
        key: 'transcriptsAvailable', label: 'Relevés de notes disponibles ?', inputType: 'select',
        options: [{ label: 'Oui', value: 'yes' }, { label: 'Non', value: 'no' }],
      },
    ],
  },

  // Step 9: Work experience
  {
    id: 'experience',
    type: 'form',
    title: 'Quelle est ton expérience professionnelle ?',
    helperText: 'Les preuves d\'expérience peuvent être déterminantes pour certains parcours.',
    fields: [
      { key: 'profession', label: 'Profession / Métier', inputType: 'text', placeholder: 'Ex: Infirmier diplômé, Ingénieur logiciel' },
      { key: 'yearsExperience', label: 'Années d\'expérience', inputType: 'number', placeholder: 'Ex: 5' },
      {
        key: 'employmentStatus', label: 'Statut actuel', inputType: 'select',
        options: [
          { label: 'Employé(e)', value: 'employed' },
          { label: 'Indépendant(e)', value: 'self_employed' },
          { label: 'Chômeur / en recherche', value: 'unemployed' },
          { label: 'Étudiant(e)', value: 'student' },
        ],
      },
      {
        key: 'workExperienceLettersAvailable', label: 'Lettres d\'expérience disponibles ?', inputType: 'select',
        options: [{ label: 'Oui', value: 'yes' }, { label: 'Non', value: 'no' }, { label: 'Partiellement', value: 'partial' }],
      },
    ],
  },

  // Step 10: Language
  {
    id: 'language',
    type: 'form',
    title: 'As-tu un test de langue ou un niveau connu ?',
    subtitle: 'Le niveau de langue est souvent l\'un des critères les plus importants.',
    fields: [
      {
        key: 'frenchLevel', label: 'Niveau de français', inputType: 'select',
        options: [
          { label: 'Langue maternelle', value: 'native' },
          { label: 'Courant (B2-C1)', value: 'fluent' },
          { label: 'Intermédiaire (B1)', value: 'intermediate' },
          { label: 'Débutant', value: 'beginner' },
          { label: 'Aucun', value: 'none' },
        ],
      },
      {
        key: 'englishLevel', label: 'Niveau d\'anglais', inputType: 'select',
        options: [
          { label: 'Langue maternelle', value: 'native' },
          { label: 'Courant (B2-C1)', value: 'fluent' },
          { label: 'Intermédiaire (B1)', value: 'intermediate' },
          { label: 'Débutant', value: 'beginner' },
          { label: 'Aucun', value: 'none' },
        ],
      },
      {
        key: 'languageTestTaken', label: 'Test de langue passé ?', inputType: 'select',
        options: [{ label: 'Oui', value: 'yes' }, { label: 'Non', value: 'no' }, { label: 'Prévu', value: 'planned' }],
      },
      {
        key: 'languageTestType', label: 'Type de test', inputType: 'select',
        options: [
          { label: 'IELTS', value: 'ielts' },
          { label: 'OET', value: 'oet' },
          { label: 'TOEFL', value: 'toefl' },
          { label: 'TEF', value: 'tef' },
          { label: 'TCF', value: 'tcf' },
          { label: 'Aucun pour le moment', value: 'none' },
        ],
      },
      { key: 'languageScore', label: 'Score obtenu (si test passé)', inputType: 'text', placeholder: 'Ex: IELTS 6.5, TEF 400pts' },
    ],
  },

  // Step 11: Budget
  {
    id: 'budget',
    type: 'form',
    title: 'Quel budget as-tu prévu pour ton projet ?',
    helperText: 'Le budget ne sert pas à juger ton projet. Il aide à choisir un chemin réaliste et à anticiper les preuves financières.',
    fields: [
      { key: 'budgetAvailable', label: 'Budget estimé (USD)', inputType: 'currency', placeholder: 'Ex: 5000' },
      {
        key: 'proofOfFundsAvailable', label: 'Preuve de fonds disponible ?', inputType: 'select',
        options: [{ label: 'Oui', value: 'yes' }, { label: 'Non', value: 'no' }, { label: 'Partiellement', value: 'partial' }],
      },
      {
        key: 'sponsorAvailable', label: 'Sponsor ou garant financier ?', inputType: 'select',
        options: [{ label: 'Oui', value: 'yes' }, { label: 'Non', value: 'no' }],
      },
    ],
  },

  // Step 12: Documents
  {
    id: 'documents',
    type: 'multi_select',
    title: 'Quels documents as-tu déjà disponibles ?',
    subtitle: 'Sélectionne tous les documents que tu possèdes déjà.',
    fieldKey: 'documentsAvailable',
    required: false,
    options: [
      { label: 'Passeport', value: 'passport', icon: '🛂' },
      { label: 'Diplôme', value: 'diploma', icon: '🎓' },
      { label: 'Relevés de notes', value: 'transcripts', icon: '📄' },
      { label: 'Attestation de travail', value: 'work_letter', icon: '🏢' },
      { label: 'Acte de naissance', value: 'birth_cert', icon: '📋' },
      { label: 'Casier judiciaire', value: 'police_cert', icon: '⚖️' },
      { label: 'Preuve de fonds', value: 'proof_funds', icon: '💳' },
      { label: 'Test de langue', value: 'language_test', icon: '🗣️' },
      { label: 'CV', value: 'cv', icon: '📝' },
      { label: 'Aucun pour le moment', value: 'none', icon: '❌' },
    ],
  },

  // Step 13: Timeline
  {
    id: 'timeline',
    type: 'form',
    title: 'Quand aimerais-tu avancer dans ce projet ?',
    fields: [
      {
        key: 'desiredTimeline', label: 'Horizon souhaité', inputType: 'select',
        options: [
          { label: 'Dès que possible', value: 'asap' },
          { label: 'Dans 3 mois', value: '3months' },
          { label: 'Dans 6 mois', value: '6months' },
          { label: 'Dans 12 mois', value: '12months' },
          { label: 'Je ne sais pas encore', value: 'unknown' },
        ],
      },
      { key: 'preferredCityProvince', label: 'Ville/Province cible (optionnel)', inputType: 'text', placeholder: 'Ex: Toronto, Texas, Dubai, Doha...' },
      { key: 'notes', label: 'Notes additionnelles (optionnel)', inputType: 'textarea', placeholder: 'Parle-nous de ta situation particulière, tes contraintes, tes questions...' },
    ],
  },

  // Step 14: Summary
  {
    id: 'summary',
    type: 'summary',
    title: 'Voici ton premier profil SYGEPEC.',
    subtitle: 'Notre analyse basée sur tes réponses.',
  },

  {
    id: 'account_gate',
    type: 'account_gate',
    title: 'Finalisons ton espace SYGEPEC',
    subtitle: 'Crée ton espace pour sauvegarder définitivement ton dossier et continuer avec la revue humaine.',
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

@Component({
  selector: 'app-immigration-assessment-flow',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './immigration-assessment-flow.component.html',
  styleUrls: ['./immigration-assessment-flow.component.scss'],
})
export class ImmigrationAssessmentFlowComponent {
  private ai = inject(AssessmentAiService);
  private draft = inject(AuditDraftService);
  private authCtx = inject(AuthContextService);
  private authService = inject(AuthService);
  private data = inject(SygepecDataService);
  private logger = inject(LoggerService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  // ─── State ───────────────────────────────────────────────────────────────

  readonly steps = ASSESSMENT_STEPS;
  readonly totalSteps = ASSESSMENT_STEPS.length;

  currentIndex = signal(0);
  answers = signal<AssessmentAnswers>({});
  isCreatingCase = signal(false);
  caseCreated = signal(false);
  caseError = signal('');
  accountError = signal('');
  isRegistering = signal(false);

  // ─── Computed ────────────────────────────────────────────────────────────

  readonly currentStep = computed(() => this.steps[this.currentIndex()]);

  readonly progressPercent = computed(() =>
    Math.round(((this.currentIndex() + 1) / this.totalSteps) * 100)
  );

  readonly displayStepNumber = computed(() => this.currentIndex() + 1);

  readonly readinessScore = computed(() =>
    this.ai.calculateReadinessScore(this.answers())
  );

  readonly summary = computed<SummaryResult | null>(() => {
    if (this.currentStep().type !== 'summary') return null;
    return this.ai.generateSummary(this.answers());
  });

  readonly canProceed = computed(() => {
    const step = this.currentStep();
    const ans = this.answers();
    if (!step.required) return true;

    if (step.type === 'question' || step.type === 'multi_select') {
      const key = step.fieldKey as keyof AssessmentAnswers;
      const val = ans[key];
      if (Array.isArray(val)) return val.length > 0;
      return !!val;
    }

    if (step.type === 'form') {
      const requiredFields = (step.fields || []).filter(f => f.required);
      return requiredFields.every(f => !!ans[f.key as keyof AssessmentAnswers]);
    }

    return true;
  });

  readonly aiInfoContent = computed<SafeHtml>(() => {
    const step = this.currentStep();
    if (step.type !== 'ai_info') return '';
    const ans = this.answers();
    if (step.id === 'country_info') {
      return this.sanitizer.bypassSecurityTrustHtml(
        this.ai.getCountryInsight(ans.destinationCountry, ans)
      );
    }
    if (step.id === 'audit_info') {
      return this.sanitizer.bypassSecurityTrustHtml(
        this.ai.getAuditExplanation(ans.auditAwareness)
      );
    }
    return '';
  });

  readonly aiInfoCards = computed(() => {
    const step = this.currentStep();
    if (step.id === 'country_info') {
      return this.ai.getCountryInsightCards(this.answers().destinationCountry);
    }
    return [];
  });

  readonly aiInfoTitle = computed(() => {
    const step = this.currentStep();
    const ans = this.answers();
    if (step.id === 'country_info') {
      const labels: Record<string, string> = {
        canada: 'Très bon choix pour le Canada 🍁',
        usa: 'Les États-Unis — un parcours structuré 🇺🇸',
        uae: 'Émirats Arabes Unis / Dubaï 🇦🇪',
        qatar: 'Qatar — opportunités croissantes 🇶🇦',
        europe: 'Europe — diversité de destinations 🇪🇺',
        unknown: 'Pas encore sûr de ta destination ? 🌍',
      };
      return labels[ans.destinationCountry || ''] || 'Analyse de ta destination';
    }
    if (step.id === 'audit_info') {
      return ans.auditAwareness === 'yes'
        ? 'Parfait — tu as déjà fait ton audit ✅'
        : 'Qu\'est-ce qu\'un audit personnel immigration ?';
    }
    return step.title;
  });

  readonly readinessCategory = computed(() =>
    this.ai.getReadinessCategory(this.readinessScore())
  );

  readonly authUser = computed(() => this.authCtx.context().uid);
  readonly isAuthenticated = computed(() => !!this.authUser());
  readonly missingItems = computed(() => this.ai.calculateMissingItems(this.answers()));
  readonly recommendedPrograms = computed(() => this.ai.generateRecommendedPrograms(this.answers()));

  // ─── Navigation ──────────────────────────────────────────────────────────

  next(): void {
    if (this.currentIndex() < this.totalSteps - 1) {
      this.currentIndex.update(i => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  back(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  exit(): void {
    this.router.navigateByUrl('/public');
  }

  // ─── Answer handling ─────────────────────────────────────────────────────

  selectCard(fieldKey: string, value: string): void {
    this.answers.update(a => ({ ...a, [fieldKey]: value }));
  }

  isCardSelected(fieldKey: string, value: string): boolean {
    const ans = this.answers();
    return ans[fieldKey as keyof AssessmentAnswers] === value;
  }

  toggleMultiSelect(value: string): void {
    const step = this.currentStep();
    const key = step.fieldKey as keyof AssessmentAnswers;
    const current = (this.answers()[key] as string[] | undefined) || [];
    if (value === 'none') {
      this.answers.update(a => ({ ...a, [key]: ['none'] }));
      return;
    }
    const withoutNone = current.filter(v => v !== 'none');
    const idx = withoutNone.indexOf(value);
    const updated = idx >= 0
      ? withoutNone.filter(v => v !== value)
      : [...withoutNone, value];
    this.answers.update(a => ({ ...a, [key]: updated }));
  }

  isMultiSelected(value: string): boolean {
    const step = this.currentStep();
    const key = step.fieldKey as keyof AssessmentAnswers;
    const current = (this.answers()[key] as string[] | undefined) || [];
    return current.includes(value);
  }

  updateField(key: string, value: string | number): void {
    this.answers.update(a => ({ ...a, [key]: value }));
  }

  getFieldValue(key: string): string | number {
    const val = this.answers()[key as keyof AssessmentAnswers];
    return (val as string | number) || '';
  }

  // ─── Case creation ───────────────────────────────────────────────────────

  async createCase(forceUserId?: string): Promise<void> {
    this.persistDraft();

    const authenticatedUid = forceUserId || this.authUser();

    if (!authenticatedUid) {
      this.currentIndex.set(this.steps.findIndex(s => s.id === 'account_gate'));
      return;
    }

    this.isCreatingCase.set(true);
    this.caseError.set('');
    try {
      const uid = authenticatedUid;
      const summary = this.ai.generateSummary(this.answers());
      const draftPayload = {
        answers: this.answers(),
        readinessScore: this.readinessScore(),
        missingItems: this.missingItems(),
        recommendedPrograms: this.recommendedPrograms(),
        summary,
        userId: uid,
      };

      // Log preflight dev-only — aide au diagnostic permission-denied.
      const ctx = this.authCtx.context();
      this.logger.debug('createCase:preflight', {
        authUid: uid,
        ctxUid: ctx.uid,
        ctxTenantId: ctx.tenantId ?? null,
        ctxOrgId: (ctx as any).orgId ?? null,
        ctxRole: ctx.role ?? null,
        source: 'audit_wizard_legacy',
      });

      const lead = await this.data.createLeadFromAudit(draftPayload, uid);
      await this.data.createClientProfileFromAudit(uid, draftPayload);
      const createdCase = await this.data.createImmigrationCaseFromAudit(uid, { ...draftPayload, leadId: lead.id });
      if (!createdCase?.id) {
        throw new Error('Le dossier n\'a pas pu être créé (identifiant manquant).');
      }
      await this.data.createAuditResponse(createdCase.id, draftPayload);
      await this.data.createDocumentChecklist(createdCase.id, draftPayload);
      // Timeline = annexe : on tolère un échec sans casser le flux.
      try {
        await this.data.createTimelineEvent(createdCase.id, {
          orgId: 'sygepec-main',
          type: 'audit_completed',
          title: 'Audit personnel complété',
          description: 'Le dossier initial a été généré automatiquement depuis le parcours d\'audit.',
          actorId: uid,
        });
      } catch (timelineErr) {
        // eslint-disable-next-line no-console
        console.warn('[SYGEPEC] timeline event skipped', timelineErr);
      }

      this.draft.clearDraft();
      this.caseCreated.set(true);
      this.isCreatingCase.set(false);
      setTimeout(() => {
        this.router.navigateByUrl('/dashboard');
      }, 1500);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[SYGEPEC] createCase failed', err);
      const code = err?.code as string | undefined;
      let msg = err?.message || 'Impossible de créer le dossier pour le moment.';
      if (code === 'permission-denied') {
        msg = 'Permissions insuffisantes pour créer le dossier. Reconnectez-vous puis réessayez.';
      } else if (code === 'unavailable' || code === 'deadline-exceeded') {
        msg = 'Service Firestore indisponible. Vérifiez votre connexion puis réessayez.';
      }
      this.caseError.set(msg);
      this.isCreatingCase.set(false);
    }
  }

  async registerAndCreateCase(): Promise<void> {
    this.accountError.set('');
    const answers = this.answers();

    if (!answers.email || !answers.password || !answers.fullName) {
      this.accountError.set('Veuillez renseigner nom, email et mot de passe.');
      return;
    }

    if (answers.password !== answers.confirmPassword) {
      this.accountError.set('Les mots de passe ne correspondent pas.');
      return;
    }

    if (!answers.consentAccepted) {
      this.accountError.set('Veuillez accepter la clause d\'information.');
      return;
    }

    this.isRegistering.set(true);
    try {
      const user = await this.authService.register(answers.email, answers.password, answers.fullName, 'sygepec-main');
      await this.createCase(user.uid);
    } catch (e: any) {
      this.accountError.set(e?.message || 'Impossible de créer le compte pour le moment.');
    } finally {
      this.isRegistering.set(false);
    }
  }

  loginAndResume(): void {
    this.persistDraft();
    this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/start-audit', draft: 1 } });
  }

  persistDraft(): void {
    this.draft.saveDraft({
      currentStepIndex: this.currentIndex(),
      answers: this.answers(),
      readinessScore: this.readinessScore(),
      missingItems: this.missingItems(),
      recommendedPrograms: this.recommendedPrograms(),
      summary: this.ai.generateSummary(this.answers()),
    });
  }

  private restoreDraftIfAvailable(): void {
    const saved = this.draft.getDraft();
    if (!saved) return;
    this.answers.set(saved.answers || {});
    this.currentIndex.set(Math.min(saved.currentStepIndex || 0, this.totalSteps - 1));
  }

  bookReview(): void {
    this.router.navigateByUrl('/support');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  getReadinessBarColor(): string {
    const score = this.readinessScore();
    if (score >= 81) return '#16A34A';
    if (score >= 61) return '#14B8A6';
    if (score >= 31) return '#F59E0B';
    return '#DC2626';
  }

  trackByValue(_: number, opt: { value: string }): string {
    return opt.value;
  }

  trackByKey(_: number, field: { key: string }): string {
    return field.key;
  }

  constructor() {
    this.restoreDraftIfAvailable();

    effect(() => {
      this.answers();
      this.currentIndex();
      this.persistDraft();
    });

    this.route.queryParamMap.subscribe((q) => {
      if (q.get('resume') === '1' || q.get('draft') === '1') {
        this.restoreDraftIfAvailable();
      }
    });
  }
}
