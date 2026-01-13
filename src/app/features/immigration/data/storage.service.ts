import { Injectable } from '@angular/core';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  StorageReference
} from 'firebase/storage';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private storage = getStorage();

  private sanitizeFileName(name: string): string {
    return name
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 120);
  }

  private buildPath(params: {
    tenantId?: string | null;
    dossierId: string;
    docId: string;
    fileName: string;
  }): string {
    const safe = this.sanitizeFileName(params.fileName);
    const ts = Date.now();
    const tenantPart = params.tenantId ? `tenants/${params.tenantId}` : 'public';
    return `${tenantPart}/dossiers/${params.dossierId}/documents/${params.docId}/${ts}_${safe}`;
  }

  async uploadDossierDocument(params: {
    tenantId?: string | null;
    dossierId: string;
    docId: string;
    file: File;
  }): Promise<{
    storagePath: string;
    downloadUrl: string;
    size: number;
    contentType: string;
    originalName: string;
  }> {
    const storagePath = this.buildPath({
      tenantId: params.tenantId ?? null,
      dossierId: params.dossierId,
      docId: params.docId,
      fileName: params.file.name
    });

    const fileRef: StorageReference = ref(this.storage, storagePath);

    await uploadBytes(fileRef, params.file, {
      contentType: params.file.type || 'application/octet-stream'
    });

    const downloadUrl = await getDownloadURL(fileRef);

    return {
      storagePath,
      downloadUrl,
      size: params.file.size,
      contentType: params.file.type || 'application/octet-stream',
      originalName: params.file.name
    };
  }
}
