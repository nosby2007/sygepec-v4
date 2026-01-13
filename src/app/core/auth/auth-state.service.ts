import { Injectable } from '@angular/core';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = getAuth();
  private db = getFirestore();

  private userSubject = new BehaviorSubject<User | null>(null);
  readonly user$ = this.userSubject.asObservable();

  constructor() {
    onAuthStateChanged(this.auth, user => this.userSubject.next(user));
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
