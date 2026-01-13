import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { AuthStateService } from '../auth/auth-state.service';
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
  private fs = inject(Firestore);
  private auth = inject(AuthStateService);

  myOrgs$(): Observable<OrgMembership[]> {
    return new Observable(observer => {
      const u = this.auth.appUser();
      if (!u) { observer.next([]); observer.complete(); return; }

      const ref = collection(this.fs, 'orgMembers');
      const q = query(ref, where('uid','==', u.uid), where('status','==','active'));
      collectionData(q, { idField: 'id' }).subscribe({
        next: (rows: any[]) => observer.next(rows.map(r => ({
          orgId: r.orgId,
          role: r.role,
          status: r.status,
          orgName: r.orgName,
          tenantId: r.tenantId ?? (`org_${r.orgId}`),
        }))),
        error: (e) => observer.error(e),
      });
    });
  }
}
