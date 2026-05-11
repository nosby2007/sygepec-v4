import { Injectable } from '@angular/core';

import { BaseCanonicalRepository } from './base.repository';
import type { Checklist } from '../models/canonical/checklist.model';

@Injectable({ providedIn: 'root' })
export class ChecklistRepository extends BaseCanonicalRepository<Checklist> {
  protected collectionPath = 'checklists';

  async getForDossier(dossierId: string): Promise<Checklist | null> {
    const rows = await this.list({
      where: [['dossierId', '==', dossierId]],
      limit: 1,
    });
    return rows[0] ?? null;
  }
}
