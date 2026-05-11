import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImpersonationContextService } from '../services/impersonation-context.service';

/**
 * Banner sticky affiché dès qu'un super-admin a activé un mode VIEW-AS.
 * Mode UI uniquement : aucune écriture sous l'identité impersonnée.
 */
@Component({
  standalone: true,
  selector: 'app-impersonation-banner',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (s().active) {
      <div class="imp" role="status" aria-live="polite">
        <span class="imp__dot" aria-hidden="true"></span>
        <div class="imp__txt">
          <strong>Mode VIEW-AS · lecture seule</strong>
          <span class="imp__sub">
            Tenant <code>{{ s().tenantId }}</code>
            @if (s().uid) { · User <code>{{ s().uid }}</code>{{ s().email ? ' · ' + s().email : '' }} }
            @if (s().reason) { · Motif : {{ s().reason }} }
            · Démarré il y a {{ minutes() }} min
          </span>
        </div>
        <button type="button" class="imp__exit" (click)="exit()">Sortir</button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .imp {
      position: sticky; top: 0; z-index: 1000;
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      background: linear-gradient(90deg, #B91C1C, #DC2626);
      color: #fff; font-size: .85rem;
      box-shadow: 0 2px 8px rgba(0,0,0,.15);
    }
    .imp__dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: #FCD34D; box-shadow: 0 0 0 3px rgba(252,211,77,.35);
      animation: pulse 1.6s infinite;
      flex-shrink: 0;
    }
    .imp__txt { flex: 1; line-height: 1.35; min-width: 0; }
    .imp__txt strong { display: block; font-weight: 700; }
    .imp__sub { display: block; opacity: .9; font-size: .78rem; word-break: break-word; }
    .imp__sub code {
      background: rgba(255,255,255,.18); padding: 1px 6px; border-radius: 4px;
      font-size: .76rem;
    }
    .imp__exit {
      background: #fff; color: #B91C1C; border: none;
      padding: 6px 14px; border-radius: 8px; font-weight: 700;
      cursor: pointer; transition: background .15s;
      flex-shrink: 0;
    }
    .imp__exit:hover { background: #FEE2E2; }
    @keyframes pulse {
      0%,100% { transform: scale(1); }
      50%     { transform: scale(1.18); }
    }
  `],
})
export class ImpersonationBannerComponent {
  private readonly svc = inject(ImpersonationContextService);
  readonly s = computed(() => this.svc.state());
  readonly minutes = computed(() => {
    const startedAt = this.svc.state().startedAt;
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
  });

  exit(): void {
    void this.svc.exit();
  }
}
