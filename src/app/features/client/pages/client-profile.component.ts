import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { AuditDraftService } from '../../audit/services/audit-draft.service';
import { SygepecDataService } from '../../../core/services/sygepec-data.service';

@Component({
  standalone: true,
  selector: 'app-client-profile',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <nav class="bc" aria-label="Breadcrumb"><a routerLink="/dashboard">Dashboard</a> <span>›</span> <strong>Mon profil immigration</strong></nav>

      <header class="hero">
        <div class="hero__avatar" aria-hidden="true">{{ initials() }}</div>
        <div class="hero__copy">
          <p class="eyebrow">Profil immigration SYGEPEC</p>
          <h1>{{ profile()?.fullName || ctx().displayName || 'Mon profil' }}</h1>
          <p class="lead">{{ ctx().email || 'Compléter votre profil pour activer le parcours' }}</p>
          <div class="hero__cta">
            <a routerLink="/start-audit" class="btn btn--gold">Continuer l'audit</a>
            <a routerLink="/client/documents" class="btn btn--ghost">Document Vault</a>
          </div>
        </div>
        <aside class="hero__score" aria-label="Readiness score">
          <span>Readiness administratif</span>
          <div class="ring" [style.--p]="readinessScore()">
            <strong>{{ readinessScore() }}<em>%</em></strong>
          </div>
          <p class="hero__hint">{{ readinessHint() }}</p>
        </aside>
      </header>

      <section class="grid">
        <article class="card">
          <header><span class="ic ic--blue">👤</span><h2>Identité &amp; profil</h2></header>
          <dl>
            <div><dt>Nom complet</dt><dd>{{ profile()?.fullName || ctx().displayName || 'À renseigner' }}</dd></div>
            <div><dt>Email</dt><dd>{{ profile()?.email || ctx().email || 'À renseigner' }}</dd></div>
            <div><dt>Nationalité</dt><dd>{{ profile()?.nationality || draftAnswers()['nationality'] || '—' }}</dd></div>
            <div><dt>Résidence</dt><dd>{{ profile()?.residenceCountry || draftAnswers()['residenceCountry'] || '—' }}</dd></div>
            <div><dt>Destination</dt><dd>{{ profile()?.destinationCountry || draftAnswers()['destinationCountry'] || 'Non sélectionnée' }}</dd></div>
          </dl>
          <a routerLink="/start-audit" class="card__link">Compléter mon profil →</a>
        </article>

        <article class="card">
          <header><span class="ic ic--teal">📊</span><h2>Readiness immigration</h2></header>
          <div class="bar"><div class="bar__fill" [style.width.%]="readinessScore()"></div></div>
          <p class="card__text">{{ draftSummary() }}</p>
          <div class="legend">
            <span class="dot dot--ok"></span> Profil structuré
            <span class="dot dot--warn"></span> En cours
            <span class="dot dot--err"></span> Manquant
          </div>
        </article>

        <article class="card">
          <header><span class="ic ic--gold">🎯</span><h2>Prochaines actions</h2></header>
          <ol class="steps">
            <li><strong>Identité</strong> Compléter nationalité, résidence, destination.</li>
            <li><strong>Documents</strong> Téléverser passeport, fonds, pièces critiques.</li>
            <li><strong>Formation</strong> Démarrer le programme prioritaire si recommandé.</li>
            <li><strong>Revue humaine</strong> Validation conseiller avant soumission.</li>
          </ol>
        </article>
      </section>

      <section class="quick">
        <a routerLink="/client/documents" class="quick__card"><span class="quick__ic">📄</span><strong>Documents</strong><span>Ouvrir mon coffre</span></a>
        <a routerLink="/client/training-recommendations" class="quick__card"><span class="quick__ic">📚</span><strong>Formations</strong><span>Voir les recos</span></a>
        <a routerLink="/travel" class="quick__card"><span class="quick__ic">✈️</span><strong>Voyage</strong><span>Préparation départ</span></a>
        <a routerLink="/support" class="quick__card"><span class="quick__ic">💬</span><strong>Support</strong><span>Parler à un conseiller</span></a>
      </section>

      <p class="legal">SYGEPEC fournit une orientation administrative et éducative. Les résultats ne constituent pas un avis légal ni une garantie de visa. Une revue humaine est requise avant toute soumission officielle.</p>
    </div>
  `,
  styles: [`
    :host { display: block; background: linear-gradient(180deg, #F6F9FC 0%, #FFFFFF 320px); min-height: 100%; }
    .page { max-width: 1280px; margin: 0 auto; padding: 24px clamp(16px, 4vw, 40px) 64px; }
    .bc { color: #64748b; font-size: .85rem; margin-bottom: 16px; }
    .bc a { color: #1E63D6; text-decoration: none; } .bc strong { color: #0B1F3A; }
    .hero { display: grid; grid-template-columns: auto minmax(0, 1fr) 280px; gap: 28px; align-items: center; background: linear-gradient(135deg, #0B1F3A 0%, #123C69 70%, #1E63D6 130%); color: #fff; padding: 32px clamp(20px, 4vw, 40px); border-radius: 28px; box-shadow: 0 24px 48px -16px rgba(11,31,58,.35); position: relative; overflow: hidden; }
    .hero::before { content: ''; position: absolute; inset: -40% -10% auto auto; width: 460px; height: 460px; background: radial-gradient(circle, rgba(245,184,65,.22), transparent 60%); pointer-events: none; }
    .hero__avatar { width: 88px; height: 88px; border-radius: 50%; background: linear-gradient(135deg, #F5B841, #FBBF24); display: grid; place-items: center; color: #0B1F3A; font-weight: 800; font-size: 2rem; box-shadow: 0 8px 24px rgba(245,184,65,.4); position: relative; }
    .hero__copy { position: relative; }
    .eyebrow { color: #F5B841; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: .72rem; margin: 0 0 10px; }
    h1 { margin: 0 0 6px; font-size: clamp(1.6rem, 2.6vw, 2.1rem); }
    .lead { margin: 0 0 18px; opacity: .85; }
    .hero__cta { display: flex; gap: 10px; flex-wrap: wrap; }
    .hero__score { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.18); border-radius: 22px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
    .hero__score > span { font-size: .78rem; opacity: .85; }
    .ring { --p: 0; width: 130px; height: 130px; border-radius: 50%; background: conic-gradient(#F5B841 calc(var(--p) * 1%), rgba(255,255,255,.15) 0); display: grid; place-items: center; position: relative; }
    .ring::before { content: ''; position: absolute; inset: 10px; border-radius: 50%; background: #0B1F3A; }
    .ring strong { position: relative; font-size: 1.7rem; font-weight: 800; color: #fff; }
    .ring em { font-size: .85rem; font-style: normal; opacity: .8; }
    .hero__hint { font-size: .75rem; opacity: .8; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: #fff; padding: 22px 24px; border-radius: 20px; box-shadow: 0 8px 24px rgba(11,31,58,.05); border: 1px solid rgba(11,31,58,.06); display: flex; flex-direction: column; gap: 14px; }
    .card header { display: flex; align-items: center; gap: 10px; }
    .ic { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 1.1rem; }
    .ic--blue { background: #EFF6FF; } .ic--teal { background: #ECFDF5; } .ic--gold { background: #FEF3C7; }
    h2 { margin: 0; color: #0B1F3A; font-size: 1.05rem; }
    dl { margin: 0; }
    dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid #F1F5F9; }
    dl > div:last-child { border-bottom: 0; }
    dt { color: #64748b; font-size: .85rem; } dd { margin: 0; color: #0B1F3A; font-weight: 600; font-size: .9rem; text-align: right; }
    .bar { height: 12px; background: #F1F5F9; border-radius: 999px; overflow: hidden; }
    .bar__fill { height: 100%; background: linear-gradient(90deg, #14B8A6, #1E63D6); border-radius: 999px; transition: width .4s ease; }
    .card__text { color: #475569; line-height: 1.55; margin: 0; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: .78rem; color: #64748b; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; vertical-align: middle; }
    .dot--ok { background: #22C55E; } .dot--warn { background: #F5B841; } .dot--err { background: #EF4444; }
    .card__link { margin-top: auto; color: #1E63D6; text-decoration: none; font-weight: 600; font-size: .88rem; }
    .steps { margin: 0; padding-left: 0; list-style: none; counter-reset: step; display: grid; gap: 12px; }
    .steps li { counter-increment: step; padding-left: 38px; position: relative; color: #475569; font-size: .9rem; line-height: 1.5; }
    .steps li::before { content: counter(step); position: absolute; left: 0; top: -2px; width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #F5B841, #FBBF24); color: #0B1F3A; font-weight: 800; display: grid; place-items: center; font-size: .82rem; }
    .steps strong { color: #0B1F3A; display: block; }
    .quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 0 0 24px; }
    .quick__card { background: #fff; padding: 20px; border-radius: 18px; text-decoration: none; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 4px 12px rgba(11,31,58,.04); border: 1px solid rgba(11,31,58,.06); transition: transform .15s, box-shadow .15s; color: inherit; }
    .quick__card:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(11,31,58,.10); }
    .quick__ic { font-size: 1.5rem; }
    .quick__card strong { color: #0B1F3A; font-size: 1rem; }
    .quick__card span:last-child { color: #64748b; font-size: .82rem; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: .88rem; text-decoration: none; transition: transform .12s, box-shadow .12s; }
    .btn--gold { background: #F5B841; color: #0B1F3A; box-shadow: 0 4px 12px rgba(245,184,65,.4); }
    .btn--gold:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(245,184,65,.55); }
    .btn--ghost { background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.3); }
    .btn--ghost:hover { background: rgba(255,255,255,.2); }
    .legal { background: #FEF3C7; border-left: 4px solid #F5B841; padding: 14px 18px; border-radius: 12px; color: #78350F; font-size: .84rem; line-height: 1.55; margin: 0; }
    @media (max-width: 880px) {
      .hero { grid-template-columns: 1fr; text-align: center; }
      .hero__avatar { margin: 0 auto; } .hero__cta { justify-content: center; }
      .hero__score { max-width: 280px; margin: 0 auto; }
    }
  `],
})
export class ClientProfileComponent {
  private auth = inject(AuthContextService);
  private draft = inject(AuditDraftService);
  private data = inject(SygepecDataService);

  readonly ctx = computed(() => this.auth.context());
  readonly profile = toSignal(from(this.loadProfile()), { initialValue: null as any });
  readonly draftState = computed(() => this.draft.getDraft());
  readonly draftAnswers = computed(() => (this.draftState()?.answers || {}) as Record<string, any>);
  readonly readinessScore = computed(() => this.draftState()?.readinessScore || 0);
  readonly draftSummary = computed(() => this.draftState()?.summary?.nextAction
    || 'Lance ton audit SYGEPEC pour générer un résumé structuré et activer ton readiness score.');

  readonly initials = computed(() => {
    const name = this.profile()?.fullName || this.ctx().displayName || this.ctx().email || 'U';
    const parts = String(name).split(/[\s@]/).filter(Boolean);
    return (parts[0]?.[0] || 'U').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
  });

  readonly readinessHint = computed(() => {
    const s = this.readinessScore();
    if (s >= 80) return 'Excellent — prêt pour la revue humaine';
    if (s >= 50) return 'Bon — quelques pièces à compléter';
    if (s > 0) return 'En cours — continue l\'audit';
    return 'Lance ton audit pour démarrer';
  });

  private async loadProfile() {
    const uid = this.ctx().uid;
    if (!uid) return null;
    return this.data.getClientProfileByUserId(uid);
  }
}
