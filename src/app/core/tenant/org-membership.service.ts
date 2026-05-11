import { Injectable, inject } from '@angular/core';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { AuthService as AuthStateService } from '../auth/auth-state.service';
import { Observable } from 'rxjs';

export interface OrgMembership {
  orgId: string;
  role: 'owner'|'admin'|'staff'|'employer'|'viewer';
  status: 'active'|'inactive';
  orgName?: string;
  tenantId?: string;
}

@Injectable({ providedIn: 'root' })
export class OrgMembershipService {
  private auth = inject(AuthStateService);

  myOrgs$(): Observable<OrgMembership[]> {
    return new Observable<OrgMembership[]>(observer => {
      const u = this.auth.appUser();
      if (!u) { observer.next([]); observer.complete(); return; }

      const db = getFirestore();
      const ref = collection(db, 'orgMembers');
      const q = query(ref, where('uid', '==', u.uid), where('status', '==', 'active'));
      const unsub = onSnapshot(q, (snap) => {
        observer.next(snap.docs.map(d => {
          const r = d.data() as any;
          return {
            orgId: r.orgId,
            role: r.role,
            status: r.status,
            orgName: r.orgName,
            tenantId: r.tenantId ?? (`org_${r.orgId}`),
          } as OrgMembership;
        }));
      }, (e) => observer.error(e));
      return () => unsub();
    });
  }

  membershipInOrg$(orgId: string): Observable<OrgMembership | null> {
    return new Observable<OrgMembership | null>(observer => {
      const u = this.auth.appUser();
      if (!u) { observer.next(null); observer.complete(); return; }

      const db = getFirestore();
      const ref = collection(db, 'orgMembers');
      const q = query(ref, where('uid', '==', u.uid), where('orgId', '==', orgId), where('status', '==', 'active'));
      const unsub = onSnapshot(q, (snap) => {
        const doc = snap.docs[0];
        if (!doc) { observer.next(null); return; }
        const r = doc.data() as any;
        observer.next({ orgId: r.orgId, role: r.role, status: r.status, orgName: r.orgName, tenantId: r.tenantId });
      }, (e) => observer.error(e));
      return () => unsub();
    });
  }
}

