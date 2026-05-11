import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';

import { TrainingContextService } from '../data/training-context.service';
import { CoursesRepository } from '../data/courses.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { CourseSummary } from '../data/training.model';
import { EnrollmentsRepository, Enrollment } from '../data/EnrollmentsRepository';

@Component({
  standalone: true,
  selector: 'app-courses-list',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/training" aria-label="Back">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span>Courses</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/training/live">
        <mat-icon>videocam</mat-icon>
        Live sessions
      </a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-content class="filters">
          <mat-form-field appearance="outline" class="search">
            <mat-label>Search course</mat-label>
            <input matInput [formControl]="q" placeholder="wound care, compliance, IT..." />
          </mat-form-field>

          <div class="muted small">
            Showing {{ filtered().length }} / {{ courses().length }}
          </div>
        </mat-card-content>
      </mat-card>

      <div class="grid">
        @for (c of filtered(); track c.id) {
          <mat-card class="course-card">
            <mat-card-title>{{ c.title }}</mat-card-title>
            <mat-card-content>
              <div class="muted small">
                {{ c.category || 'General' }} · {{ c.level || '—' }} · {{ c.visibility | uppercase }}
              </div>

              @if (c.description) {
                <p class="desc">{{ c.description }}</p>
              } @else {
                <p class="desc muted">No description.</p>
              }

              @if ((c.tags?.length || 0) > 0) {
                <mat-chip-set>
                  @for (t of (c.tags || []); track t) {
                    <mat-chip>{{ t }}</mat-chip>
                  }
                </mat-chip-set>
              }
            </mat-card-content>

            <mat-divider></mat-divider>

            <mat-card-actions align="end">
              <a mat-stroked-button [routerLink]="['/training/courses', c.id]">Details</a>

              @if (userId() && !isEnrolled(c.id)) {
                <button mat-flat-button (click)="enroll(c.id)">Enroll</button>
              } @else if (userId() && isEnrolled(c.id)) {
                <a mat-flat-button [routerLink]="['/training/courses', c.id]">Open</a>
              } @else {
                <a mat-flat-button [routerLink]="['/training/courses', c.id]">Open</a>
              }
            </mat-card-actions>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: [`
    .wrap { padding: 16px; }
    .spacer { flex: 1; }
    .card, .course-card { border-radius: 16px; }
    .filters { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .search { width: 100%; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; }
    @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
    .muted { opacity: 0.75; }
    .small { font-size: 12px; }
    .desc { margin: 10px 0 0; }
  `]
})
export class CoursesListComponent {
  private ctx = inject(TrainingContextService);
  private coursesRepo = inject(CoursesRepository);
  private enrollRepo = inject(EnrollmentsRepository);

  readonly q = new FormControl('', { nonNullable: true });

  readonly userId = toSignal(this.ctx.userId$, { initialValue: null });
  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });

  readonly courses = toSignal(
    this.ctx.tenantId$.pipe(switchMap(tid => this.coursesRepo.listAvailableCourses(tid))),
    { initialValue: [] as CourseSummary[] }
  );

  readonly enrollments = toSignal(
    this.ctx.userId$.pipe(
      switchMap(uid => {
        if (!uid) return this.enrollRepo.listMyEnrollments('__none__');
        return this.ctx.tenantId$.pipe(switchMap(_tid => this.enrollRepo.listMyEnrollments(uid)));
      })
    ),
    { initialValue: [] as Enrollment[] }
  );

  readonly queryText = toSignal(
    this.q.valueChanges.pipe(
      startWith(this.q.value),
      debounceTime(200),
      distinctUntilChanged(),
      map(v => (v ?? '').trim().toLowerCase())
    ),
    { initialValue: '' }
  );

  readonly filtered = computed(() => {
    const text = this.queryText();
    const list = this.courses();

    if (!text) return list;

    return list.filter(c => {
      const hay = [
        c.title,
        c.description ?? '',
        c.category ?? '',
        (c.tags ?? []).join(' ')
      ].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  isEnrolled(courseId: string): boolean {
    return this.enrollments().some((e: Enrollment) => e.courseId === courseId && e.status !== 'cancelled');
  }

  async enroll(courseId: string) {
    const uid = this.userId();
    if (!uid) return;
    await this.enrollRepo.enroll({ userId: uid, tenantId: this.tenantId(), courseId, status: 'enrolled' });
  }
}
