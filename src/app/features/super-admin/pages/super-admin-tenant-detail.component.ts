import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LoggerService } from '../../../core/logging/logger.service';
import { SaOrganizationRepository } from '../data/sa-organization.repository';
import { SaTroubleshootService, type ToolResult } from '../data/sa-troubleshoot.service';
import { ImpersonationContextService } from '../services/impersonation-context.service';
import type {
  Organization,
  OrganizationPlan,
  OrganizationStatus,
  OrgMemberRow,
  OrgStatsSnapshot,
} from '../../admin/data/admin.models';

type TabKey = 'overview' | 'members' | 'analytics' | 'audit' | 'troubleshoot' | 'settings';

interface EditForm {
  name: string;
  code: string;
  plan: OrganizationPlan;
  seats: number | null;
  domain: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
}

interface InviteForm {
  email: string;
  displayName: string;
  role: string;
  uid: string;
}

const ROLE_OPTIONS = ['client', 'org_staff', 'org_admin', 'auditor', 'org_owner'];

type ToolKey = 'readiness' | 'notif' | 'payments' | 'drafts' | 'export' | 'anonymize';

@Component({
  standalone: true,
  selector: 'app-super-admin-tenant-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sa">
      <a routerLink="/super-admin/tenants" class="back">← Retour aux organisations</a>

      @if (loading()) {
        <p class="muted">Chargement…</p>
      } @else if (!org()) {
        <div class="empty">
          <strong>Organisation introuvable.</strong>
          <p>L'ID fourni n'existe pas ou a été archivé.</p>
        </div>
      } @else {
        <header class="hero">
          <div class="hero__main">
            <div class="logo">{{ initial(org()!.name) }}</div>
            <div>
              <p class="eyebrow">Organisation</p>
              <h1>{{ org()!.name }}</h1>
              <div class="hero__chips">
                <span class="pill" [class]="'pill--' + (org()!.status || 'active')">{{ statusLabel(org()!.status) }}</span>
                <span class="pill pill--plan">{{ planLabel(org()!.plan) }}</span>
                <code>{{ org()!.id }}</code>
                @if (org()!.code) { <span class="meta-mini">{{ org()!.code }}</span> }
                @if (org()!.domain) { <span class="meta-mini">@{{ org()!.domain }}</span> }
              </div>
            </div>
          </div>
          <div class="hero__cta">
            <button type="button" class="btn btn--ghost" (click)="enterAs('org_admin')">
              👁 Entrer comme org_admin
            </button>
            <button type="button" class="btn btn--ghost" (click)="enterAs('client')">
              👤 Entrer comme client (read-only)
            </button>
          </div>
        </header>

        <nav class="tabs" role="tablist">
          @for (t of tabs; track t.key) {
            <button type="button" role="tab" class="tab" [class.active]="tab() === t.key" (click)="tab.set(t.key)">
              {{ t.label }}
            </button>
          }
        </nav>

        <!-- ============== OVERVIEW ============== -->
        @if (tab() === 'overview') {
          <div class="grid-2">
            <article class="card">
              <header class="card__hd">
                <h3>Statistiques temps réel</h3>
                <button type="button" class="btn btn--mini" (click)="refreshStats()" [disabled]="refreshing()">
                  {{ refreshing() ? '…' : 'Recalculer' }}
                </button>
              </header>
              <div class="stat-grid">
                <div class="stat"><span>Utilisateurs</span><strong>{{ stats()?.users ?? '—' }}</strong></div>
                <div class="stat"><span>Membres org</span><strong>{{ stats()?.members ?? '—' }}</strong></div>
                <div class="stat"><span>Dossiers</span><strong>{{ stats()?.dossiers ?? '—' }}</strong></div>
                <div class="stat"><span>Documents</span><strong>{{ stats()?.documents ?? '—' }}</strong></div>
                <div class="stat"><span>Paiements</span><strong>{{ stats()?.payments ?? '—' }}</strong></div>
              </div>
              @if (stats()?.computedAt) {
                <p class="muted-mini">Calculé : {{ stats()!.computedAt | date:'short' }}</p>
              }
            </article>
            <article class="card">
              <h3>Identité</h3>
              <dl class="dl">
                <div><dt>Nom</dt><dd>{{ org()!.name }}</dd></div>
                <div><dt>Code</dt><dd>{{ org()!.code || '—' }}</dd></div>
                <div><dt>Plan</dt><dd>{{ planLabel(org()!.plan) }}</dd></div>
                <div><dt>Sièges</dt><dd>{{ org()!.seats ?? 'illimité' }}</dd></div>
                <div><dt>Domaine</dt><dd>{{ org()!.domain || '—' }}</dd></div>
                <div><dt>Contact</dt><dd>{{ org()!.contactEmail || '—' }}</dd></div>
                <div><dt>Téléphone</dt><dd>{{ org()!.contactPhone || '—' }}</dd></div>
                <div><dt>Pays</dt><dd>{{ org()!.countryCode || '—' }}</dd></div>
              </dl>
              @if (org()!.description) {
                <p class="desc">{{ org()!.description }}</p>
              }
            </article>
          </div>
        }

        <!-- ============== MEMBERS ============== -->
        @if (tab() === 'members') {
          <article class="card">
            <header class="card__hd">
              <h3>Membres ({{ members().length }})</h3>
              <button type="button" class="btn btn--mini" (click)="toggleInvite()">{{ inviteOpen() ? '× Fermer' : '+ Inviter' }}</button>
            </header>

            @if (inviteOpen()) {
              <form class="invite" (ngSubmit)="submitInvite()" #fInv="ngForm">
                <div class="row-2">
                  <label>Email *<input type="email" required [(ngModel)]="invite.email" name="iEmail" placeholder="user@org.com" /></label>
                  <label>Nom affiché<input type="text" [(ngModel)]="invite.displayName" name="iName" /></label>
                </div>
                <div class="row-2">
                  <label>Rôle
                    <select [(ngModel)]="invite.role" name="iRole">
                      @for (r of roleOptions; track r) { <option [value]="r">{{ r }}</option> }
                    </select>
                  </label>
                  <label>UID Firebase (optionnel)<input type="text" [(ngModel)]="invite.uid" name="iUid" placeholder="si déjà connu" /></label>
                </div>
                @if (inviteMsg()) { <p class="ok">{{ inviteMsg() }}</p> }
                @if (inviteErr()) { <p class="error">{{ inviteErr() }}</p> }
                <footer class="actions">
                  <button type="submit" class="btn btn--primary" [disabled]="!fInv.valid || inviteBusy()">
                    {{ inviteBusy() ? '…' : 'Inviter' }}
                  </button>
                </footer>
              </form>
            }

            @if (membersLoading()) {
              <p class="muted">Chargement…</p>
            } @else if (members().length === 0) {
              <p class="muted">Aucun membre rattaché à ce tenant.</p>
            } @else {
              <table class="tbl">
                <thead>
                  <tr><th>Email</th><th>Nom</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  @for (m of members(); track m.id) {
                    <tr>
                      <td>{{ m.email || '—' }}</td>
                      <td>{{ m.displayName || '—' }}</td>
                      <td>
                        <select class="role-select"
                          [value]="m.role || 'client'"
                          (change)="changeRole(m, $any($event.target).value)">
                          @for (r of roleOptions; track r) { <option [value]="r">{{ r }}</option> }
                        </select>
                      </td>
                      <td>
                        <span class="dot" [class.dot--ok]="m.isActive !== false" [class.dot--ko]="m.isActive === false"></span>
                        {{ m.isActive === false ? 'Inactif' : 'Actif' }}
                      </td>
                      <td class="row-actions">
                        <button type="button" class="btn btn--mini" (click)="enterAsUser(m)">👁</button>
                        <button type="button" class="btn btn--mini" (click)="toggleActive(m)">
                          {{ m.isActive === false ? '✓ Activer' : '⏸ Désactiver' }}
                        </button>
                        <button type="button" class="btn btn--mini btn--danger" (click)="removeMember(m)">🗑</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </article>
        }

        <!-- ============== ANALYTICS ============== -->
        @if (tab() === 'analytics') {
          <article class="card">
            <header class="card__hd">
              <h3>Analytics</h3>
              <button type="button" class="btn btn--mini" (click)="reloadTrend()" [disabled]="trendLoading()">
                {{ trendLoading() ? '…' : 'Rafraîchir' }}
              </button>
            </header>
            <div class="stat-grid">
              <div class="stat stat--lg"><span>Utilisateurs</span><strong>{{ stats()?.users ?? '—' }}</strong><small>cumul</small></div>
              <div class="stat stat--lg"><span>Dossiers</span><strong>{{ stats()?.dossiers ?? '—' }}</strong><small>cumul</small></div>
              <div class="stat stat--lg"><span>Paiements</span><strong>{{ stats()?.payments ?? '—' }}</strong><small>cumul</small></div>
            </div>
            <h4 class="trend-title">Dossiers créés · 30 derniers jours</h4>
            @if (trendLoading()) {
              <p class="muted">Chargement…</p>
            } @else if (trend().length === 0) {
              <p class="muted-mini">Aucune donnée disponible.</p>
            } @else {
              <svg class="sparkline" viewBox="0 0 600 120" preserveAspectRatio="none">
                <polyline [attr.points]="sparkPoints()" fill="none" stroke="#F5B841" stroke-width="2" />
                <polyline [attr.points]="sparkArea()" fill="rgba(245,184,65,.18)" stroke="none" />
              </svg>
              <div class="trend-axis">
                <span>{{ trend()[0]?.day }}</span>
                <span>Total : {{ trendTotal() }}</span>
                <span>{{ trend()[trend().length - 1]?.day }}</span>
              </div>
            }

            <h4 class="trend-title">Rétention par cohorte (8 semaines)</h4>
            @if (cohortLoading()) {
              <p class="muted">Chargement…</p>
            } @else if (cohort().cohorts.length === 0) {
              <p class="muted-mini">Pas assez de données pour calculer la rétention.</p>
            } @else {
              <div class="heatmap">
                <div class="heatmap__head">
                  <span class="heatmap__corner">Cohorte ↓ / Semaine →</span>
                  @for (off of cohortHeader(); track off) {
                    <span class="heatmap__col">+{{ off }}</span>
                  }
                </div>
                @for (row of cohort().cohorts; track row.weekIso) {
                  <div class="heatmap__row">
                    <span class="heatmap__label">{{ row.weekIso }} <small>({{ row.size }})</small></span>
                    @for (v of row.retention; track $index) {
                      <span class="heatmap__cell" [style.background]="heatColor(v)" [title]="v + '% actifs'">{{ v }}</span>
                    }
                  </div>
                }
              </div>
            }
          </article>
        }

        <!-- ============== AUDIT ============== -->
        @if (tab() === 'audit') {
          <article class="card">
            <header class="card__hd">
              <h3>Audit ({{ audit().length }} dernières)</h3>
              <button type="button" class="btn btn--mini" (click)="reloadAudit()" [disabled]="auditLoading()">
                {{ auditLoading() ? '…' : 'Rafraîchir' }}
              </button>
            </header>
            @if (auditLoading()) {
              <p class="muted">Chargement…</p>
            } @else if (audit().length === 0) {
              <p class="muted">Aucun événement audit pour ce tenant.</p>
            } @else {
              <table class="tbl">
                <thead>
                  <tr><th>Date</th><th>Action</th><th>Cible</th><th>Acteur</th><th>Meta</th></tr>
                </thead>
                <tbody>
                  @for (a of audit(); track a.id) {
                    <tr>
                      <td>{{ formatTs(a['createdAt']) }}</td>
                      <td><code>{{ a['action'] }}</code></td>
                      <td>{{ a['targetType'] }} / <small>{{ a['targetId'] }}</small></td>
                      <td>{{ a['actorEmail'] || a['actorId'] || '—' }}</td>
                      <td><pre class="meta-pre">{{ a['meta'] | json }}</pre></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </article>
        }

        <!-- ============== TROUBLESHOOT ============== -->
        @if (tab() === 'troubleshoot') {
          <article class="card">
            <h3>Dépannage</h3>
            <p class="muted-mini">Outils de support / réparation. Toutes les actions sont auditées (immutables).</p>
            <div class="tools tools--live">
              @for (t of toolDefs; track t.key) {
                <button type="button" class="tool tool--live"
                  [class.tool--busy]="toolBusy() === t.key"
                  [disabled]="toolBusy() !== null"
                  (click)="runTool(t.key)">
                  <strong>{{ t.label }}</strong>
                  <small>{{ t.desc }}</small>
                  @if (toolBusy() === t.key) { <em>Exécution…</em> }
                </button>
              }
            </div>
            @if (lastResult(); as r) {
              <div class="tool-result" [class.tool-result--ko]="!r.result.ok">
                <header>
                  <strong>{{ toolLabel(r.key) }}</strong>
                  <span class="badge" [class.badge--ok]="r.result.ok" [class.badge--ko]="!r.result.ok">
                    {{ r.result.ok ? '✓ OK' : '✗ ERREUR' }}
                  </span>
                </header>
                <p>{{ r.result.message }}</p>
                <div class="result-grid">
                  <div><span>Scannés</span><strong>{{ r.result.scanned }}</strong></div>
                  <div><span>Affectés</span><strong>{{ r.result.affected }}</strong></div>
                  <div><span>Ignorés</span><strong>{{ r.result.skipped }}</strong></div>
                  <div><span>Erreurs</span><strong>{{ r.result.errors }}</strong></div>
                  <div><span>Durée</span><strong>{{ r.result.durationMs }} ms</strong></div>
                </div>
              </div>
            }
          </article>
        }

        <!-- ============== SETTINGS ============== -->
        @if (tab() === 'settings') {
          <div class="grid-2">
            <article class="card">
              <h3>Édition</h3>
              <form (ngSubmit)="saveEdit()" #ef="ngForm">
                <label>Nom *<input type="text" required maxlength="120" [(ngModel)]="edit.name" name="name" /></label>
                <div class="row-2">
                  <label>Code<input type="text" maxlength="32" [(ngModel)]="edit.code" name="code" /></label>
                  <label>Plan<select [(ngModel)]="edit.plan" name="plan"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
                </div>
                <div class="row-2">
                  <label>Sièges<input type="number" min="1" [(ngModel)]="edit.seats" name="seats" /></label>
                  <label>Domaine<input type="text" maxlength="120" [(ngModel)]="edit.domain" name="domain" /></label>
                </div>
                <div class="row-2">
                  <label>Email contact<input type="email" maxlength="120" [(ngModel)]="edit.contactEmail" name="contactEmail" /></label>
                  <label>Téléphone<input type="text" maxlength="40" [(ngModel)]="edit.contactPhone" name="contactPhone" /></label>
                </div>
                <label>Description<textarea rows="3" maxlength="400" [(ngModel)]="edit.description" name="description"></textarea></label>
                @if (saveMsg()) { <p class="ok">{{ saveMsg() }}</p> }
                @if (saveErr()) { <p class="error">{{ saveErr() }}</p> }
                <footer class="actions">
                  <button type="submit" class="btn btn--primary" [disabled]="!ef.valid || saving()">
                    {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
                  </button>
                </footer>
              </form>
            </article>
            <article class="card card--danger">
              <h3>Cycle de vie</h3>
              <p class="muted-mini">Modifications immédiates et auditées.</p>
              <div class="lifecycle">
                @if ((org()!.status || 'active') !== 'active') {
                  <button type="button" class="btn btn--ok" (click)="changeStatus('active')" [disabled]="statusBusy()">
                    ✓ Réactiver
                  </button>
                }
                @if ((org()!.status || 'active') === 'active') {
                  <div>
                    <input type="text" placeholder="Motif de suspension (optionnel)" [(ngModel)]="suspendReason" name="suspendReason" />
                    <button type="button" class="btn btn--warn" (click)="changeStatus('suspended', suspendReason)" [disabled]="statusBusy()">
                      ⏸ Suspendre
                    </button>
                  </div>
                }
                @if (org()!.status !== 'archived') {
                  <button type="button" class="btn btn--danger" (click)="confirmArchive()" [disabled]="statusBusy()">
                    🗑 Archiver
                  </button>
                }
              </div>
              @if (statusMsg()) { <p class="ok">{{ statusMsg() }}</p> }
              @if (org()!.status === 'suspended' && org()!.suspendedReason) {
                <p class="muted-mini"><strong>Motif :</strong> {{ org()!.suspendedReason }}</p>
              }
            </article>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; padding: 32px clamp(16px, 4vw, 48px); background: #F6F9FC; min-height: 100%; }
    .sa { max-width: 1280px; margin: 0 auto; }
    .back { color:#0B1F3A; text-decoration:none; font-size:.85rem; opacity:.75; }
    .back:hover { opacity:1; }

    .hero { background:linear-gradient(135deg,#0B1F3A,#123C69); color:#fff; border-radius:24px; padding:24px 28px; margin:16px 0 20px; box-shadow:0 16px 48px rgba(11,31,58,.15); display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap; }
    .hero__main { display:flex; align-items:center; gap:18px; }
    .logo { width:64px; height:64px; border-radius:18px; background:linear-gradient(135deg,#F5B841,#E69500); color:#0B1F3A; font-weight:800; display:grid; place-items:center; font-size:1.6rem; }
    .eyebrow { color:#F5B841; font-weight:700; letter-spacing:.08em; text-transform:uppercase; font-size:.7rem; margin:0 0 4px; }
    h1 { margin:0 0 8px; font-size:clamp(1.4rem,3vw,1.85rem); }
    .hero__chips { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:.78rem; }
    .hero__chips code { background:rgba(255,255,255,.15); padding:3px 8px; border-radius:6px; font-size:.72rem; }
    .meta-mini { background:rgba(255,255,255,.1); padding:3px 10px; border-radius:999px; font-size:.72rem; opacity:.85; }
    .pill { padding:4px 10px; border-radius:999px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; font-size:.68rem; }
    .pill--active { background:#DCFCE7; color:#166534; }
    .pill--suspended { background:#FEF3C7; color:#92400E; }
    .pill--archived { background:#F1F5F9; color:#475569; }
    .pill--plan { background:#FEF3C7; color:#92400E; }
    .hero__cta { display:flex; gap:10px; flex-wrap:wrap; }

    .tabs { display:flex; gap:6px; background:#fff; border-radius:14px; padding:6px; margin-bottom:16px; overflow-x:auto; box-shadow:0 4px 16px rgba(11,31,58,.05); }
    .tab { background:transparent; border:none; padding:10px 16px; border-radius:10px; cursor:pointer; font-size:.85rem; color:#475569; font-weight:600; white-space:nowrap; }
    .tab.active { background:#0B1F3A; color:#fff; }
    .tab:hover:not(.active) { background:#F1F5F9; }

    .grid-2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:16px; }
    .card { background:#fff; border-radius:18px; padding:22px; box-shadow:0 8px 24px rgba(11,31,58,.06); border:1px solid rgba(11,31,58,.05); }
    .card h3 { margin:0 0 14px; color:#0B1F3A; font-size:1.05rem; }
    .card__hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .card__hd h3 { margin:0; }
    .card--danger { border-color:#FECACA; background:#FFFBFB; }

    .stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; }
    .stat { background:#F8FAFC; padding:12px 14px; border-radius:12px; border:1px solid #E2E8F0; }
    .stat span { display:block; font-size:.7rem; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
    .stat strong { font-size:1.4rem; color:#0B1F3A; display:block; }
    .stat strong small { font-size:.55rem; color:#94A3B8; margin-left:4px; }
    .stat small { color:#64748b; font-size:.7rem; }
    .stat--lg strong { font-size:1.8rem; }

    .dl { display:grid; gap:8px; margin:0; }
    .dl div { display:flex; justify-content:space-between; gap:12px; font-size:.85rem; padding-bottom:6px; border-bottom:1px dashed #E2E8F0; }
    .dl dt { color:#64748b; }
    .dl dd { margin:0; color:#0B1F3A; font-weight:600; text-align:right; }
    .desc { margin:14px 0 0; padding:12px; background:#F8FAFC; border-radius:10px; font-size:.85rem; color:#475569; }

    .tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
    .tbl th, .tbl td { padding:10px 8px; text-align:left; border-bottom:1px solid #E2E8F0; vertical-align:top; }
    .tbl th { font-weight:700; color:#475569; background:#F8FAFC; }
    .tbl td code { font-size:.75rem; background:#F1F5F9; padding:2px 6px; border-radius:4px; }
    .role { display:inline-block; background:#0B1F3A; color:#F5B841; padding:2px 8px; border-radius:999px; font-size:.68rem; font-weight:700; margin-right:4px; }
    .role--alt { background:#E2E8F0; color:#475569; }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
    .dot--ok { background:#22C55E; }
    .dot--ko { background:#EF4444; }
    .meta-pre { font-size:.7rem; max-width:280px; max-height:80px; overflow:auto; background:#F8FAFC; padding:6px; border-radius:6px; margin:0; }

    .tools { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-top:14px; }
    .tool { display:flex; flex-direction:column; align-items:flex-start; text-align:left; padding:14px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; cursor:not-allowed; opacity:.65; }
    .tool strong { color:#0B1F3A; font-size:.88rem; margin-bottom:4px; }
    .tool small { color:#64748b; font-size:.74rem; }
    .tool em { color:#F5B841; font-style:normal; font-weight:700; }

    label { display:block; margin-bottom:12px; font-size:.82rem; color:#475569; }
    input, select, textarea { width:100%; margin-top:4px; padding:9px 12px; border-radius:8px; border:1px solid #CBD5E1; font-size:.9rem; font-family:inherit; }
    .row-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .actions { display:flex; justify-content:flex-end; margin-top:14px; }

    .lifecycle { display:flex; flex-direction:column; gap:12px; margin-top:8px; }
    .lifecycle div { display:flex; gap:8px; }
    .lifecycle div input { flex:1; }

    .btn { padding:10px 16px; border-radius:10px; border:1px solid transparent; background:#fff; color:#0B1F3A; font-weight:600; cursor:pointer; font-size:.85rem; }
    .btn--primary { background:#F5B841; color:#0B1F3A; border-color:#F5B841; }
    .btn--ghost { background:rgba(255,255,255,.12); color:#fff; border-color:rgba(255,255,255,.3); }
    .btn--ghost:hover { background:rgba(255,255,255,.22); }
    .btn--mini { padding:6px 12px; font-size:.78rem; }
    .btn--ok { background:#16A34A; color:#fff; border-color:#16A34A; }
    .btn--warn { background:#D97706; color:#fff; border-color:#D97706; }
    .btn--danger { background:#B91C1C; color:#fff; border-color:#B91C1C; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }

    .ok { color:#166534; font-size:.85rem; margin:6px 0; }
    .error { color:#B91C1C; font-size:.85rem; margin:6px 0; }
    .muted { color:#64748b; padding:24px; text-align:center; }
    .muted-mini { color:#94A3B8; font-size:.78rem; margin:8px 0 0; }
    .empty { background:#fff; padding:32px; border-radius:16px; text-align:center; color:#475569; }

    /* Lot SA.2 — invite + members actions */
    .invite { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:14px; margin-bottom:14px; }
    .row-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .role-select { padding:5px 8px; border-radius:6px; border:1px solid #CBD5E1; font-size:.78rem; }

    /* Lot SA.2 — troubleshoot live */
    .tools--live .tool--live { cursor:pointer; opacity:1; transition:transform .12s, box-shadow .12s; }
    .tools--live .tool--live:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 6px 18px rgba(11,31,58,.10); border-color:#F5B841; }
    .tools--live .tool--live:disabled { opacity:.55; cursor:wait; }
    .tool--busy { background:#FFFBEA; border-color:#F5B841; }
    .tool--live em { color:#0B1F3A; font-style:italic; font-weight:600; margin-top:6px; font-size:.7rem; }
    .tool-result { margin-top:18px; padding:14px 16px; background:#F0FDF4; border:1px solid #86EFAC; border-radius:12px; }
    .tool-result--ko { background:#FEF2F2; border-color:#FCA5A5; }
    .tool-result header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .tool-result strong { color:#0B1F3A; }
    .tool-result p { margin:0 0 10px; color:#334155; font-size:.85rem; }
    .badge { padding:3px 10px; border-radius:999px; font-size:.7rem; font-weight:700; }
    .badge--ok { background:#16A34A; color:#fff; }
    .badge--ko { background:#B91C1C; color:#fff; }
    .result-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(90px,1fr)); gap:8px; }
    .result-grid div { background:rgba(255,255,255,.7); padding:8px 10px; border-radius:8px; }
    .result-grid span { display:block; font-size:.65rem; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
    .result-grid strong { color:#0B1F3A; font-size:1rem; }

    /* Lot SA.2 — sparkline */
    .trend-title { margin:18px 0 6px; color:#475569; font-size:.85rem; font-weight:600; }
    .sparkline { width:100%; height:120px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; }
    .trend-axis { display:flex; justify-content:space-between; font-size:.7rem; color:#64748b; margin-top:4px; }

    /* Lot SA.3 — heatmap rétention */
    .heatmap { display:flex; flex-direction:column; gap:2px; margin-top:8px; }
    .heatmap__head, .heatmap__row { display:grid; grid-template-columns:160px repeat(8, 1fr); gap:2px; align-items:center; }
    .heatmap__head { font-size:.65rem; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:.04em; padding-bottom:4px; }
    .heatmap__corner { padding-left:4px; }
    .heatmap__col { text-align:center; }
    .heatmap__label { font-size:.72rem; color:#475569; padding:4px 6px; background:#F8FAFC; border-radius:6px 0 0 6px; }
    .heatmap__label small { color:#94a3b8; font-size:.65rem; }
    .heatmap__cell { display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:600; color:#0B1F3A; padding:6px 4px; border-radius:4px; min-height:28px; transition:transform .12s; }
    .heatmap__cell:hover { transform:scale(1.08); z-index:2; box-shadow:0 2px 8px rgba(11,31,58,.2); }
  `],
})
export class SuperAdminTenantDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repo = inject(SaOrganizationRepository);
  private readonly imp = inject(ImpersonationContextService);
  private readonly logger = inject(LoggerService);
  private readonly trouble = inject(SaTroubleshootService);

  readonly roleOptions = ROLE_OPTIONS;
  readonly toolDefs: Array<{ key: ToolKey; label: string; desc: string }> = [
    { key: 'readiness', label: 'Recalculer readiness dossiers', desc: 'Recompute completed + completionRate sur les checklists.' },
    { key: 'notif', label: 'Rejouer notifications en échec', desc: 'Repasse les notifications failed → queued (max 500).' },
    { key: 'payments', label: 'Retry paiements bloqués', desc: 'Reset failed → pending pour reprise webhook (max 200).' },
    { key: 'drafts', label: 'Purger drafts orphelins (>30j)', desc: 'Suppression définitive des audit drafts trop anciens.' },
    { key: 'export', label: 'Export complet JSON', desc: 'Téléchargement snapshot du tenant (toutes collections).' },
    { key: 'anonymize', label: 'Anonymiser (RGPD)', desc: 'Opération gated — requiert Cloud Function (Lot SA.3).' },
  ];

  readonly tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Aperçu' },
    { key: 'members', label: 'Membres' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit', label: 'Audit' },
    { key: 'troubleshoot', label: 'Dépannage' },
    { key: 'settings', label: 'Paramètres' },
  ];

  readonly tab = signal<TabKey>('overview');
  readonly loading = signal(true);
  readonly org = signal<Organization | null>(null);
  readonly stats = signal<OrgStatsSnapshot | null>(null);
  readonly refreshing = signal(false);

  readonly members = signal<OrgMemberRow[]>([]);
  readonly membersLoading = signal(false);

  readonly audit = signal<Array<Record<string, unknown> & { id: string }>>([]);
  readonly auditLoading = signal(false);

  readonly saving = signal(false);
  readonly saveMsg = signal<string | null>(null);
  readonly saveErr = signal<string | null>(null);

  readonly statusBusy = signal(false);
  readonly statusMsg = signal<string | null>(null);
  suspendReason = '';

  // Lot SA.2 — invite
  readonly inviteOpen = signal(false);
  readonly inviteBusy = signal(false);
  readonly inviteMsg = signal<string | null>(null);
  readonly inviteErr = signal<string | null>(null);
  invite: InviteForm = { email: '', displayName: '', role: 'client', uid: '' };

  // Lot SA.2 — troubleshoot
  readonly toolBusy = signal<ToolKey | null>(null);
  readonly lastResult = signal<{ key: ToolKey; result: ToolResult } | null>(null);

  // Lot SA.2 — trend
  readonly trend = signal<Array<{ day: string; count: number }>>([]);
  readonly trendLoading = signal(false);
  readonly trendTotal = computed(() => this.trend().reduce((a, b) => a + b.count, 0));
  readonly sparkPoints = computed(() => this.computeSpark(false));
  readonly sparkArea = computed(() => this.computeSpark(true));

  // Lot SA.3 — cohortes / rétention
  readonly cohort = signal<{ cohorts: Array<{ weekIso: string; size: number; retention: number[] }>; maxOffset: number }>({ cohorts: [], maxOffset: 8 });
  readonly cohortLoading = signal(false);
  readonly cohortHeader = computed(() => Array.from({ length: this.cohort().maxOffset }, (_, i) => i));

  edit: EditForm = this.emptyEdit();

  readonly id = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  constructor() {
    void this.bootstrap();
    // Lazy-load by tab
    this.tab.set('overview');
  }

  private async bootstrap(): Promise<void> {
    const id = this.id();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const o = await this.repo.getById(id);
      this.org.set(o);
      if (o) {
        this.edit = this.formFrom(o);
        if (o.statsCache) this.stats.set(o.statsCache);
        // Pre-charge audit + members + trend en arrière-plan (best-effort)
        void this.reloadAudit();
        void this.reloadMembers();
        void this.reloadTrend();
        void this.reloadCohort();
        // Complète le compteur documents (collection-group)
        void this.completeDocumentsCount(id);
      }
    } catch (err) {
      this.logger.error('TenantDetail bootstrap failed', err);
    } finally {
      this.loading.set(false);
    }
  }

  async refreshStats(): Promise<void> {
    const id = this.id();
    if (!id || this.refreshing()) return;
    this.refreshing.set(true);
    try {
      const s = await this.repo.computeStats(id, { persist: true });
      this.stats.set(s);
      // Refresh org for statsCache reflect
      const o = await this.repo.getById(id);
      if (o) this.org.set(o);
    } catch (err) {
      this.logger.error('refreshStats failed', err);
    } finally {
      this.refreshing.set(false);
    }
  }

  async reloadMembers(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.membersLoading.set(true);
    try {
      this.members.set(await this.repo.listMembers(id, 200));
    } catch (err) {
      this.logger.warn('reloadMembers failed', { err });
    } finally {
      this.membersLoading.set(false);
    }
  }

  async reloadAudit(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.auditLoading.set(true);
    try {
      this.audit.set(await this.repo.listAudit(id, 100));
    } catch (err) {
      this.logger.warn('reloadAudit failed', { err });
    } finally {
      this.auditLoading.set(false);
    }
  }

  async saveEdit(): Promise<void> {
    const id = this.id();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.saveMsg.set(null);
    this.saveErr.set(null);
    try {
      await this.repo.update(id, {
        name: this.edit.name.trim(),
        code: this.edit.code?.trim() || null,
        plan: this.edit.plan,
        seats: this.edit.seats ?? null,
        domain: this.edit.domain?.trim() || null,
        description: this.edit.description?.trim() || null,
        contactEmail: this.edit.contactEmail?.trim() || null,
        contactPhone: this.edit.contactPhone?.trim() || null,
      });
      const o = await this.repo.getById(id);
      this.org.set(o);
      this.saveMsg.set('✓ Enregistré.');
    } catch (err) {
      this.logger.error('saveEdit failed', err);
      this.saveErr.set("Échec d'enregistrement. Vérifiez les droits ou la connexion.");
    } finally {
      this.saving.set(false);
    }
  }

  async changeStatus(status: OrganizationStatus, reason?: string | null): Promise<void> {
    const id = this.id();
    if (!id || this.statusBusy()) return;
    this.statusBusy.set(true);
    this.statusMsg.set(null);
    try {
      await this.repo.setStatus(id, status, reason ?? null);
      const o = await this.repo.getById(id);
      this.org.set(o);
      this.suspendReason = '';
      this.statusMsg.set(`✓ Statut mis à jour : ${this.statusLabel(status)}.`);
    } catch (err) {
      this.logger.error('changeStatus failed', err);
      this.statusMsg.set('✗ Échec du changement de statut.');
    } finally {
      this.statusBusy.set(false);
    }
  }

  confirmArchive(): void {
    if (!confirm("Confirmer l'archivage ? L'organisation sera invisible pour les utilisateurs.")) return;
    void this.changeStatus('archived', null);
  }

  async enterAs(asRole: 'org_admin' | 'client'): Promise<void> {
    const o = this.org();
    if (!o) return;
    await this.imp.enter({
      tenantId: o.id,
      reason: `view-as ${asRole} sur ${o.name}`,
    });
    void this.router.navigate(['/dashboard']);
  }

  async enterAsUser(m: OrgMemberRow): Promise<void> {
    const o = this.org();
    if (!o) return;
    await this.imp.enter({
      tenantId: o.id,
      uid: m.uid,
      email: m.email,
      displayName: m.displayName,
      reason: `view-as user ${m.email || m.uid}`,
    });
    void this.router.navigate(['/dashboard']);
  }

  formatTs(v: unknown): string {
    if (!v) return '—';
    try {
      const ts = v as { toDate?: () => Date };
      const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(v as string | number | Date);
      return d.toLocaleString('fr-FR');
    } catch {
      return String(v);
    }
  }

  initial(name: string): string {
    return (name || '?').trim().charAt(0).toUpperCase();
  }
  statusLabel(s?: OrganizationStatus): string {
    return s === 'suspended' ? 'Suspendue' : s === 'archived' ? 'Archivée' : 'Active';
  }
  planLabel(p?: OrganizationPlan): string {
    return p === 'enterprise' ? 'Enterprise' : p === 'pro' ? 'Pro' : 'Starter';
  }

  private formFrom(o: Organization): EditForm {
    return {
      name: o.name ?? '',
      code: o.code ?? '',
      plan: o.plan ?? 'starter',
      seats: o.seats ?? null,
      domain: o.domain ?? '',
      description: o.description ?? '',
      contactEmail: o.contactEmail ?? '',
      contactPhone: o.contactPhone ?? '',
    };
  }
  private emptyEdit(): EditForm {
    return { name: '', code: '', plan: 'starter', seats: null, domain: '', description: '', contactEmail: '', contactPhone: '' };
  }

  // ============================================================
  // Lot SA.2 — Members CRUD
  // ============================================================

  toggleInvite(): void {
    this.inviteOpen.update((v) => !v);
    this.inviteMsg.set(null);
    this.inviteErr.set(null);
  }

  async submitInvite(): Promise<void> {
    const id = this.id();
    if (!id || this.inviteBusy()) return;
    if (!this.invite.email.trim()) return;
    this.inviteBusy.set(true);
    this.inviteMsg.set(null);
    this.inviteErr.set(null);
    try {
      await this.repo.inviteMember({
        tenantId: id,
        email: this.invite.email.trim().toLowerCase(),
        displayName: this.invite.displayName.trim() || null,
        role: this.invite.role,
        uid: this.invite.uid.trim() || null,
      });
      this.inviteMsg.set('✓ Invitation enregistrée.');
      this.invite = { email: '', displayName: '', role: 'client', uid: '' };
      void this.reloadMembers();
    } catch (err) {
      this.logger.error('inviteMember failed', err);
      this.inviteErr.set("Échec de l'invitation. Vérifiez les droits / l'email.");
    } finally {
      this.inviteBusy.set(false);
    }
  }

  async changeRole(m: OrgMemberRow, role: string): Promise<void> {
    const id = this.id();
    if (!id || !role || role === m.role) return;
    try {
      await this.repo.setMemberRole(m.id, role, id);
      void this.reloadMembers();
    } catch (err) {
      this.logger.error('changeRole failed', err);
      alert("Échec du changement de rôle.");
    }
  }

  async toggleActive(m: OrgMemberRow): Promise<void> {
    const id = this.id();
    if (!id) return;
    const next = m.isActive === false;
    try {
      await this.repo.setMemberActive(m.id, next, id);
      void this.reloadMembers();
    } catch (err) {
      this.logger.error('toggleActive failed', err);
      alert("Échec du changement d'état.");
    }
  }

  async removeMember(m: OrgMemberRow): Promise<void> {
    const id = this.id();
    if (!id) return;
    if (!confirm(`Supprimer définitivement le membre ${m.email || m.id} ?`)) return;
    try {
      await this.repo.removeMember(m.id, id);
      void this.reloadMembers();
    } catch (err) {
      this.logger.error('removeMember failed', err);
      alert("Échec de la suppression.");
    }
  }

  // ============================================================
  // Lot SA.2 — Troubleshoot tools
  // ============================================================

  toolLabel(k: ToolKey): string {
    return this.toolDefs.find((t) => t.key === k)?.label ?? k;
  }

  async runTool(key: ToolKey): Promise<void> {
    const id = this.id();
    if (!id || this.toolBusy() !== null) return;

    // Confirmation par outil
    const confirmText: Record<ToolKey, string> = {
      readiness: 'Recalculer readiness sur tous les dossiers du tenant ?',
      notif: 'Replanifier toutes les notifications failed → queued ?',
      payments: 'Repasser les paiements failed à pending ? (les sessions provider expirées devront être relancées manuellement)',
      drafts: 'Supprimer les drafts orphelins de plus de 30 jours ?',
      export: 'Générer et télécharger un export JSON complet ?',
      anonymize: 'Anonymisation IRRÉVERSIBLE des données nominatives. Continuer ?',
    };
    if (!confirm(confirmText[key])) return;

    this.toolBusy.set(key);
    try {
      let result: ToolResult;
      switch (key) {
        case 'readiness': result = await this.trouble.recomputeReadiness(id); break;
        case 'notif':     result = await this.trouble.replayFailedNotifications(id); break;
        case 'payments':  result = await this.trouble.retryFailedPayments(id); break;
        case 'drafts':    result = await this.trouble.purgeOrphanDrafts(id); break;
        case 'export':    result = await this.trouble.exportTenantSnapshot(id); break;
        case 'anonymize': result = await this.trouble.anonymizeTenant(id); break;
      }
      this.lastResult.set({ key, result });
      // Refresh secondaires utiles
      if (key === 'readiness' || key === 'notif' || key === 'payments') {
        void this.refreshStats();
      }
      void this.reloadAudit();
    } catch (err) {
      this.logger.error('runTool failed', err);
      this.lastResult.set({
        key,
        result: { ok: false, scanned: 0, affected: 0, skipped: 0, errors: 1, message: 'Exception non rattrapée — voir console.', durationMs: 0 },
      });
    } finally {
      this.toolBusy.set(null);
    }
  }

  // ============================================================
  // Lot SA.2 — Trend / sparkline
  // ============================================================

  async completeDocumentsCount(id: string): Promise<void> {
    try {
      const count = await this.trouble.countDocumentsForTenant(id);
      this.stats.update((s) => (s ? { ...s, documents: count } : s));
    } catch (err) {
      this.logger.warn('completeDocumentsCount failed', { err });
    }
  }

  async reloadTrend(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.trendLoading.set(true);
    try {
      this.trend.set(await this.trouble.dossiersTrend30d(id));
    } catch (err) {
      this.logger.warn('reloadTrend failed', { err });
    } finally {
      this.trendLoading.set(false);
    }
  }

  async reloadCohort(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.cohortLoading.set(true);
    try {
      this.cohort.set(await this.trouble.cohortRetention(id));
    } catch (err) {
      this.logger.warn('reloadCohort failed', { err });
    } finally {
      this.cohortLoading.set(false);
    }
  }

  heatColor(v: number): string {
    // 0% = #F1F5F9 (gris) → 100% = #F5B841 (accent)
    const t = Math.max(0, Math.min(100, v)) / 100;
    const r = Math.round(241 + (245 - 241) * t);
    const g = Math.round(245 + (184 - 245) * t);
    const b = Math.round(249 + (65 - 249) * t);
    return `rgb(${r},${g},${b})`;
  }

  private computeSpark(asArea: boolean): string {
    const data = this.trend();
    if (data.length === 0) return '';
    const w = 600;
    const h = 120;
    const max = Math.max(1, ...data.map((d) => d.count));
    const step = data.length > 1 ? w / (data.length - 1) : w;
    const pts = data.map((d, i) => {
      const x = Math.round(i * step);
      const y = Math.round(h - (d.count / max) * (h - 8) - 4);
      return `${x},${y}`;
    });
    if (!asArea) return pts.join(' ');
    return `0,${h} ${pts.join(' ')} ${w},${h}`;
  }
}
