import { Injectable } from '@angular/core';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { BehaviorSubject, Observable, distinctUntilChanged, from, map, of, switchMap } from 'rxjs';
import { AppUser, UserRole } from './admin.models';

@Injectable({ providedIn: 'root' })
export class AdminContextService {
  private auth = getAuth();
  private db = getFirestore();

  private authUser$ = new BehaviorSubject<User | null>(null);

  /** Firebase Auth user */
  readonly user$: Observable<User | null> = this.authUser$.asObservable();

  /** uid */
  readonly userId$: Observable<string | null> = this.user$.pipe(
    map(u => u?.uid ?? null),
    distinctUntilChanged()
  );

  /** User profile from Firestore: users/{uid} */
  readonly appUser$: Observable<AppUser | null> = this.userId$.pipe(
    switchMap(uid => {
      if (!uid) return of(null);
      return from(getDoc(doc(this.db, 'users', uid))).pipe(
        map(snap => (snap.exists() ? ({ uid: snap.id, ...(snap.data() as any) } as AppUser) : null))
      );
    }),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );

  readonly tenantId$: Observable<string | null> = this.appUser$.pipe(
    map(u => u?.tenantId ?? null),
    distinctUntilChanged()
  );

  readonly roles$: Observable<UserRole[]> = this.appUser$.pipe(
    map(u => (u?.roles ?? []) as UserRole[]),
    distinctUntilChanged((a, b) => a.join('|') === b.join('|'))
  );

  constructor() {
    onAuthStateChanged(this.auth, u => this.authUser$.next(u));
  }

  /** Helpers */
  hasAnyRole(roles: UserRole[], target: UserRole[]) {
    const set = new Set(roles);
    return target.some(r => set.has(r));
  }
}
