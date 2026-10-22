import { Injectable, inject } from '@angular/core';
import { collection, addDoc, doc, getDocs, query, where, updateDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { TaxCase, TaxCaseStatus, TaxTicket } from './tax.models';

@Injectable({ providedIn: 'root' })
export class TaxService {
 private db = getFirestore();
 private auth = inject(AuthContextService);
 private uid(): string { const uid = this.auth.context().uid; if (!uid) throw new Error('Authentication required'); return uid; }
 async myCases(): Promise<TaxCase[]> {
  const snap = await getDocs(query(collection(this.db,'taxCases'),where('clientUid','==',this.uid())));
  return snap.docs.map(d => ({...d.data(), id:d.id} as TaxCase));
 }
 async createCase(year: number): Promise<void> {
  if (!Number.isInteger(year) || year < 2020 || year > new Date().getFullYear()) throw new Error('Invalid tax year');
  await addDoc(collection(this.db,'taxCases'),{clientUid:this.uid(),tenantId:'perry-tax-pro',taxYear:year,status:'intake',displayName:'Tax return '+year,assignedToUid:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 }
 async myTickets(): Promise<TaxTicket[]> {
  const snap = await getDocs(query(collection(this.db,'taxTickets'),where('clientUid','==',this.uid())));
  return snap.docs.map(d => ({...d.data(),id:d.id} as TaxTicket));
 }
 async createTicket(caseId: string,subject: string,message: string): Promise<void> {
  if (!subject.trim() || !message.trim()) throw new Error('Subject and message required');
  await addDoc(collection(this.db,'taxTickets'),{caseId,clientUid:this.uid(),tenantId:'perry-tax-pro',subject:subject.trim().slice(0,150),message:message.trim().slice(0,2000),status:'open',createdAt:serverTimestamp()});
 }
 // Staff updates deliberately disabled until server-side claims and audit are implemented.
 async changeStatus(_caseId: string,_status: TaxCaseStatus): Promise<never> { throw new Error('Staff workflow not enabled pending server-side authorization'); }
}
