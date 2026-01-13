import { Injectable } from '@angular/core';
import {
  collection,
  getCountFromServer,
  getFirestore,
  query,
  where
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';
import { AdminStats } from './admin.models';

@Injectable({ providedIn: 'root' })
export class AdminRepository {
  private db = getFirestore();

  getStats(): Observable<AdminStats> {
    const usersCol = collection(this.db, 'users');
    const orgsCol = collection(this.db, 'organizations');

    const usersAllQ = query(usersCol);
    const orgsAllQ = query(orgsCol);

    const usersActiveQ = query(usersCol, where('isActive', '==', true));
    const orgsActiveQ = query(orgsCol, where('isActive', '==', true));

    return from(
      Promise.all([
        getCountFromServer(usersAllQ),
        getCountFromServer(orgsAllQ),
        getCountFromServer(usersActiveQ),
        getCountFromServer(orgsActiveQ),
      ])
    ).pipe(
      map(([uAll, oAll, uAct, oAct]) => ({
        usersCount: uAll.data().count,
        orgsCount: oAll.data().count,
        activeUsersCount: uAct.data().count,
        activeOrgsCount: oAct.data().count
      }))
    );
  }
}
