import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Auth, onAuthStateChanged, User } from 'firebase/auth';
import { Firestore, doc, getDoc } from 'firebase/firestore';
import { FIREBASE_AUTH, FIRESTORE_DB } from '../firebase/firebase.providers';

export interface UserContext {
  [x: string]: any;
  loading: boolean;
  uid: string | null;
  email: string | null;
  displayName: string | null;
  tenantId: string | null;
  orgId: string | null;
  globalRole: 'user' | 'admin';
  role: string | null;
  roles: string[];
  isOrgMember: boolean;
  isOrgAdmin: boolean;
  isGlobalAdmin: boolean;
}

/**
 * AuthContextService v3
 * - Observe auth + Firestore user document
 * - Expose context as reactive signal()
 * - Usable in all features without repeating getAuth/getFirestore
 */
@Injectable({ providedIn: 'root' })
export class AuthContextService {
  private auth = inject(FIREBASE_AUTH);
  private db = inject(FIRESTORE_DB);

  private readonly _context = signal<UserContext>({
    loading: true,
    uid: null,
    email: null,
    displayName: null,
    tenantId: null,
    orgId: null,
    globalRole: 'user',
    role: null,
    roles: [],
    isOrgMember: false,
    isOrgAdmin: false,
    isGlobalAdmin: false,
  });

  readonly context = this._context.asReadonly();
  readonly uid = computed(() => this._context().uid);
  readonly tenantId = computed(() => this._context().tenantId);
  readonly loading = computed(() => this._context().loading);

  constructor() {
    // react to Firebase Auth state
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        this._context.set({
          loading: false,
          uid: null,
          email: null,
          displayName: null,
          tenantId: null,
          orgId: null,
          globalRole: 'user',
          role: null,
          roles: [],
          isOrgMember: false,
          isOrgAdmin: false,
          isGlobalAdmin: false,
        });
        return;
      }

      const ctx = await this.loadUserContext(user);
      this._context.set({ ...ctx, loading: false });
    });
  }

  private async loadUserContext(user: User): Promise<UserContext> {
    try {
      const ref = doc(this.db, 'users', user.uid);
      const snap = await getDoc(ref);
      const data = snap.exists() ? (snap.data() as any) : {};

      const tenantId = data.tenantId ?? data.organizationId ?? null;
      const orgId = data.orgId ?? data.organizationId ?? null;
      const rawRole = (data.role ?? null) as string | null;
      const rawRoles = Array.isArray(data.roles) ? (data.roles as string[]) : [];
      const mergedRoles = [...new Set<string>([...(rawRole ? [rawRole] : []), ...rawRoles])];

      const isGlobalAdmin = data.globalRole === 'admin'
        || mergedRoles.includes('super_admin')
        || mergedRoles.includes('superAdmin');

      const globalRole: 'user' | 'admin' = isGlobalAdmin ? 'admin' : 'user';
      const isOrgAdmin = mergedRoles.some((r) => ['org_admin', 'orgAdmin', 'admin', 'owner'].includes(r));
      const isOrgMember = !!tenantId || !!orgId;

      return {
        loading: false,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        tenantId,
        orgId,
        globalRole,
        role: rawRole,
        roles: mergedRoles,
        isOrgMember,
        isOrgAdmin,
        isGlobalAdmin,
      };
    } catch (err) {
      console.error('[AuthContextService] loadUserContext error', err);
      return {
        loading: false,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        tenantId: null,
        orgId: null,
        globalRole: 'user',
        role: null,
        roles: [],
        isOrgMember: false,
        isOrgAdmin: false,
        isGlobalAdmin: false,
      };
    }
  }

  /** Force reload of user Firestore document (e.g., after role change) */
  async refreshUserDoc(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      const ctx = await this.loadUserContext(user);
      this._context.set({ ...ctx, loading: false });
    }
  }
}
