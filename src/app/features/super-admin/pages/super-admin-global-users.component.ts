import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';

interface UserRow {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  tenantId?: string | null;
  role?: string | null;
  roles?: string[];
  isActive?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-super-admin-global-users',
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sa">
      <header class="sa__hd">
        <a routerLink="/super-admin" class="back">← Super Admin</a>
        <h1>Utilisateurs globaux</h1>
        <p>Recherche cross-tenant. Pour modifier un utilisateur, utilisez l'espace admin opérationnel.</p>
      </header>

      <div class="filter">
        <input type="search" placeholder="Recherche par email, nom, uid, tenant…" [(ngModel)]="qStr" />
        <span class="muted">{{ filtered().length }} résultats</span>
      </div>

      @if (loading()) {
        <p class="muted">Chargement…</p>
      } @else {
        <div class="table">
          <div class="row head">
            <span>Nom</span><span>Email</span><span>Rôles</span><span>Tenant</span><span>Statut</span>
          </div>
          @for (u of filtered(); track u.uid) {
            <div class="row">
              <span>{{ u.displayName || '—' }}</span>
              <span>{{ u.email || '—' }}</span>
              <span class="roles">
                @for (r of (u.roles && u.roles.length ? u.roles : (u.role ? [u.role] : [])); track r) {
                  <em>{{ r }}</em>
                }
              </span>
              <span><code>{{ u.tenantId || '—' }}</code></span>
              <span><b [class.off]="u.isActive === false">{{ u.isActive === false ? 'Désactivé' : 'Actif' }}</b></span>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; padding: 32px clamp(16px, 4vw, 48px); background: #F6F9FC; min-height: 100%; }
    .sa { max-width: 1280px; margin: 0 auto; }
    .sa__hd { background: linear-gradient(135deg, #0B1F3A, #123C69); color: #fff; border-radius: 24px; padding: 28px; margin-bottom: 24px; }
    .back { color: #F5B841; text-decoration: none; font-size: .85rem; }
    h1 { margin: 8px 0; }
    .muted { color: #64748b; font-size: .85rem; }
    .filter { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
    .filter input { flex: 1; padding: 12px 14px; border-radius: 12px; border: 1px solid #E2E8F0; background: #fff; }
    .table { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(11,31,58,.06); }
    .row { display: grid; grid-template-columns: 1.4fr 1.6fr 1.4fr 1.2fr .8fr; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: .9rem; }
    .row:last-child { border-bottom: 0; }
    .row.head { background: #F8FAFC; font-weight: 600; color: #475569; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
    code { background: #F1F5F9; padding: 1px 6px; border-radius: 6px; font-size: .75rem; }
    .roles em { display: inline-block; background: #EFF6FF; color: #1E40AF; padding: 2px 8px; border-radius: 999px; font-style: normal; font-size: .72rem; margin-right: 4px; }
    .off { color: #991B1B; }
  `],
})
export class SuperAdminGlobalUsersComponent {
  private db = inject(FIRESTORE_DB);
  readonly loading = signal(true);
  readonly rows = signal<UserRow[]>([]);
  qStr = '';

  readonly filtered = computed(() => {
    const q = this.qStr.trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter((u) =>
      [u.email, u.displayName, u.uid, u.tenantId, u.role, ...(u.roles || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  constructor() { void this.load(); }

  private async load() {
    try {
      const snap = await getDocs(query(collection(this.db, 'users'), limit(500)));
      this.rows.set(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) })));
    } catch (e) {
      console.error('[SuperAdminGlobalUsers] load error', e);
    } finally {
      this.loading.set(false);
    }
  }
}
