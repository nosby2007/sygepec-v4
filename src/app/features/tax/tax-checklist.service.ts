import { Injectable, inject } from '@angular/core';
import { addDoc, collection, getDocs, getFirestore, query, serverTimestamp, where } from 'firebase/firestore';
import { AuthContextService } from '../../core/auth/auth-context.service';

export type TaxChecklistStatus = 'needed' | 'not_applicable';
export interface TaxChecklistItem {
 id: string; caseId: string; clientUid: string; tenantId: 'perry-tax-pro';
 category: 'identity' | 'income' | 'deductions' | 'other';
 label: string; status: TaxChecklistStatus;
}
export const SUGGESTED_TAX_DOCUMENTS = [
 { category: 'identity', label: 'Government-issued ID' },
 { category: 'income', label: 'W-2 wage statement' },
 { category: 'income', label: '1099 income statements (if applicable)' },
 { category: 'deductions', label: 'Deduction and credit records (if applicable)' },
] as const;

@Injectable({ providedIn: 'root' })
export class TaxChecklistService {
 private db = getFirestore();
 private auth = inject(AuthContextService);
 private uid(): string {
  const uid = this.auth.context().uid;
  if (!uid) throw new Error('Sign-in required');
  return uid;
 }
 async forCase(caseId: string): Promise<TaxChecklistItem[]> {
  const uid = this.uid();
  const result = await getDocs(query(collection(this.db, 'taxChecklist'), where('clientUid','==',uid), where('caseId','==',caseId)));
  return result.docs.map(d => ({...d.data(),id:d.id} as TaxChecklistItem));
 }
 async addItem(caseId: string, category: TaxChecklistItem['category'], label: string): Promise<void> {
  const uid = this.uid();
  if (!label.trim() || label.length > 100) throw new Error('Invalid checklist item');
  await addDoc(collection(this.db,'taxChecklist'),{
   caseId, clientUid:uid, tenantId:'perry-tax-pro', category, label:label.trim(),
   status:'needed', createdAt:serverTimestamp()
  });
 }
}
