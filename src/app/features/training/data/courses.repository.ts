import { Injectable } from '@angular/core';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';
import { CourseSummary, Course } from './training.model';


@Injectable({ providedIn: 'root' })
export class CoursesRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'courses');

  /**
   * Returns courses visible to:
   * - public (visibility == 'public', status == 'published')
   * - tenant (visibility == 'tenant' AND tenantId == currentTenantId, status == 'published')
   *
   * Note: We do 2 queries (public + tenant) to avoid OR-query compatibility issues.
   */
  listAvailableCourses(tenantId: string | null, max = 200): Observable<CourseSummary[]> {
    const publicQ = query(
      this.colRef,
      where('status', '==', 'published'),
      where('visibility', '==', 'public'),
      orderBy('updatedAt', 'desc'),
      limit(max)
    );

    const tenantQ = tenantId
      ? query(
          this.colRef,
          where('status', '==', 'published'),
          where('visibility', '==', 'tenant'),
          where('tenantId', '==', tenantId),
          orderBy('updatedAt', 'desc'),
          limit(max)
        )
      : null;

    const publicP = getDocs(publicQ);
    const tenantP = tenantQ ? getDocs(tenantQ) : Promise.resolve(null as any);

    return from(Promise.all([publicP, tenantP])).pipe(
      map(([pubSnap, tenSnap]) => {
        const items: CourseSummary[] = [];

        pubSnap.forEach(d => items.push({ id: d.id, ...(d.data() as any) }));
        if (tenSnap) tenSnap.forEach((d: any) => items.push({ id: d.id, ...(d.data() as any) }));

        // Deduplicate by id then sort by updatedAt desc (best-effort)
        const byId = new Map(items.map(i => [i.id, i]));
        const merged = [...byId.values()];

        merged.sort((a: any, b: any) => {
          const au = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
          const bu = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
          return bu - au;
        });

        return merged;
      })
    );
  }

  getCourseById(courseId: string): Observable<Course | null> {
    return from(getDoc(doc(this.db, 'courses', courseId))).pipe(
      map(snap => (snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Course) : null))
    );
  }

  /**
   * Optional admin usage
   */
  async createCourse(course: Omit<Course, 'id'>, courseId?: string): Promise<string> {
    const id = courseId ?? crypto.randomUUID();
    await setDoc(doc(this.db, 'courses', id), {
      ...course,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return id;
  }

  async updateCourse(courseId: string, patch: Partial<Course>): Promise<void> {
    await updateDoc(doc(this.db, 'courses', courseId), {
      ...patch,
      updatedAt: serverTimestamp()
    } as any);
  }
}
