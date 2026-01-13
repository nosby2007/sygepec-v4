import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export type DossierDocumentStatus = 'requested' | 'uploaded' | 'validated' | 'rejected';

export interface DossierDocument {
  id: string;

  title: string;
  type?: string | null;
  status: DossierDocumentStatus;

  storagePath?: string | null;
  downloadUrl?: string | null;

  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;

  notes?: string | null;

  uploadedByUid?: string | null;
  uploadedAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class DocumentsRepository {
  private db = getFirestore();

  private docsCol(dossierId: string) {
    return collection(this.db, `dossiers/${dossierId}/documents`);
  }

  listDocuments(dossierId: string, max = 200): Observable<DossierDocument[]> {
    const q = query(this.docsCol(dossierId), orderBy('updatedAt', 'desc'), limit(max));
    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as DossierDocument)))
    );
  }

  async addDocument(dossierId: string, payload: Omit<DossierDocument, 'id' | 'uploadedAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(this.docsCol(dossierId), {
      ...payload,
      updatedAt: serverTimestamp(),
      uploadedAt: serverTimestamp()
    } as any);
    return ref.id;
  }

  async updateDocument(dossierId: string, docId: string, patch: Partial<DossierDocument>): Promise<void> {
    await updateDoc(doc(this.db, `dossiers/${dossierId}/documents/${docId}`), {
      ...patch,
      updatedAt: serverTimestamp()
    } as any);
  }

  async deleteDocument(dossierId: string, docId: string): Promise<void> {
    await deleteDoc(doc(this.db, `dossiers/${dossierId}/documents/${docId}`));
  }

  // NEW: status update helper
  async setStatus(
    dossierId: string,
    docId: string,
    status: DossierDocumentStatus,
    notes?: string | null
  ): Promise<void> {
    await this.updateDocument(dossierId, docId, {
      status,
      notes: notes ?? null
    });
  }

  // If you already added it earlier, keep it as-is:
  async markUploaded(
    dossierId: string,
    docId: string,
    payload: {
      storagePath: string;
      downloadUrl: string;
      fileName?: string | null;
      contentType?: string | null;
      size?: number | null;
      uploadedByUid?: string | null;
    }
  ): Promise<void> {
    await this.updateDocument(dossierId, docId, {
      status: 'uploaded',
      storagePath: payload.storagePath,
      downloadUrl: payload.downloadUrl,
      fileName: payload.fileName ?? null,
      contentType: payload.contentType ?? null,
      size: payload.size ?? null,
      uploadedByUid: payload.uploadedByUid ?? null,
      uploadedAt: serverTimestamp()
    });
  }
}
