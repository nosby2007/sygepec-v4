import { inject, Injectable } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User
} from 'firebase/auth';
import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { BehaviorSubject, Observable } from 'rxjs';
import { FIREBASE_AUTH, FIRESTORE_DB } from '../firebase/firebase.providers';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth: Auth = inject(FIREBASE_AUTH);
  private db: Firestore = inject(FIRESTORE_DB);

  private userSubject = new BehaviorSubject<User | null>(null);
  readonly user$ = this.userSubject.asObservable();

  constructor() {
    onAuthStateChanged(this.auth, user => this.userSubject.next(user));
  }

  appUser(): User | null {
    return this.userSubject.getValue();
  }

  isGlobalAdmin(): boolean {
    // Override in production with custom claims check if needed
    return false;
  }

  async register(email: string, password: string, displayName?: string, tenantId?: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);

    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }

    // create Firestore user document
    await setDoc(doc(this.db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email,
      displayName: displayName ?? null,
      tenantId: tenantId ?? null,
      orgId: tenantId ?? null,
      role: 'client',
      roles: ['client'],
      globalRole: 'user',
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return cred.user;
  }

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    return cred.user;
  }

  async logout() {
    await signOut(this.auth);
  }

  async resetPassword(email: string) {
    await sendPasswordResetEmail(this.auth, email);
  }

  async getUserTenant(uid: string): Promise<string | null> {
    const snap = await getDoc(doc(this.db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    return data.tenantId ?? null;
  }
}
