import { Injectable } from '@angular/core';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getFirestore,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export interface Enrollment {
  id: string;
  tenantId: string | null;
  courseId: string;
  userId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  progress?: number;
  status: 'enrolled' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt?: number;
}

/**
 * Repository centralisé pour la gestion des inscriptions aux cours (training module).
 * 100 % Firebase SDK pour l’instant, mais API-ready (mêmes signatures observables).
 */
@Injectable({ providedIn: 'root' })
export class EnrollmentsRepository {
  private readonly db = getFirestore();

  private collectionRef() {
    return collection(this.db, 'enrollments');
  }

  /** Liste toutes les inscriptions d’un utilisateur donné */
  listMyEnrollments(userId: string, max = 200): Observable<Enrollment[]> {
    const q = query(
      this.collectionRef(),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(snap =>
        snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Enrollment))
      )
    );
  }

  /** Liste toutes les inscriptions d’un tenant (pour vue admin/org) */
  listEnrollmentsByTenant(tenantId: string, max = 300): Observable<Enrollment[]> {
    const q = query(
      this.collectionRef(),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(snap =>
        snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Enrollment))
      )
    );
  }

  /** Liste les participants d’un cours */
  listByCourse(courseId: string, max = 300): Observable<Enrollment[]> {
    const q = query(
      this.collectionRef(),
      where('courseId', '==', courseId),
      orderBy('createdAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(snap =>
        snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Enrollment))
      )
    );
  }

  /** Crée une nouvelle inscription */
  async enroll(data: Omit<Enrollment, 'id' | 'createdAt'>): Promise<string> {
    const id = `${data.userId}_${data.courseId}`;
    const ref = doc(this.db, 'enrollments', id);
    const payload: Enrollment = {
      id,
      tenantId: data.tenantId ?? null,
      courseId: data.courseId,
      userId: data.userId,
      userEmail: data.userEmail ?? null,
      userDisplayName: data.userDisplayName ?? null,
      progress: data.progress ?? 0,
      status: data.status ?? 'enrolled',
      createdAt: Date.now()
    };
    await setDoc(ref, payload, { merge: true });
    return id;
  }

  /** Met à jour la progression */
  async updateProgress(enrollmentId: string, progress: number): Promise<void> {
    const ref = doc(this.db, 'enrollments', enrollmentId);
    await updateDoc(ref, {
      progress,
      updatedAt: Date.now()
    });
  }

  /** Met à jour le statut (completed, cancelled, etc.) */
  async updateStatus(enrollmentId: string, status: Enrollment['status']): Promise<void> {
    const ref = doc(this.db, 'enrollments', enrollmentId);
    await updateDoc(ref, { status, updatedAt: Date.now() });
  }

  /** Récupère une inscription spécifique */
  getEnrollmentById(id: string): Observable<Enrollment | null> {
    const ref = doc(this.db, 'enrollments', id);
    return from(getDoc(ref)).pipe(
      map(s => (s.exists() ? ({ id: s.id, ...(s.data() as any) } as Enrollment) : null))
    );
  }

  /** Supprime une inscription */
  async removeEnrollment(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'enrollments', id));
  }
}
