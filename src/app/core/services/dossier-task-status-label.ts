import type { DossierTaskStatus, DossierTaskPriority, DossierTaskKind } from '../models/canonical/dossier-task.model';

export interface TaskStatusView {
  label: string;
  cssClass: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const STATUS_VIEWS: Record<DossierTaskStatus, TaskStatusView> = {
  open:        { label: 'À faire',     cssClass: 'warning' },
  in_progress: { label: 'En cours',    cssClass: 'info' },
  blocked:     { label: 'Bloquée',     cssClass: 'danger' },
  done:        { label: 'Terminée',    cssClass: 'success' },
  cancelled:   { label: 'Annulée',     cssClass: 'neutral' },
};

const FALLBACK: TaskStatusView = { label: 'En attente', cssClass: 'neutral' };

export function viewForTaskStatus(status: string | null | undefined): TaskStatusView {
  if (!status) return FALLBACK;
  return STATUS_VIEWS[status as DossierTaskStatus] ?? FALLBACK;
}

const PRIORITY_LABELS: Record<DossierTaskPriority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};

export function labelForTaskPriority(p: string | null | undefined): string {
  if (!p) return 'Normale';
  return PRIORITY_LABELS[p as DossierTaskPriority] ?? p;
}

const KIND_LABELS: Record<DossierTaskKind, string> = {
  review_documents:    'Revue documents',
  contact_client:      'Contacter le client',
  await_client_action: 'Action client attendue',
  admin_followup:      'Suivi admin',
  travel_prep:         'Préparation voyage',
  training_followup:   'Suivi formation',
  other:               'Autre',
};

export function labelForTaskKind(k: string | null | undefined): string {
  if (!k) return 'Autre';
  return KIND_LABELS[k as DossierTaskKind] ?? k;
}
