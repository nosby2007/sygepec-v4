import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { TrainingContextService } from '../data/training-context.service';
import { LiveSessionsRepository } from '../data/live-sessions.repository';
import { LiveSession } from '../data/training.model';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  standalone: true,
  selector: 'app-live-sessions',
  imports: [
    CommonModule,
    RouterLink,
    DatePipe,
    MatToolbarModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatDividerModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/training" aria-label="Back">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span>Live sessions</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/training/courses">
        <mat-icon>menu_book</mat-icon>
        Courses
      </a>
    </mat-toolbar>

    <div class="wrap">
      @if (sessions().length === 0) {
        <mat-card class="card">
          <mat-card-content class="muted">No upcoming sessions.</mat-card-content>
        </mat-card>
      } @else {
        <div class="grid">
          @for (s of sessions(); track s.id) {
            <mat-card class="card">
              <mat-card-title>{{ s.title }}</mat-card-title>
              <mat-card-content>
                <div class="muted small">
                  {{ toDate(s.startAt) | date:'EEE, MMM d, y · h:mm a' }}
                  @if (s.endAt) { · ends {{ toDate(s.endAt) | date:'h:mm a' }} }
                </div>
                @if (s.description) {
                  <p class="desc">{{ s.description }}</p>
                }
                <mat-divider class="divider"></mat-divider>
                <div class="muted small">Visibility: {{ s.visibility | uppercase }}</div>
                @if (s.courseId) {
                  <div class="muted small">Course: {{ s.courseId }}</div>
                }
                @if (s.provider) {
                  <div class="muted small">Provider: {{ s.provider }}</div>
                }
              </mat-card-content>

              <mat-card-actions align="end">
                <button mat-stroked-button (click)="copy(s.joinUrl)">
                  Copy link
                </button>
                <button mat-flat-button (click)="join(s.joinUrl)">
                  Join
                </button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .wrap { padding: 16px; }
    .spacer { flex: 1; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
    .card { border-radius: 16px; }
    .divider { margin: 12px 0; }
    .muted { opacity: 0.75; }
    .small { font-size: 12px; }
    .desc { margin: 10px 0 0; }
  `]
})
export class LiveSessionsComponent {
  private ctx = inject(TrainingContextService);
  private repo = inject(LiveSessionsRepository);

  readonly sessions = toSignal(
    this.ctx.tenantId$.pipe(switchMap(tid => this.repo.listUpcoming(tid))),
    { initialValue: [] as LiveSession[] }
  );

  toDate(v: any): Date {
    if (!v) return new Date();
    if (v?.toMillis) return new Date(v.toMillis());
    return new Date(v);
  }

  join(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async copy(text: string) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }
}
