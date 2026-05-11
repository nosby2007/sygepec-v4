import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { TrainingContextService } from '../data/training-context.service';
import { CoursesRepository } from '../data/courses.repository';
import { EnrollmentsRepository, Enrollment as RepoEnrollment } from '../data/EnrollmentsRepository';
import { LiveSessionsRepository } from '../data/live-sessions.repository';
import { CourseSummary, LiveSession } from '../data/training.model';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  standalone: true,
  selector: 'app-training-home',
  imports: [CommonModule, RouterLink, DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <!-- HERO -->
      <header class="hero">
        <div class="hero-bg"></div>
        <div class="hero-inner">
          <nav class="breadcrumb" aria-label="Fil d'Ariane">
            <a routerLink="/dashboard">Tableau de bord</a>
            <mat-icon>chevron_right</mat-icon>
            <span>Formation</span>
          </nav>
          <div class="hero-row">
            <div>
              <span class="badge">
                <mat-icon>school</mat-icon> Espace Formation
              </span>
              <h1>Salle de formation SYGEPEC</h1>
              <p>Cours en ligne, sessions live et suivi de progression pour vous préparer au mieux.</p>
            </div>
            <div class="cta-group">
              <a mat-stroked-button routerLink="/training/courses" class="cta-light">
                <mat-icon>menu_book</mat-icon> Cours
              </a>
              <a mat-flat-button color="primary" routerLink="/training/live" class="cta">
                <mat-icon>videocam</mat-icon> Sessions live
              </a>
            </div>
          </div>
        </div>
      </header>

      <!-- KPIs -->
      <section class="kpi-grid">
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-blue"><mat-icon>menu_book</mat-icon></div>
          <div>
            <div class="kpi-label">Cours disponibles</div>
            <div class="kpi-value">{{ availableCourses().length }}</div>
          </div>
        </article>
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-amber"><mat-icon>bookmark</mat-icon></div>
          <div>
            <div class="kpi-label">Mes inscriptions</div>
            <div class="kpi-value">{{ myEnrollments().length }}</div>
          </div>
        </article>
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-red"><mat-icon>videocam</mat-icon></div>
          <div>
            <div class="kpi-label">Sessions à venir</div>
            <div class="kpi-value">{{ upcomingSessions().length }}</div>
          </div>
        </article>
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-green"><mat-icon>workspace_premium</mat-icon></div>
          <div>
            <div class="kpi-label">Tenant</div>
            <div class="kpi-value-sm">{{ tenantId() || 'PUBLIC' }}</div>
          </div>
        </article>
      </section>

      <div class="grid-2">
        <!-- MY LEARNING -->
        <section class="card">
          <header class="card-head">
            <div>
              <h2>Mon apprentissage</h2>
              <p class="muted">Vos cours en cours et leur progression</p>
            </div>
          </header>

          @if (!userId()) {
            <div class="empty-inline">
              <mat-icon>lock</mat-icon>
              <p>Connectez-vous pour voir vos inscriptions et votre progression.</p>
            </div>
          } @else if (myLearning().length === 0) {
            <div class="empty-inline">
              <mat-icon>auto_stories</mat-icon>
              <p>Aucune inscription pour l'instant — démarrez avec un cours.</p>
              <a mat-stroked-button routerLink="/training/courses">Parcourir les cours</a>
            </div>
          } @else {
            <div class="rows">
              @for (item of myLearning(); track item.course.id) {
                <div class="learn-row">
                  <div class="row-icon"><mat-icon>play_circle</mat-icon></div>
                  <div class="row-main">
                    <div class="row-title">{{ item.course.title }}</div>
                    <div class="row-sub">
                      {{ item.course.category || 'Général' }} · {{ item.course.level || '—' }}
                    </div>
                    <mat-progress-bar mode="determinate" [value]="item.enrollment.progress ?? 0"></mat-progress-bar>
                    <div class="row-sub right">{{ item.enrollment.progress ?? 0 }}%</div>
                  </div>
                  <a mat-stroked-button [routerLink]="['/training/courses', item.course.id]">Ouvrir</a>
                </div>
              }
            </div>
          }
        </section>

        <!-- UPCOMING SESSIONS -->
        <section class="card">
          <header class="card-head">
            <div>
              <h2>Sessions live à venir</h2>
              <p class="muted">Rejoignez les prochaines sessions interactives</p>
            </div>
            <a mat-stroked-button routerLink="/training/live">Voir tout</a>
          </header>

          @if (upcomingSessions().length === 0) {
            <div class="empty-inline">
              <mat-icon>event_busy</mat-icon>
              <p>Aucune session programmée pour le moment.</p>
            </div>
          } @else {
            <div class="rows">
              @for (s of upcomingSessions(); track s.id) {
                <div class="session-row">
                  <div class="session-date">
                    <div class="date-day">{{ toDate(s.startAt) | date:'d' }}</div>
                    <div class="date-mon">{{ toDate(s.startAt) | date:'MMM' }}</div>
                  </div>
                  <div class="row-main">
                    <div class="row-title">{{ s.title }}</div>
                    <div class="row-sub">
                      <mat-icon>schedule</mat-icon>
                      {{ toDate(s.startAt) | date:'EEE · h:mm a' }}
                    </div>
                    @if (s.courseId) {
                      <div class="row-sub">
                        <mat-icon>menu_book</mat-icon> {{ s.courseId }}
                      </div>
                    }
                  </div>
                  <a mat-flat-button color="primary" routerLink="/training/live">Rejoindre</a>
                </div>
              }
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page { display: grid; gap: 24px; padding: 0 0 48px; }

    /* Hero */
    .hero { position: relative; padding: 36px 32px 32px; border-radius: 24px; overflow: hidden;
      background: linear-gradient(135deg, #0a1628 0%, #2a1d5e 55%, #1e63d6 100%); color: #fff; }
    .hero-bg { position: absolute; inset: 0;
      background:
        radial-gradient(circle at 80% 25%, rgba(245,184,65,.22), transparent 45%),
        radial-gradient(circle at 20% 90%, rgba(80,40,180,.4), transparent 50%); }
    .hero-inner { position: relative; }
    .breadcrumb { display: flex; align-items: center; gap: 4px; font-size: 13px;
      color: rgba(255,255,255,.78); margin-bottom: 16px; }
    .breadcrumb a { color: inherit; text-decoration: none; }
    .breadcrumb a:hover { color: #f5b841; }
    .breadcrumb mat-icon { font-size: 16px; width: 16px; height: 16px; opacity: .6; }
    .hero-row { display: flex; justify-content: space-between; align-items: end; gap: 24px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px; background: rgba(245,184,65,.2);
      color: #f5b841; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 12px; }
    .badge mat-icon { font-size: 14px; width: 14px; height: 14px; }
    h1 { margin: 0 0 8px; font-size: 2rem; font-weight: 800; letter-spacing: -.02em;
      font-family: 'Sora', 'Avenir Next', sans-serif; }
    .hero p { margin: 0; opacity: .85; max-width: 540px; }
    .cta-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .cta { background: #f5b841 !important; color: #0a1628 !important;
      box-shadow: 0 8px 24px rgba(245,184,65,.4) !important; font-weight: 700; }
    .cta-light { color: #fff !important; border-color: rgba(255,255,255,.4) !important; }

    /* Cards */
    .card { background: #fff; border-radius: 18px; padding: 24px;
      box-shadow: 0 2px 14px rgba(10,22,40,.06); border: 1px solid #eef2f7; }
    .card-head { display: flex; justify-content: space-between; align-items: start; gap: 16px; margin-bottom: 16px; }
    .card-head h2 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #0a1628; }
    .muted { margin: 4px 0 0; color: #6b7d94; font-size: .85rem; }

    /* KPIs */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .kpi-card { background: #fff; border-radius: 16px; padding: 18px;
      box-shadow: 0 2px 12px rgba(10,22,40,.05); border: 1px solid #eef2f7;
      display: flex; align-items: center; gap: 14px; }
    .kpi-ring { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; flex-shrink: 0; }
    .kpi-ring mat-icon { color: #fff; }
    .kpi-ring-blue { background: linear-gradient(135deg, #1e63d6, #4287f5); box-shadow: 0 6px 16px rgba(30,99,214,.3); }
    .kpi-ring-amber { background: linear-gradient(135deg, #f5b841, #e89c1c); box-shadow: 0 6px 16px rgba(245,184,65,.3); }
    .kpi-ring-red { background: linear-gradient(135deg, #c0392b, #e55b4d); box-shadow: 0 6px 16px rgba(192,57,43,.3); }
    .kpi-ring-green { background: linear-gradient(135deg, #16a34a, #4ade80); box-shadow: 0 6px 16px rgba(22,163,74,.3); }
    .kpi-label { font-size: 12px; color: #6b7d94; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
    .kpi-value { font-size: 1.7rem; font-weight: 800; color: #0a1628; line-height: 1.1; }
    .kpi-value-sm { font-size: 1rem; font-weight: 700; color: #0a1628; }

    /* Layout */
    .grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1100px) { .grid-2 { grid-template-columns: 1.2fr 1fr; } }

    /* Rows */
    .rows { display: grid; gap: 10px; }
    .learn-row { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center;
      padding: 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #eef2f7; }
    .learn-row:hover { background: #fff; border-color: #d6dde6; }
    .session-row { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center;
      padding: 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #eef2f7; }
    .session-row:hover { background: #fff; border-color: #d6dde6; }
    .row-icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center;
      background: rgba(30,99,214,.1); color: #1e63d6; }
    .row-main { min-width: 0; }
    .row-title { font-weight: 700; color: #0a1628; }
    .row-sub { font-size: 12px; color: #6b7d94; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; }
    .row-sub mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .row-sub.right { text-align: right; display: block; }
    .session-date { width: 56px; height: 56px; border-radius: 12px; display: grid; place-items: center;
      background: linear-gradient(135deg, #c0392b, #e55b4d); color: #fff; flex-shrink: 0;
      box-shadow: 0 6px 14px rgba(192,57,43,.3); }
    .date-day { font-size: 1.4rem; font-weight: 800; line-height: 1; }
    .date-mon { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; opacity: .9; margin-top: 2px; }

    /* Empty inline */
    .empty-inline { text-align: center; padding: 32px 16px; color: #6b7d94; }
    .empty-inline mat-icon { font-size: 36px; width: 36px; height: 36px; color: #1e63d6; opacity: .65; margin-bottom: 8px; }
    .empty-inline p { margin: 0 0 12px; font-size: .9rem; }
    .empty-inline a { margin-top: 4px; }
    mat-progress-bar { margin-top: 8px; border-radius: 4px; overflow: hidden; }
  `]
})
export class TrainingHomeComponent {
  private ctx = inject(TrainingContextService);
  private coursesRepo = inject(CoursesRepository);
  private enrollRepo = inject(EnrollmentsRepository);
  private liveRepo = inject(LiveSessionsRepository);

  readonly userId = toSignal(this.ctx.userId$, { initialValue: null });
  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });

  readonly availableCourses = toSignal(
    this.ctx.tenantId$.pipe(switchMap(tid => this.coursesRepo.listAvailableCourses(tid))),
    { initialValue: [] as CourseSummary[] }
  );

  readonly myEnrollments = toSignal(
    this.ctx.userId$.pipe(
      switchMap(uid => {
        if (!uid) return this.enrollRepo.listMyEnrollments('__none__');
        return this.ctx.tenantId$.pipe(
          switchMap(_tid => this.enrollRepo.listMyEnrollments(uid))
        );
      })
    ),
    { initialValue: [] as RepoEnrollment[] }
  );

  readonly upcomingSessions = toSignal(
    this.ctx.tenantId$.pipe(switchMap(tid => this.liveRepo.listUpcoming(tid))),
    { initialValue: [] as LiveSession[] }
  );

  readonly myLearning = computed(() => {
    const courses = this.availableCourses();
    const enrolls = this.myEnrollments();
    const byCourse = new Map((enrolls ?? []).map(e => [e.courseId, e]));
    return courses
      .filter(c => byCourse.has(c.id))
      .map(c => ({ course: c, enrollment: byCourse.get(c.id)! }));
  });

  toDate(v: any): Date {
    if (!v) return new Date();
    if (v?.toMillis) return new Date(v.toMillis());
    return new Date(v);
  }
}
