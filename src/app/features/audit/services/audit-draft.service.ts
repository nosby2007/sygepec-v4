import { Injectable } from '@angular/core';
import { AssessmentAnswers, AssessmentState, SummaryResult } from '../models/assessment.models';

const DRAFT_KEY = 'sygepecAuditDraft';

@Injectable({ providedIn: 'root' })
export class AuditDraftService {
  saveDraft(payload: {
    currentStepIndex: number;
    answers: AssessmentAnswers;
    readinessScore: number;
    missingItems: string[];
    recommendedPrograms: string[];
    summary?: SummaryResult;
  }): void {
    const now = Date.now();
    const draft: AssessmentState = {
      currentStepIndex: payload.currentStepIndex,
      answers: payload.answers,
      readinessScore: payload.readinessScore,
      missingItems: payload.missingItems,
      recommendedPrograms: payload.recommendedPrograms,
      summary: payload.summary,
      createdAt: this.getCreatedAt() ?? now,
      updatedAt: now,
    };

    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  getDraft(): AssessmentState | null {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AssessmentState;
    } catch {
      return null;
    }
  }

  hasDraft(): boolean {
    return !!this.getDraft();
  }

  clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY);
  }

  private getCreatedAt(): number | null {
    const draft = this.getDraft();
    return draft?.createdAt ?? null;
  }
}
