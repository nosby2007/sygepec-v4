import type { Checklist, ChecklistItem } from '../models/canonical/checklist.model';
import { labelForDocumentCategory } from './dossier-document-status-label';

export interface ChecklistItemView {
  category: string;
  label: string;
  required: boolean;
  done: boolean;
  documentId: string | null;
  statusLabel: 'Completed' | 'Missing' | 'Optional';
  cssClass: 'success' | 'danger' | 'neutral';
}

export interface ChecklistView {
  total: number;
  completed: number;
  missing: number;
  optional: number;
  completionRate: number; // 0-100
  status: 'in_progress' | 'completed' | 'empty';
  items: ChecklistItemView[];
}

export const EMPTY_CHECKLIST_VIEW: ChecklistView = {
  total: 0,
  completed: 0,
  missing: 0,
  optional: 0,
  completionRate: 0,
  status: 'empty',
  items: [],
};

function viewForItem(item: ChecklistItem): ChecklistItemView {
  let statusLabel: ChecklistItemView['statusLabel'];
  let cssClass: ChecklistItemView['cssClass'];
  if (item.done) {
    statusLabel = 'Completed';
    cssClass = 'success';
  } else if (item.required) {
    statusLabel = 'Missing';
    cssClass = 'danger';
  } else {
    statusLabel = 'Optional';
    cssClass = 'neutral';
  }
  return {
    category: item.category,
    label: item.label || labelForDocumentCategory(item.category),
    required: item.required,
    done: item.done,
    documentId: item.documentId,
    statusLabel,
    cssClass,
  };
}

export function viewForChecklist(checklist: Checklist | null): ChecklistView {
  if (!checklist || !Array.isArray(checklist.items) || checklist.items.length === 0) {
    return EMPTY_CHECKLIST_VIEW;
  }
  const items = checklist.items.map(viewForItem);
  const requiredItems = items.filter((i) => i.required);
  const completed = requiredItems.filter((i) => i.done).length;
  const total = requiredItems.length;
  const missing = requiredItems.filter((i) => !i.done).length;
  const optional = items.filter((i) => !i.required).length;
  const completionRate = total === 0
    ? 100
    : Math.round((completed / total) * 100);
  const status: ChecklistView['status'] = completionRate >= 100 ? 'completed' : 'in_progress';
  return { total, completed, missing, optional, completionRate, status, items };
}
