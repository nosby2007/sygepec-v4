import type { OwnedEntity } from './base.entity';
import type { DocumentCategory } from './dossier-document.model';

export interface ChecklistItem {
  category: DocumentCategory;
  label: string;
  required: boolean;
  done: boolean;
  documentId: string | null;
}

export interface Checklist extends OwnedEntity {
  dossierId: string;
  items: ChecklistItem[];
  total: number;
  completed: number;
  completionRate: number;            // 0-100
  missing: DocumentCategory[];
  status: 'in_progress' | 'completed';
}
