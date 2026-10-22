export type TaxCaseStatus = 'intake' | 'awaiting_documents' | 'in_review' | 'ready_for_preparer' | 'filed_external' | 'accepted_external' | 'rejected_external' | 'completed';
export interface TaxCase {
 id: string; clientUid: string; tenantId: string; taxYear: number; status: TaxCaseStatus;
 displayName: string; assignedToUid: string | null; createdAt?: unknown; updatedAt?: unknown;
}
export interface TaxDocument { id: string; caseId: string; clientUid: string; tenantId: string; label: string; status: 'requested' | 'received' | 'approved' | 'rejected'; storagePath?: string; }
export interface TaxTicket { id: string; caseId: string; clientUid: string; tenantId: string; subject: string; message: string; status: 'open' | 'closed'; }
export const TAX_STEPS: TaxCaseStatus[] = ['intake','awaiting_documents','in_review','ready_for_preparer','filed_external','accepted_external','completed'];
