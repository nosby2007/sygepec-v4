import type { DocumentCategory } from '../../../core/models/canonical/dossier-document.model';
import type { DossierImmigrationGoal, DossierRiskFlag } from '../../../core/models/canonical/dossier.model';
import type { AuditDraftDocumentItem } from '../../../core/models/canonical/audit-draft.model';

/**
 * Helpers PURS pour le wizard premium (Lot E).
 * - Aucune dépendance Firebase / Angular.
 * - Aucune mutation : tout retourne de nouveaux objets.
 */

export interface AuditWizardAnswers {
  // profile
  fullName?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  countryOfResidence?: string | null;
  phone?: string | null;

  // immigration goals
  immigrationGoal?: DossierImmigrationGoal | null;
  destinationCountry?: string | null;
  secondaryDestinationCountry?: string | null;
  preferredTimeline?: string | null;
  urgencyLevel?: 'low' | 'normal' | 'high' | 'urgent' | null;

  // refusal history
  previousVisaRefusal?: boolean | null;
  visaRefusalDetails?: string | null;
  currentImmigrationStatus?: string | null;

  // documents
  passportValid?: boolean | null;
  passportExpirationDate?: string | null;
  proofOfFundsAvailable?: boolean | null;
  sponsorAvailable?: boolean | null;
}

interface IntakeCategoryDef {
  category: DocumentCategory;
  label: string;
  required: boolean;
}

const COMMON_REQUIRED: IntakeCategoryDef[] = [
  { category: 'passport', label: 'Passeport en cours de validité', required: true },
  { category: 'identity_document', label: 'Pièce d\u2019identité (CNI / carte de résident)', required: true },
  { category: 'photo', label: 'Photo d\u2019identité', required: true },
  { category: 'proof_of_funds', label: 'Justificatif de fonds (relevé bancaire, attestation)', required: true },
];

const WORK_DOCS: IntakeCategoryDef[] = [
  { category: 'cv_resume', label: 'CV à jour', required: true },
  { category: 'employment_letter', label: 'Lettre d\u2019emploi actuelle', required: true },
  { category: 'work_experience_letter', label: 'Attestation d\u2019expérience pro', required: true },
  { category: 'reference_letter', label: 'Lettres de recommandation', required: false },
  { category: 'language_test', label: 'Résultats de test linguistique', required: false },
];

const STUDY_DOCS: IntakeCategoryDef[] = [
  { category: 'diploma', label: 'Diplômes obtenus', required: true },
  { category: 'transcript', label: 'Relevés de notes', required: true },
  { category: 'language_test', label: 'Résultats de test linguistique', required: true },
  { category: 'sponsor_letter', label: 'Lettre de garant / sponsor', required: false },
];

const FAMILY_DOCS: IntakeCategoryDef[] = [
  { category: 'birth_certificate', label: 'Acte de naissance', required: true },
  { category: 'marriage_certificate', label: 'Acte de mariage (si applicable)', required: false },
];

const BUSINESS_DOCS: IntakeCategoryDef[] = [
  { category: 'professional_license', label: 'Licence / immatriculation professionnelle', required: true },
  { category: 'bank_statement', label: 'Relevés bancaires d\u2019entreprise', required: true },
];

const PERMANENT_DOCS: IntakeCategoryDef[] = [
  { category: 'police_clearance', label: 'Casier judiciaire', required: true },
  { category: 'medical_exam', label: 'Examen médical', required: false },
];

/**
 * Produit la liste documentaire attendue selon l\u2019objectif d\u2019immigration.
 * Renvoie des items en status 'missing'.
 */
export function buildIntakeCatalog(
  goal: DossierImmigrationGoal | null | undefined,
): AuditDraftDocumentItem[] {
  const set = new Map<DocumentCategory, IntakeCategoryDef>();
  for (const d of COMMON_REQUIRED) set.set(d.category, d);

  switch (goal) {
    case 'work':
      WORK_DOCS.forEach((d) => set.set(d.category, d));
      break;
    case 'study':
      STUDY_DOCS.forEach((d) => set.set(d.category, d));
      break;
    case 'family':
      FAMILY_DOCS.forEach((d) => set.set(d.category, d));
      break;
    case 'business':
      BUSINESS_DOCS.forEach((d) => set.set(d.category, d));
      break;
    case 'permanent':
      PERMANENT_DOCS.forEach((d) => set.set(d.category, d));
      WORK_DOCS.forEach((d) => set.set(d.category, d));
      break;
    case 'visit':
    default:
      // common only
      break;
  }

  return Array.from(set.values()).map<AuditDraftDocumentItem>((d) => ({
    category: d.category,
    label: d.label,
    required: d.required,
    status: 'missing',
  }));
}

/**
 * Fusionne une nouvelle liste catalogue avec l\u2019existant en préservant le statut
 * (ready_to_upload, uploaded, etc.) que l\u2019utilisateur a déjà coché.
 */
