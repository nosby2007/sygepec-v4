import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { SygepecDataService } from '../../../core/services/sygepec-data.service';

@Component({
  standalone: true,
  selector: 'app-client-training-recommendations',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <nav class="bc" aria-label="Breadcrumb"><a routerLink="/dashboard">Dashboard</a> <span>›</span> <strong>Formations recommandées</strong></nav>

      <header class="hero">
        <div class="hero__copy">
          <p class="eyebrow">Powered by Innovacare Training</p>
          <h1>Mes formations recommandées</h1>
          <p class="lead">SYGEPEC recommande uniquement les programmes qui débloquent réellement ton dossier, ton niveau de langue ou ta conformité professionnelle. Pas de formation superflue.</p>
          <div class="hero__cta">
            <a routerLink="/training" class="btn btn--gold">Catalogue complet</a>
            <a routerLink="/support" class="btn btn--ghost">Parler à un conseiller</a>
          </div>
        </div>
        <aside class="hero__stats">
          <div><strong>{{ recommendations().length }}</strong><span>Recommandations</span></div>
          <div><strong>{{ priorityCount('high') }}</strong><span>Prioritaires</span></div>
          <div><strong>{{ enrolledCount() }}</strong><span>Inscrits</span></div>
        </aside>
      </header>

      @if (!recommendations().length) {
        <section class="empty">
          <div class="empty__ic">🎓</div>
          <h2>Aucune formation recommandée</h2>
          <p>Termine ton audit personnel pour que SYGEPEC identifie les formations utiles à ton parcours.</p>
          <a routerLink="/start-audit" class="btn btn--gold btn--lg">Lancer mon audit</a>
        </section>
      } @else {
        <section class="grid">
          @for (rec of recommendations(); track rec.recommendedProgramId) {
            <article class="course" [attr.data-priority]="rec.priority">
              <div class="course__top">
                <div class="course__badge"><span aria-hidden="true">{{ programEmoji(rec.programTitle) }}</span></div>
                <span class="pill" [ngClass]="priorityClass(rec.priority)">{{ priorityLabel(rec.priority) }}</span>
              </div>
              <h2>{{ rec.programTitle }}</h2>
              <p class="reason">{{ rec.recommendationReason }}</p>
              @if (rec.aiRationale) {
                <blockquote class="rationale"><span class="rationale__ic" aria-hidden="true">🤖</span><span>{{ rec.aiRationale }}</span></blockquote>
              }
              <div class="course__meta">
                <span><em>Statut</em><strong>{{ statusLabel(rec.status) }}</strong></span>
                <span><em>Programme</em><strong class="code">{{ rec.recommendedProgramId }}</strong></span>
              </div>
              <footer class="course__ft">
                <a routerLink="/training" class="btn btn--gold btn--sm">Démarrer</a>
                <a routerLink="/client/profile" class="btn btn--link btn--sm">Voir le gap profil →</a>
              </footer>
            </article>
          }
        </section>
      }

      <section class="why">
        <header><span class="ic">💡</span><h2>Pourquoi ces recommandations ?</h2></header>
        <div class="why__grid">
          <article><strong>Ciblé</strong><p>Basé sur ton audit personnel et ta destination.</p></article>
          <article><strong>Priorisation</strong><p>Les formations critiques débloquent ton dossier d'abord.</p></article>
          <article><strong>Validé</strong><p>Programmes Innovacare reconnus par les organismes immigration.</p></article>
          <article><strong>Continu</strong><p>Ton parcours s'ajuste au fur et à mesure de tes progrès.</p></article>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; background: linear-gradient(180deg, #F6F9FC 0%, #FFFFFF 320px); min-height: 100%; }
    .page { max-width: 1280px; margin: 0 auto; padding: 24px clamp(16px, 4vw, 40px) 64px; }
    .bc { color: #64748b; font-size: .85rem; margin-bottom: 16px; }
    .bc a { color: #1E63D6; text-decoration: none; } .bc strong { color: #0B1F3A; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: center; background: linear-gradient(135deg, #0B1F3A 0%, #123C69 70%, #1E63D6 130%); color: #fff; padding: 32px clamp(20px, 4vw, 40px); border-radius: 28px; box-shadow: 0 24px 48px -16px rgba(11,31,58,.35); position: relative; overflow: hidden; }
    .hero::before { content: ''; position: absolute; inset: -40% -10% auto auto; width: 460px; height: 460px; background: radial-gradient(circle, rgba(245,184,65,.22), transparent 60%); pointer-events: none; }
    .hero__copy { position: relative; }
    .eyebrow { color: #F5B841; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: .72rem; margin: 0 0 10px; }
    h1 { margin: 0 0 12px; font-size: clamp(1.7rem, 3vw, 2.4rem); line-height: 1.15; }
    .lead { margin: 0 0 20px; opacity: .88; max-width: 580px; line-height: 1.55; }
    .hero__cta { display: flex; gap: 12px; flex-wrap: wrap; }
    .hero__stats { display: grid; gap: 12px; }
    .hero__stats div { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); padding: 16px 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; backdrop-filter: blur(8px); }
    .hero__stats strong { font-size: 1.7rem; font-weight: 800; color: #F5B841; }
    .hero__stats span { font-size: .82rem; opacity: .9; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin: 24px 0; }
    .course { background: #fff; padding: 22px 24px; border-radius: 22px; box-shadow: 0 8px 24px rgba(11,31,58,.06); border: 1px solid rgba(11,31,58,.06); display: flex; flex-direction: column; gap: 12px; transition: transform .15s, box-shadow .15s; position: relative; overflow: hidden; }
    .course::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: #1E63D6; }
    .course[data-priority="high"]::before { background: linear-gradient(90deg, #EF4444, #F59E0B); }
    .course[data-priority="medium"]::before { background: linear-gradient(90deg, #F59E0B, #F5B841); }
    .course[data-priority="low"]::before { background: linear-gradient(90deg, #14B8A6, #1E63D6); }
    .course:hover { transform: translateY(-3px); box-shadow: 0 16px 32px rgba(11,31,58,.12); }
    .course__top { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
    .course__badge { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #EFF6FF, #DBEAFE); display: grid; place-items: center; font-size: 1.8rem; }
    .pill { padding: 5px 12px; border-radius: 999px; font-size: .72rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .pill.danger { background: #FEE2E2; color: #991B1B; } .pill.warning { background: #FEF3C7; color: #92400E; } .pill.info { background: #DBEAFE; color: #1E40AF; }
    h2 { margin: 0; color: #0B1F3A; font-size: 1.15rem; line-height: 1.3; }
    .reason { margin: 0; color: #475569; font-size: .9rem; line-height: 1.55; }
    .rationale { margin: 0; padding: 12px 14px; background: #F8FAFC; border-left: 3px solid #14B8A6; border-radius: 0 10px 10px 0; display: flex; gap: 10px; font-size: .85rem; color: #334155; line-height: 1.5; }
    .rationale__ic { font-size: 1.05rem; }
    .course__meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 14px; background: #F8FAFC; border-radius: 12px; }
    .course__meta em { display: block; font-size: .68rem; color: #64748b; text-transform: uppercase; letter-spacing: .06em; font-style: normal; margin-bottom: 2px; }
    .course__meta strong { font-size: .88rem; color: #0B1F3A; }
    .code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: .75rem; }
    .course__ft { display: flex; gap: 10px; align-items: center; padding-top: 8px; border-top: 1px dashed #E2E8F0; flex-wrap: wrap; }
    .empty { background: #fff; border-radius: 22px; padding: 60px 20px; text-align: center; border: 2px dashed #CBD5E1; }
    .empty__ic { font-size: 3.2rem; margin-bottom: 12px; }
    .empty h2 { color: #0B1F3A; margin: 0 0 6px; }
    .empty p { color: #64748b; margin: 0 0 22px; }
    .why { background: linear-gradient(135deg, #ECFDF5, #DCFCE7); padding: 28px clamp(20px, 4vw, 36px); border-radius: 22px; margin-top: 16px; border: 1px solid rgba(20,184,166,.2); }
    .why header { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
    .why .ic { width: 38px; height: 38px; border-radius: 11px; background: rgba(20,184,166,.18); display: grid; place-items: center; font-size: 1.1rem; }
    .why h2 { color: #134E4A; }
    .why__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
    .why__grid article { background: rgba(255,255,255,.6); padding: 14px 16px; border-radius: 12px; }
    .why__grid strong { color: #0B1F3A; display: block; margin-bottom: 4px; }
    .why__grid p { margin: 0; font-size: .85rem; color: #475569; line-height: 1.5; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: .88rem; text-decoration: none; transition: transform .12s, box-shadow .12s; cursor: pointer; border: 0; }
    .btn--gold { background: #F5B841; color: #0B1F3A; box-shadow: 0 4px 12px rgba(245,184,65,.4); }
    .btn--gold:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(245,184,65,.55); }
    .btn--ghost { background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.3); }
    .btn--ghost:hover { background: rgba(255,255,255,.2); }
    .btn--sm { padding: 8px 14px; font-size: .82rem; }
    .btn--lg { padding: 13px 26px; font-size: .95rem; }
    .btn--link { background: transparent; color: #1E63D6; padding: 8px 4px; }
    @media (max-width: 880px) { .hero { grid-template-columns: 1fr; } }
  `],
})
export class ClientTrainingRecommendationsComponent {
  private auth = inject(AuthContextService);
  private data = inject(SygepecDataService);

  readonly ctx = computed(() => this.auth.context());
  readonly recommendations = toSignal(from(this.loadRecommendations()), { initialValue: [] as any[] });

  private async loadRecommendations() {
    const uid = this.ctx().uid;
    if (!uid) return [];
    return this.data.getTrainingRecommendationsForClient(uid);
  }

  priorityClass(priority: string): string {
    if (priority === 'high') return 'danger';
    if (priority === 'medium') return 'warning';
    return 'info';
  }
  priorityLabel(priority: string): string {
    return priority === 'high' ? 'Prioritaire' : priority === 'medium' ? 'Recommandé' : 'Optionnel';
  }
  priorityCount(p: string): number {
    return this.recommendations().filter((r) => r.priority === p).length;
  }
  enrolledCount(): number {
    return this.recommendations().filter((r) => r.status === 'enrolled' || r.status === 'in_progress').length;
  }
  statusLabel(s: string): string {
    const map: Record<string, string> = { recommended: 'Recommandé', enrolled: 'Inscrit', in_progress: 'En cours', completed: 'Terminé', dismissed: 'Ignoré' };
    return map[s] || s || '—';
  }
  programEmoji(title: string): string {
    const t = (title || '').toLowerCase();
    if (t.includes('ielts') || t.includes('oet') || t.includes('langue')) return '🗣️';
    if (t.includes('nclex') || t.includes('nurs') || t.includes('infirm')) return '🏥';
    if (t.includes('dha') || t.includes('doh')) return '🩺';
    if (t.includes('document')) return '📄';
    return '🎓';
  }
}
