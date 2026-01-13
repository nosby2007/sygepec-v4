import { Injectable } from '@angular/core';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { BehaviorSubject, Observable, distinctUntilChanged, from, map, of, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TrainingContextService {
  private auth = getAuth();
  private db = getFirestore();

  private userSubject = new BehaviorSubject<User | null>(null);
  readonly user$: Observable<User | null> = this.userSubject.asObservable();

  readonly userId$: Observable<string | null> = this.user$.pipe(
    map(u => u?.uid ?? null),
    distinctUntilChanged()
  );

  /**
   * Multi-tenant: users/{uid}.organizationId (or orgId)
   */
  readonly tenantId$: Observable<string | null> = this.userId$.pipe(
    switchMap(uid => {
      if (!uid) return of(null);
      return from(getDoc(doc(this.db, 'users', uid))).pipe(
        map(snap => {
          if (!snap.exists()) return null;
          const data = snap.data() as any;
          return (data.organizationId ?? data.orgId ?? data.tenantId ?? null) as string | null;
        })
      );
    }),
    distinctUntilChanged()
  );

  constructor() {
    onAuthStateChanged(this.auth, (u) => this.userSubject.next(u));
  }
}