export function mergeIntakeWithExisting(
  next: AuditDraftDocumentItem[],
  existing: AuditDraftDocumentItem[] | null | undefined,
): AuditDraftDocumentItem[] {
  if (!existing?.length) return next;
  const map = new Map(existing.map((e) => [e.category, e]));
  return next.map((item) => {
    const prev = map.get(item.category);
    if (!prev) return item;
    return {
      ...item,
      status: prev.status,
      fileName: prev.fileName ?? null,
      dossierDocumentId: prev.dossierDocumentId ?? null,
      storagePath: prev.storagePath ?? null,
      uploadedAt: prev.uploadedAt ?? null,
      errorMessage: prev.errorMessage ?? null,
    };
  });
}

/**
 * Calcule un score de readiness basique 0-100 à partir des réponses + intake.
 *  - 50 pts : profil & objectif renseignés
 *  - 50 pts : ratio de documents marqués ready_to_upload / required
 */
export function computeReadinessScore(
  answers: AuditWizardAnswers,
  intake: AuditDraftDocumentItem[] | null | undefined,
): number {
  let score = 0;

  const profileReady =
    !!answers.fullName?.trim() &&
    !!answers.nationality?.trim() &&
    !!answers.countryOfResidence?.trim();
  const goalReady =
    !!answers.immigrationGoal && !!answers.destinationCountry?.trim();

  if (profileReady) score += 25;
  if (goalReady) score += 25;

  const items = intake ?? [];
  const required = items.filter((i) => i.required);
  if (required.length > 0) {
    const ready = required.filter(
      (i) => i.status === 'ready_to_upload' || i.status === 'uploaded',
    ).length;
    score += Math.round((ready / required.length) * 50);
  } else {
    // Pas de doc requis (cas très limite) : on accorde le solde si profil ok
    if (profileReady && goalReady) score += 50;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calcule les drapeaux de risque à partir des réponses + intake.
 * Liste alignée sur DOSSIER_RISK_FLAG_CODES.
 */
export function computeRiskFlags(
  answers: AuditWizardAnswers,
  intake: AuditDraftDocumentItem[] | null | undefined,
): DossierRiskFlag[] {
  const flags: DossierRiskFlag[] = [];

  // passeport
  if (answers.passportValid === false) {
    flags.push({
      code: 'passport_expired',
      severity: 'high',
      label: 'Passeport expiré',
      description: 'Le passeport doit être renouvelé avant toute soumission.',
    });
  } else if (answers.passportExpirationDate) {
    const exp = Date.parse(answers.passportExpirationDate);
    if (!Number.isNaN(exp)) {
      const sixMonths = 1000 * 60 * 60 * 24 * 30 * 6;
      if (exp - Date.now() < sixMonths && exp - Date.now() > 0) {
        flags.push({
          code: 'passport_expiring_soon',
          severity: 'medium',
          label: 'Passeport expirant bientôt',
          description: 'Validité < 6 mois — la plupart des consulats refusent.',
        });
      }
    }
  }

  if (answers.proofOfFundsAvailable === false) {
    flags.push({
      code: 'missing_proof_of_funds',
      severity: 'high',
      label: 'Fonds non justifiés',
      description: 'Aucune preuve de capacité financière disponible.',
    });
  }

  if (answers.previousVisaRefusal === true) {
    flags.push({
      code: 'previous_visa_refusal',
      severity: 'medium',
      label: 'Refus de visa antérieur',
      description: answers.visaRefusalDetails ?? 'À détailler dans la lettre de motivation.',
    });
  }

  if (answers.urgencyLevel === 'urgent') {
    flags.push({
      code: 'urgent_timeline',
      severity: 'medium',
      label: 'Timeline urgente',
      description: 'Le client demande une prise en charge accélérée.',
    });
  }

  // intake-based : pièces requises non disponibles
  const items = intake ?? [];
  const missingByCategory = new Map<DocumentCategory, boolean>();
  for (const it of items) {
    if (it.required && it.status === 'missing') missingByCategory.set(it.category, true);
  }
  if (missingByCategory.has('diploma')) {
    flags.push({ code: 'missing_diploma', severity: 'medium', label: 'Diplôme manquant' });
  }
  if (missingByCategory.has('transcript') || missingByCategory.has('transcripts')) {
    flags.push({ code: 'missing_transcript', severity: 'low', label: 'Relevés de notes manquants' });
  }
  if (
    missingByCategory.has('work_experience_letter') ||
    missingByCategory.has('employment_letter')
  ) {
    flags.push({ code: 'missing_work_letter', severity: 'medium', label: 'Lettre d\u2019emploi manquante' });
  }
  if (missingByCategory.has('language_test')) {
    flags.push({ code: 'missing_language_test', severity: 'medium', label: 'Test linguistique manquant' });
  }

  return flags;
}

/**
 * Génère un résumé court (1-2 phrases) lisible par l\u2019admin.
 */
export function buildAuditSummary(
  answers: AuditWizardAnswers,
  readinessScore: number,
  riskFlags: DossierRiskFlag[],
): string {
  const goal = answers.immigrationGoal ?? 'inconnu';
  const dest = answers.destinationCountry ?? 'destination non précisée';
  const risks = riskFlags.length;
  const risksStr = risks === 0
    ? 'aucun risque détecté'
    : `${risks} risque${risks > 1 ? 's' : ''} détecté${risks > 1 ? 's' : ''}`;
  return `Objectif ${goal} vers ${dest}. Readiness ${readinessScore}/100, ${risksStr}.`;
}
