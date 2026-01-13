import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { TrainingContextService } from '../data/training-context.service';
import { CoursesRepository } from '../data/courses.repository';
import { EnrollmentsRepository } from '../data/enrollments.repository';
import { LiveSessionsRepository } from '../data/live-sessions.repository';
import { CourseSummary, Enrollment, LiveSession } from '../data/training.models';

// Material (remove if you don't use Angular Material)
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  standalone: true,
  selector: 'app-training-home',
  imports: [
    CommonModule,
    RouterLink,
    DatePipe,
    MatToolbarModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatDividerModule,
    MatProgressBarModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>Training Room</span>
      <span class="spacer"></span>

      <a mat-button routerLink="/training/courses">
        <mat-icon>menu_book</mat-icon>
        Courses
      </a>

      <a mat-button routerLink="/training/live">
        <mat-icon>videocam</mat-icon>
        Live sessions
      </a>
    </mat-toolbar>

    <div class="wrap">
      <div class="grid">
        <mat-card class="card">
          <mat-card-title>Welcome</mat-card-title>
          <mat-card-content>
            <div class="muted">
              Tenant: <b>{{ tenantId() || 'PUBLIC' }}</b>
            </div>
            <div class="muted">
              User: <b>{{ userId() || 'Not signed in' }}</b>
            </div>

            <mat-divider class="divider"></mat-divider>

            <div class="kpi">
              <div class="kpi-item">
                <div class="kpi-label">Available courses</div>
                <div class="kpi-value">{{ availableCourses().length }}</div>
              </div>
              <div class="kpi-item">
                <div class="kpi-label">My enrollments</div>
                <div class="kpi-value">{{ myEnrollments().length }}</div>
              </div>
              <div class="kpi-item">
                <div class="kpi-label">Upcoming live sessions</div>
                <div class="kpi-value">{{ upcomingSessions().length }}</div>
              </div>
            </div>
          </mat-card-content>

          <mat-card-actions align="end">
            <a mat-stroked-button routerLink="/training/courses">Browse courses</a>
            <a mat-flat-button routerLink="/training/live">See live sessions</a>
          </mat-card-actions>
        </mat-card>

        <mat-card class="card">
          <mat-card-title>My learning</mat-card-title>
          <mat-card-content>
            @if (!userId()) {
              <div class="muted">Sign in to see your enrollments and progress.</div>
            } @else {
              @if (myLearning().length === 0) {
                <div class="muted">No enrollments yet. Start with a course.</div>
              } @else {
                <div class="list">
                  @for (item of myLearning(); track item.course.id) {
                    <div class="row">
                      <div class="row-main">
                        <div class="title">{{ item.course.title }}</div>
                        <div class="muted small">
                          {{ item.course.category || 'General' }} · {{ item.course.level || '—' }}
                        </div>
                        <mat-progress-bar mode="determinate" [value]="item.enrollment.progressPercent"></mat-progress-bar>
                        <div class="muted small">
                          Progress: {{ item.enrollment.progressPercent }}%
                        </div>
                      </div>
                      <div class="row-actions">
                        <a mat-stroked-button [routerLink]="['/training/courses', item.course.id]">
                          Open
                        </a>
                      </div>
                    </div>
                    <mat-divider class="divider"></mat-divider>
                  }
                </div>
              }
            }
          </mat-card-content>
        </mat-card>

        <mat-card class="card">
          <mat-card-title>Upcoming live sessions</mat-card-title>
          <mat-card-content>
            @if (upcomingSessions().length === 0) {
              <div class="muted">No scheduled sessions.</div>
            } @else {
              <div class="list">
                @for (s of upcomingSessions(); track s.id) {
                  <div class="row">
                    <div class="row-main">
                      <div class="title">{{ s.title }}</div>
                      <div class="muted small">
                        {{ toDate(s.startAt) | date:'EEE, MMM d, y · h:mm a' }}
                      </div>
                      @if (s.courseId) {
                        <div class="muted small">Course: {{ s.courseId }}</div>
                      }
                    </div>
                    <div class="row-actions">
                      <a mat-flat-button routerLink="/training/live">Join</a>
                    </div>
                  </div>
                  <mat-divider class="divider"></mat-divider>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .wrap { padding: 16px; }
    .spacer { flex: 1; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1000px) { .grid { grid-template-columns: 1.2fr 1fr; } }
    .card { border-radius: 16px; }
    .divider { margin: 12px 0; }
    .muted { opacity: 0.75; }
    .small { font-size: 12px; }
    .kpi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .kpi-item { padding: 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; }
    .kpi-label { font-size: 12px; opacity: .75; }
    .kpi-value { font-size: 22px; font-weight: 700; }
    .list { margin-top: 8px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 10px 0; }
    .title { font-weight: 700; }
    .row-actions { display: flex; align-items: start; gap: 8px; }
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
        if (!uid) return this.enrollRepo.listUserEnrollments('__none__', null);
        return this.ctx.tenantId$.pipe(
          switchMap(tid => this.enrollRepo.listUserEnrollments(uid, tid))
        );
      })
    ),
    { initialValue: [] as Enrollment[] }
  );

  readonly upcomingSessions = toSignal(
    this.ctx.tenantId$.pipe(switchMap(tid => this.liveRepo.listUpcoming(tid))),
    { initialValue: [] as LiveSession[] }
  );

  readonly myLearning = computed(() => {
    const courses = this.availableCourses();
    const enrolls = this.myEnrollments();
    const byCourse = new Map(enrolls.map(e => [e.courseId, e]));
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
