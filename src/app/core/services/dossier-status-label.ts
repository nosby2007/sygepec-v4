import type { DossierStatus } from '../models/canonical/dossier.model';

/**
 * Mapping statut canonique → libellé humain et classe UI.
 * Utilisé par les composants client refactorés (Lot 3.3+).
 */
export interface DossierStatusView {
  label: string;
  /** Classe à appliquer sur un pill ('success' | 'warning' | 'danger' | 'info'). */
  cssClass: 'success' | 'warning' | 'danger' | 'info';
  /** Pourcentage indicatif d'avancement (0-100), null si non significatif. */
  progress: number | null;
  /** Suggestion par défaut si nextBestAction n'est pas renseigné. */
  defaultNextAction: string;
}

const STATUS_VIEW: Record<DossierStatus, DossierStatusView> = {
  draft: {
    label: 'Draft',
    cssClass: 'info',
    progress: 5,
    defaultNextAction: 'Complete your personal audit to activate the dossier.',
  },
  audit_completed: {
    label: 'Audit completed',
    cssClass: 'info',
    progress: 25,
    defaultNextAction: 'Upload the missing documents to start the human review.',
  },
  awaiting_documents: {
    label: 'Awaiting documents',
    cssClass: 'warning',
    progress: 35,
    defaultNextAction: 'Upload your missing documents in the document vault.',
  },
  in_review: {
    label: 'In review',
    cssClass: 'warning',
    progress: 60,
    defaultNextAction: 'A SYGEPEC advisor is reviewing your dossier.',
  },
  training_required: {
    label: 'Training required',
    cssClass: 'warning',
    progress: 70,
    defaultNextAction: 'Start your recommended training to unlock the next step.',
  },
  travel_prep: {
    label: 'Travel preparation',
    cssClass: 'info',
    progress: 85,
    defaultNextAction: 'Prepare your travel readiness checklist.',
  },
  completed: {
    label: 'Completed',
    cssClass: 'success',
    progress: 100,
    defaultNextAction: 'Your dossier is fully completed.',
  },
  on_hold: {
    label: 'On hold',
    cssClass: 'info',
    progress: null,
    defaultNextAction: 'Your dossier is on hold. Contact support for next steps.',
  },
  cancelled: {
    label: 'Cancelled',
    cssClass: 'danger',
    progress: null,
    defaultNextAction: 'Your dossier has been cancelled.',
  },
};

const FALLBACK_VIEW: DossierStatusView = {
  label: 'Unknown',
  cssClass: 'info',
  progress: null,
  defaultNextAction: 'Open your dossier for more details.',
};

export function viewForDossierStatus(status: string | null | undefined): DossierStatusView {
  if (!status) return FALLBACK_VIEW;
  return STATUS_VIEW[status as DossierStatus] ?? FALLBACK_VIEW;
}
