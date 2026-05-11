import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthContextService } from '../../../core/auth/auth-context.service';

@Component({
  standalone: true,
  selector: 'app-super-admin-overview',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sa">
      <header class="sa__hd">
        <p class="sa__eyebrow">Super Admin · Plateforme</p>
        <h1>Bienvenue {{ ctx().displayName || ctx().email }}</h1>
        <p class="sa__sub">
          Vue plateforme de SYGEPEC : tenants, utilisateurs globaux, audit système et flags.
          Toutes les actions ici sont journalisées.
        </p>
      </header>

      <div class="sa__kpis">
        <article class="kpi"><span>Tenants actifs</span><strong>—</strong></article>
        <article class="kpi"><span>Utilisateurs globaux</span><strong>—</strong></article>
        <article class="kpi"><span>Sessions actives</span><strong>—</strong></article>
        <article class="kpi"><span>Audit events 24h</span><strong>—</strong></article>
      </div>

      <div class="sa__grid">
        <a class="card" routerLink="/super-admin/tenants">
          <span class="ic">🏢</span>
          <h3>Tenants</h3>
          <p>Créer, suspendre et auditer les organisations clientes.</p>
        </a>
        <a class="card" routerLink="/super-admin/global-users">
          <span class="ic">👥</span>
          <h3>Utilisateurs globaux</h3>
          <p>Recherche cross-tenant, élévation de rôle, désactivation.</p>
        </a>
        <a class="card" routerLink="/super-admin/system-audit">
          <span class="ic">🛡️</span>
          <h3>Audit système</h3>
          <p>Trace des actions sensibles plateforme et tenant.</p>
        </a>
        <a class="card" routerLink="/super-admin/health">
          <span class="ic">🩺</span>
          <h3>Santé plateforme</h3>
          <p>Sondes Firestore, latence, volumes par collection, activité 24 h.</p>
        </a>
        <a class="card" routerLink="/super-admin/feature-flags">
          <span class="ic">🚦</span>
          <h3>Feature flags</h3>
          <p>Activation progressive AI intake, BYOM, modules.</p>
        </a>
        <a class="card" routerLink="/admin">
          <span class="ic">📊</span>
          <h3>Espace admin opérationnel</h3>
          <p>Pipeline leads, dossiers, documents, voyages.</p>
        </a>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; padding: 32px clamp(16px, 4vw, 48px); background: #F6F9FC; min-height: 100%; }
    .sa { max-width: 1280px; margin: 0 auto; }
    .sa__hd { background: linear-gradient(135deg, #0B1F3A 0%, #123C69 100%); color: #fff; border-radius: 24px; padding: 32px; margin-bottom: 24px; box-shadow: 0 16px 48px rgba(11,31,58,.15); }
    .sa__eyebrow { color: #F5B841; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: .75rem; margin: 0 0 8px; }
    h1 { margin: 0 0 8px; font-size: clamp(1.6rem, 3vw, 2.2rem); }
    .sa__sub { margin: 0; opacity: .85; max-width: 720px; }
    .sa__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px rgba(11,31,58,.06); }
    .kpi span { display: block; font-size: .8rem; color: #64748b; margin-bottom: 8px; }
    .kpi strong { font-size: 1.6rem; color: #0B1F3A; }
    .sa__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card { display: block; background: #fff; padding: 24px; border-radius: 18px; text-decoration: none; color: inherit; box-shadow: 0 8px 24px rgba(11,31,58,.06); border: 1px solid rgba(11,31,58,.05); transition: transform .15s, box-shadow .15s; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 16px 32px rgba(11,31,58,.12); }
    .ic { font-size: 1.8rem; }
    h3 { margin: 12px 0 6px; color: #0B1F3A; }
    p { margin: 0; color: #475569; font-size: .92rem; }
  `],
})
export class SuperAdminOverviewComponent {
  private auth = inject(AuthContextService);
  readonly ctx = computed(() => this.auth.context());
}
