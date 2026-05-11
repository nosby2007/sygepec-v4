import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { NotificationRepository } from '../../../core/repositories/notification.repository';
import { LoggerService } from '../../../core/logging/logger.service';
import type { Notification } from '../../../core/models/canonical/notification.model';
import { viewForNotificationKind, isUnread } from '../../../core/services/notification-type-label';
import type { Timestamp } from 'firebase/firestore';

interface PageState {
  loading: boolean;
  error: string | null;
  notifications: Notification[];
  unreadCount: number;
}

const INITIAL: PageState = { loading: true, error: null, notifications: [], unreadCount: 0 };

const SAFE_LINK_PREFIX = /^\/(dashboard|client|immigration|travel|training|jobs|support)(\/|$)/;

@Component({
  standalone: true,
  selector: 'app-client-notifications',
  imports: [CommonModule, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="hero">
        <a routerLink="/dashboard" class="back">&larr; Tableau de bord</a>
        <span class="badge">Notifications</span>
        <h1>Vos notifications</h1>
        <p class="lead">
          Mises à jour de votre dossier, documents, paiements, voyages et messages.
          @if (state().unreadCount > 0) {
            <strong>{{ state().unreadCount }} non lue{{ state().unreadCount > 1 ? 's' : '' }}.</strong>
          } @else {
            Tout est à jour.
          }
        </p>
      </header>

      @if (state().loading) {
        <article class="card center">
          <p class="muted">Chargement…</p>
        </article>
      } @else if (state().error) {
        <article class="card center">
          <p class="err">{{ state().error }}</p>
          <button class="btn-secondary" type="button" (click)="retry()">Réessayer</button>
        </article>
      } @else if (state().notifications.length === 0) {
        <article class="card center">
          <span class="empty-icon" aria-hidden="true">🔔</span>
          <h2>Aucune notification</h2>
          <p class="muted">Vous serez prévenu ici dès qu'un agent vous répond ou qu'un document évolue.</p>
        </article>
      } @else {
        <article class="card actions-card">
          <button
            class="btn-secondary"
            type="button"
            (click)="markAllRead()"
            [disabled]="markingAll() || state().unreadCount === 0">
            {{ markingAll() ? 'Mise à jour…' : 'Tout marquer comme lu' }}
          </button>
          @if (actionError()) {
            <span class="err">{{ actionError() }}</span>
          }
        </article>

        <ul class="notif-list">
          @for (n of state().notifications; track n.id) {
            <li class="notif-row" [class.unread]="isUnreadFn(n)">
              <span class="dot" [class.dot-on]="isUnreadFn(n)" aria-hidden="true"></span>
              <div class="notif-main">
                <div class="notif-head">
                  <span class="cat-pill" [class]="'pill-' + classFor(n)">{{ categoryFor(n) }}</span>
                  <span class="notif-title">{{ n.title }}</span>
                </div>
                <p class="notif-body">{{ n.body }}</p>
                <div class="notif-meta muted small">
                  {{ toDate(n.createdAt) | date:'d MMM y, HH:mm' }}
                  @if (safeLink(n.link); as link) {
                    · <a [routerLink]="link" (click)="markRead(n)">Ouvrir</a>
                  }
                </div>
              </div>
              @if (isUnreadFn(n)) {
                <button
                  class="btn-link"
                  type="button"
                  (click)="markRead(n)"
                  [disabled]="markingId() === n.id">
                  {{ markingId() === n.id ? '…' : 'Marquer lu' }}
                </button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .page { max-width: 880px; margin: 0 auto; padding: 24px 20px 48px; display: grid; gap: 20px; }
      .hero { background: linear-gradient(135deg, #0F4C81 0%, #1E6FB8 60%, #2E8DD9 100%); color: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 8px 28px rgba(15, 76, 129, .25); }
      .hero .back { color: rgba(255,255,255,.85); text-decoration: none; font-size: 13px; }
      .hero .back:hover { color: #fff; }
      .hero .badge { display: inline-block; margin-top: 14px; background: rgba(255,255,255,.18); padding: 4px 12px; border-radius: 999px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      .hero h1 { margin: 12px 0 6px; font-size: 28px; font-weight: 700; }
      .hero .lead { margin: 0; opacity: .95; max-width: 620px; line-height: 1.55; font-size: 14.5px; }
      .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 24px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
      .card.center { text-align: center; padding: 36px 24px; }
      .card.actions-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; }
      .btn-secondary { background: #fff; color: #0F4C81; border: 1px solid #0F4C81; padding: 8px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; }
      .btn-secondary:disabled { opacity: .55; cursor: not-allowed; }
      .btn-link { background: none; border: none; color: #0F4C81; font-weight: 600; cursor: pointer; font-size: 13px; padding: 4px 8px; }
      .btn-link:disabled { opacity: .55; cursor: not-allowed; }
      .empty-icon { font-size: 36px; display: block; margin-bottom: 8px; }
      .muted { opacity: .75; }
      .small { font-size: 12px; }
      .err { color: #B91C1C; font-size: 13px; font-weight: 600; }
      .notif-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
      .notif-row { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: flex-start; padding: 14px 16px; background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
      .notif-row.unread { background: #F0F7FF; border-color: #BFDBFE; }
      .dot { width: 10px; height: 10px; border-radius: 50%; background: #CBD5E1; margin-top: 6px; }
      .dot-on { background: #2563EB; box-shadow: 0 0 0 3px rgba(37, 99, 235, .15); }
      .notif-main { min-width: 0; display: grid; gap: 4px; }
      .notif-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .notif-title { font-weight: 600; color: #0F172A; }
      .notif-body { margin: 2px 0; color: #334155; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
      .notif-meta a { color: #0F4C81; text-decoration: none; font-weight: 600; }
      .notif-meta a:hover { text-decoration: underline; }
      .cat-pill { padding: 3px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
      .pill-success { background: #DCFCE7; color: #15803D; }
      .pill-warning { background: #FEF3C7; color: #B45309; }
      .pill-info { background: #DBEAFE; color: #1D4ED8; }
      .pill-danger { background: #FEE2E2; color: #B91C1C; }
      .pill-neutral { background: #E2E8F0; color: #334155; }
    `,
  ],
})
export class ClientNotificationsComponent {
  private readonly auth = inject(AuthContextService);
  private readonly repo = inject(NotificationRepository);
  private readonly logger = inject(LoggerService);
  private readonly router = inject(Router);

  readonly ctx = computed(() => this.auth.context());
  private readonly reloadTick = signal(0);
  protected readonly markingId = signal<string | null>(null);
  protected readonly markingAll = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly isUnreadFn = isUnread;

  private readonly fetchKey = computed(() => ({
    uid: this.ctx().uid,
    loading: this.ctx().loading,
    tick: this.reloadTick(),
  }));

  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged((a, b) => a.uid === b.uid && a.loading === b.loading && a.tick === b.tick),
      switchMap(({ uid, loading }) => {
        if (loading) return of(INITIAL);
        if (!uid) return of<PageState>({ loading: false, error: null, notifications: [], unreadCount: 0 });
        return from(this.loadAll(uid)).pipe(
          map((p) => ({ loading: false, error: null, ...p } as PageState)),
          startWith<PageState>(INITIAL),
          catchError((err) =>
            of<PageState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load notifications.'),
              notifications: [],
              unreadCount: 0,
            }),
          ),
        );
      }),
    ),
    { initialValue: INITIAL },
  );

  private async loadAll(uid: string): Promise<{ notifications: Notification[]; unreadCount: number }> {
    const [list, unreadCount] = await Promise.all([
      this.repo.listForUserId(uid, false, 100),
      this.repo.countUnreadForUser(uid),
    ]);
    return { notifications: list, unreadCount };
  }

  async markRead(n: Notification): Promise<void> {
    if (!isUnread(n) || this.markingId()) return;
    const c = this.ctx();
    if (!c.uid) return;
    this.markingId.set(n.id);
    this.actionError.set(null);
    try {
      await this.repo.markRead(n.id, { uid: c.uid, role: c.role ?? null });
      this.reloadTick.update((x) => x + 1);
    } catch (err) {
      this.logger.warn('markRead failed', { id: n.id, err });
      this.actionError.set('Impossible de marquer cette notification comme lue.');
    } finally {
      this.markingId.set(null);
    }
  }

  async markAllRead(): Promise<void> {
    const c = this.ctx();
    if (!c.uid || this.markingAll()) return;
    this.markingAll.set(true);
    this.actionError.set(null);
    try {
      await this.repo.markAllReadForUser(c.uid, { uid: c.uid, role: c.role ?? null });
      this.reloadTick.update((x) => x + 1);
    } catch (err) {
      this.logger.warn('markAllRead failed', { err });
      this.actionError.set('Certaines notifications n\u2019ont pas pu \u00eatre mises \u00e0 jour.');
    } finally {
      this.markingAll.set(false);
    }
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  categoryFor(n: Notification): string {
    return viewForNotificationKind(n.kind).category;
  }

  classFor(n: Notification): 'success' | 'warning' | 'info' | 'danger' | 'neutral' {
    return viewForNotificationKind(n.kind).cssClass;
  }

  /** Filtre les liens : seules les routes internes connues sont autorisées. */
  safeLink(link: string | null): string | null {
    if (!link) return null;
    if (typeof link !== 'string') return null;
    if (!SAFE_LINK_PREFIX.test(link)) return null;
    return link;
  }

  toDate(v: Notification['createdAt']): Date | null {
    if (!v) return null;
    const ts = v as Partial<Timestamp> & { toDate?: () => Date };
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof v === 'number') return new Date(v);
    return null;
  }
}
