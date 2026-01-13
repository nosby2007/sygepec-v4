import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, switchMap } from 'rxjs';

import { TrainingContextService } from '../data/training-context.service';
import { CoursesRepository } from '../data/courses.repository';
import { EnrollmentsRepository } from '../data/enrollments.repository';
import { Course, Enrollment } from '../data/training.models';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';

@Component({
  standalone: true,
  selector: 'app-course-reader',
  imports: [
    CommonModule,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatProgressBarModule,
    MatListModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/training/courses" aria-label="Back">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span>{{ course()?.title || 'Course' }}</span>
      <span class="spacer"></span>

      <a mat-button routerLink="/training/live">
        <mat-icon>videocam</mat-icon>
        Live
      </a>
    </mat-toolbar>

    <div class="wrap">
      @if (!course()) {
        <mat-card class="card">
          <mat-card-content class="muted">Loading course...</mat-card-content>
        </mat-card>
      } @else {
        <div class="layout">
          <mat-card class="card side">
            <mat-card-title>Outline</mat-card-title>
            <mat-card-content>
              <div class="muted small">{{ course()!.category || 'General' }} · {{ course()!.level || '—' }}</div>
              <mat-divider class="divider"></mat-divider>

              @if ((course()!.lessons?.length || 0) === 0) {
                <div class="muted">No lessons configured. Using course main content.</div>
              } @else {
                <mat-nav-list>
                  @for (l of (sortedLessons()); track l.id) {
                    <a mat-list-item (click)="selectLesson(l.id)" [class.active]="l.id === selectedLessonId()">
                      <span matListItemTitle>{{ l.title }}</span>
                    </a>
                  }
                </mat-nav-list>
              }

              <mat-divider class="divider"></mat-divider>

              @if (userId()) {
                @if (!enrollment()) {
                  <button mat-flat-button class="w100" (click)="enroll()">Enroll</button>
                } @else {
                  <div class="muted small">Progress</div>
                  <mat-progress-bar mode="determinate" [value]="enrollment()!.progressPercent"></mat-progress-bar>
                  <div class="muted small">Last: {{ enrollment()!.lastLessonId || '—' }}</div>

                  <button mat-stroked-button class="w100" (click)="markProgress()">
                    Mark progress (+10%)
                  </button>
                }
              } @else {
                <div class="muted small">Sign in to track progress.</div>
              }
            </mat-card-content>
          </mat-card>

          <mat-card class="card main">
            <mat-card-title>{{ course()!.title }}</mat-card-title>
            <mat-card-content>
              @if (course()!.description) {
                <p class="muted">{{ course()!.description }}</p>
              }

              <mat-divider class="divider"></mat-divider>

              @if (renderedContent()) {
                <div class="content" [innerHTML]="renderedContent()"></div>
              } @else {
                <pre class="pre">{{ plainContent() }}</pre>
              }

              @if ((course()!.materials?.length || 0) > 0) {
                <mat-divider class="divider"></mat-divider>
                <div class="materials">
                  <div class="title">Materials</div>
                  <ul>
                    @for (m of (course()!.materials || []); track m.url) {
                      <li><a [href]="m.url" target="_blank" rel="noopener">{{ m.title }}</a></li>
                    }
                  </ul>
                </div>
              }
            </mat-card-content>
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap { padding: 16px; }
    .spacer { flex: 1; }
    .layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1100px) { .layout { grid-template-columns: 360px 1fr; } }
    .card { border-radius: 16px; }
    .divider { margin: 12px 0; }
    .muted { opacity: 0.75; }
    .small { font-size: 12px; }
    .w100 { width: 100%; margin-top: 10px; }
    .content { line-height: 1.6; }
    .pre { white-space: pre-wrap; margin: 0; opacity: 0.9; }
    .active { font-weight: 700; }
    .materials .title { font-weight: 700; margin-bottom: 6px; }
  `]
})
export class CourseReaderComponent {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  private ctx = inject(TrainingContextService);
  private coursesRepo = inject(CoursesRepository);
  private enrollRepo = inject(EnrollmentsRepository);

  readonly userId = toSignal(this.ctx.userId$, { initialValue: null });
  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });

  readonly courseId = toSignal(
    this.route.paramMap.pipe(map(p => p.get('courseId') as string)),
    { initialValue: '' }
  );

  readonly course = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('courseId') as string),
      switchMap(id => this.coursesRepo.getCourseById(id))
    ),
    { initialValue: null as Course | null }
  );

  readonly enrollment = toSignal(
    combineLatest([this.ctx.userId$, this.route.paramMap]).pipe(
      switchMap(([uid, pm]) => {
        const id = pm.get('courseId') as string;
        if (!uid || !id) return this.enrollRepo.getEnrollment('__none__', '__none__');
        return this.enrollRepo.getEnrollment(uid, id);
      })
    ),
    { initialValue: null as Enrollment | null }
  );

  readonly selectedLessonId = signal<string | null>(null);

  readonly sortedLessons = computed(() => {
    const lessons = this.course()?.lessons ?? [];
    return [...lessons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });

  selectLesson(id: string) {
    this.selectedLessonId.set(id);
  }

  readonly currentContent = computed(() => {
    const c = this.course();
    if (!c) return null;

    const lessonId = this.selectedLessonId();
    if (lessonId && (c.lessons?.length || 0) > 0) {
      const lesson = c.lessons!.find(l => l.id === lessonId);
      if (lesson?.content) return lesson.content;
      // fallback: if lesson has no content, keep course main content
    }
    return c.content ?? null;
  });

  readonly renderedContent = computed<SafeHtml | null>(() => {
    const content = this.currentContent();
    if (!content) return null;

    // If HTML, sanitize via Angular (trust only if you control the content).
    if (content.format === 'html') {
      return this.sanitizer.bypassSecurityTrustHtml(content.body);
    }

    // If markdown/text: keep as plain (you can plug a markdown renderer later)
    return null;
  });

  readonly plainContent = computed(() => {
    const content = this.currentContent();
    if (!content) return 'No content.';
    return content.body ?? 'No content.';
  });

  async enroll() {
    const uid = this.userId();
    const courseId = this.courseId();
    if (!uid || !courseId) return;
    await this.enrollRepo.enroll(uid, this.tenantId(), courseId);
  }

  async markProgress() {
    const uid = this.userId();
    const courseId = this.courseId();
    const e = this.enrollment();
    if (!uid || !courseId || !e) return;

    const next = Math.min(100, (e.progressPercent ?? 0) + 10);
    await this.enrollRepo.setProgress(uid, courseId, next, this.selectedLessonId());
  }
}
