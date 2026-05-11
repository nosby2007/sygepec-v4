import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { LoggerService } from '../../../core/logging/logger.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { DossierDocumentRepository } from '../../../core/repositories/dossier-document.repository';
import { ChecklistRepository } from '../../../core/repositories/checklist.repository';
import {
  DossierDocumentUploadService,
  type UploadProgressState,
} from '../../../core/services/dossier-document-upload.service';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type { DossierDocument } from '../../../core/models/canonical/dossier-document.model';
import type { Checklist } from '../../../core/models/canonical/checklist.model';
import {
  labelForDocumentCategory,
  viewForDocumentStatus,
} from '../../../core/services/dossier-document-status-label';
import {
  viewForChecklist,
  type ChecklistView,
} from '../../../core/services/checklist-status-label';

interface DocumentsState {
  loading: boolean;
  error: string | null;
  hasActiveDossier: boolean;
  activeDossier: Dossier | null;
  documents: DossierDocument[];
  checklist: Checklist | null;
}

/**
 * Filtre actif sur la liste des documents :
 *  - all        : tous les documents trackés
 *  - actionable : statuts nécessitant une action client (requested, rejected, expired)
 *  - review     : statuts en attente d'avis conseiller (uploaded, in_review)
 *  - approved   : statuts validés
 */
type DocumentsFilter = 'all' | 'actionable' | 'review' | 'approved';

interface DocumentGroup {
  key: 'actionable' | 'review' | 'approved';
  title: string;
  description: string;
  emptyMessage: string;
  tone: 'alert' | 'info' | 'success';
  documents: DossierDocument[];
}

const ACTIONABLE_STATUSES = new Set<string>(['requested', 'rejected', 'expired']);
const REVIEW_STATUSES = new Set<string>(['uploaded', 'in_review']);
const APPROVED_STATUSES = new Set<string>(['approved']);

const INITIAL_STATE: DocumentsState = {
  loading: true,
  error: null,
  hasActiveDossier: false,
  activeDossier: null,
  documents: [],
  checklist: null,
};

/**
 * Sélectionne le dossier actif d'un client.
 * Priorité : premier dossier non terminé/annulé. Sinon, premier de la liste.
 * Cas vide : null (déclenche l'empty state "aucun dossier").
 */
export function pickActiveDossier(list: Dossier[]): Dossier | null {
  if (!list.length) return null;
  const active = list.find((d) => d.status !== 'completed' && d.status !== 'cancelled');
  return active ?? list[0]!;
}

@Component({
  standalone: true,
  selector: 'app-client-documents',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <nav class="bc" aria-label="Fil d'Ariane">
        <a routerLink="/dashboard">Tableau de bord</a> <span>›</span> <strong>Mes documents</strong>
      </nav>

      <header class="hero">
        <div class="hero__copy">
          <p class="eyebrow">Coffre documentaire sécurisé</p>
          <h1>Mes documents d'immigration</h1>
          <p class="lead">
            Centralisez vos documents et suivez votre checklist. Les pré-vérifications IA sont
            indicatives ; aucune décision officielle n'est prise sans revue humaine par un
            conseiller SYGEPEC.
          </p>
          <div class="hero__cta">
            <a routerLink="/start-audit" class="btn btn--ghost">Mettre à jour mon audit</a>
            <a routerLink="/support" class="btn btn--gold">Contacter mon conseiller</a>
          </div>
        </div>
        <aside class="hero__score" aria-label="Avancement de la checklist">
          <span class="hero__score-label">Avancement checklist</span>
          <div class="ring" [style.--p]="checklistView().completionRate"
               role="img" [attr.aria-label]="'Avancement: ' + checklistView().completionRate + ' pour cent'">
            <strong>{{ checklistView().completionRate }}<em>%</em></strong>
          </div>
          <div class="hero__score-stats">
            <span class="dot dot--ok"></span> {{ checklistView().completed }} validés
            <span class="dot dot--err"></span> {{ checklistView().missing }} manquants
          </div>
        </aside>
      </header>

      @if (state().loading) {
        <section class="empty" aria-busy="true">
          <p>Chargement de vos documents…</p>
        </section>
      } @else if (state().error) {
        <section class="empty" role="alert">
          <div class="empty__ic" aria-hidden="true">⚠️</div>
          <h2>Impossible de charger vos documents</h2>
          <p>{{ state().error }}</p>
          <button type="button" class="btn btn--gold" (click)="retry()">Réessayer</button>
        </section>
      } @else if (!state().hasActiveDossier) {
        <section class="empty">
          <div class="empty__ic" aria-hidden="true">📥</div>
          <h2>Aucun dossier actif pour le moment</h2>
          <p>
            Démarrez votre audit personnel. SYGEPEC créera ensuite votre dossier d'immigration
            et la checklist exacte des documents requis.
          </p>
          <a routerLink="/start-audit" class="btn btn--gold">Démarrer mon audit</a>
        </section>
      } @else {
        <!-- Résumé global -->
        <section class="kpis" aria-label="Résumé global de mes documents">
          <article class="kpi">
            <span class="kpi__ic" aria-hidden="true">📄</span>
            <strong>{{ documents().length }}</strong>
            <span>Documents suivis</span>
          </article>
          <article class="kpi kpi--alert">
            <span class="kpi__ic" aria-hidden="true">⏳</span>
            <strong>{{ groupCounts().actionable }}</strong>
            <span>À traiter par vous</span>
          </article>
          <article class="kpi kpi--gold">
            <span class="kpi__ic" aria-hidden="true">👤</span>
            <strong>{{ groupCounts().review }}</strong>
            <span>En attente conseiller</span>
          </article>
          <article class="kpi kpi--teal">
            <span class="kpi__ic" aria-hidden="true">✅</span>
            <strong>{{ groupCounts().approved }}</strong>
            <span>Validés</span>
          </article>
        </section>

        <!-- Bandeau IA -->
        <div class="ai-banner" role="note">
          <span class="ai-banner__ic" aria-hidden="true">ℹ️</span>
          <p>
            <strong>Pré-vérification IA :</strong> indicative uniquement. La validation
            définitive de chaque pièce est toujours faite par un conseiller SYGEPEC.
          </p>
        </div>

        <!-- Checklist -->
        <section class="block">
          <header class="block__hd">
            <h2>Ma checklist</h2>
            <span class="pill" [ngClass]="checklistPillClass()">{{ checklistPillLabel() }}</span>
          </header>

          @if (checklistView().status === 'empty') {
            <p class="block__empty">
              Votre checklist apparaîtra dès que votre audit sera traité.
            </p>
          } @else {
            <div class="progress" role="progressbar"
                 [attr.aria-valuenow]="checklistView().completionRate"
                 aria-valuemin="0" aria-valuemax="100">
              <div class="progress__bar" [style.width.%]="checklistView().completionRate"></div>
            </div>
            <ul class="check-list">
              @for (item of checklistView().items; track item.category) {
                <li class="check-item" [attr.data-state]="item.cssClass">
                  <span class="check-item__ic" aria-hidden="true">{{ item.done ? '✅' : (item.required ? '⏳' : '◯') }}</span>
                  <div class="check-item__body">
                    <strong>{{ item.label }}</strong>
                    <span class="check-item__meta">
                      <span class="badge" [ngClass]="item.required ? 'badge--required' : 'badge--optional'">
                        {{ item.required ? 'Obligatoire' : 'Optionnel' }}
                      </span>
                      ·
                      <em>{{ statusLabelFr(item.statusLabel) }}</em>
                    </span>
                  </div>
                  @if (!item.done && item.required) {
                    <a routerLink="/support" class="btn btn--link btn--sm">Demander de l'aide →</a>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <!-- Filtres -->
        <nav class="filters" aria-label="Filtrer mes documents">
          <button type="button" class="filter" [class.filter--active]="filter() === 'all'"
                  (click)="setFilter('all')">
            Tous <span class="filter__count">{{ documents().length }}</span>
          </button>
          <button type="button" class="filter filter--alert" [class.filter--active]="filter() === 'actionable'"
                  (click)="setFilter('actionable')">
            À traiter <span class="filter__count">{{ groupCounts().actionable }}</span>
          </button>
          <button type="button" class="filter filter--info" [class.filter--active]="filter() === 'review'"
                  (click)="setFilter('review')">
            En revue <span class="filter__count">{{ groupCounts().review }}</span>
          </button>
          <button type="button" class="filter filter--success" [class.filter--active]="filter() === 'approved'"
                  (click)="setFilter('approved')">
            Validés <span class="filter__count">{{ groupCounts().approved }}</span>
          </button>
        </nav>

        <!-- Documents groupés -->
        @if (!documents().length) {
          <section class="block">
            <p class="block__empty">
              Aucun document n'est encore demandé. Votre conseiller vous les listera dès la
              fin du traitement de votre audit.
            </p>
          </section>
        } @else {
          @for (group of visibleGroups(); track group.key) {
            <section class="block" [attr.data-tone]="group.tone"
                     [attr.aria-labelledby]="'group-' + group.key">
              <header class="block__hd block__hd--group">
                <div>
                  <h2 [id]="'group-' + group.key">
                    {{ group.title }}
                    <span class="block__count">({{ group.documents.length }})</span>
                  </h2>
                  <p class="block__sub">{{ group.description }}</p>
                </div>
              </header>

              @if (!group.documents.length) {
                <p class="block__empty">{{ group.emptyMessage }}</p>
              } @else {
                <div class="grid">
                  @for (doc of group.documents; track doc.id) {
                    <article class="doc"
                             [attr.data-status]="viewForStatus(doc.status).cssClass"
                             [attr.data-required]="docRequired(doc) ? 'true' : 'false'">
                      <header class="doc__hd">
                        <div class="doc__title">
                          <span class="doc__ic" [attr.data-status]="viewForStatus(doc.status).cssClass" aria-hidden="true">📋</span>
                          <div>
                            <h3>{{ labelForCategory(doc.category) }}</h3>
                            <p class="doc__file">{{ doc.fileName || 'Aucun fichier déposé' }}</p>
                            <div class="doc__tags">
                              <span class="badge" [ngClass]="docRequired(doc) ? 'badge--required' : 'badge--optional'">
                                {{ docRequired(doc) ? 'Obligatoire' : 'Optionnel' }}
                              </span>
                              @if (doc.label) {
                                <span class="badge badge--neutral">{{ doc.label }}</span>
                              }
                            </div>
                          </div>
                        </div>
                        <span class="pill" [ngClass]="viewForStatus(doc.status).cssClass">
                          {{ statusLabelFr(viewForStatus(doc.status).label) }}
                        </span>
                      </header>

                      <p class="doc__desc">{{ statusDescriptionFr(doc.status) }}</p>

                      @if (doc.status === 'rejected' && doc.rejectionReason) {
                        <p class="doc__warn">
                          <span aria-hidden="true">⚠️</span>
                          <strong>Motif du conseiller :</strong> {{ doc.rejectionReason }}
                        </p>
                      }

                      @if (doc.status === 'expired') {
                        <p class="doc__warn">
                          <span aria-hidden="true">⏰</span>
                          Cette pièce a expiré. Merci de fournir une version à jour.
                        </p>
                      }

                      @if (canUploadFor(doc.status)) {
                        <div class="doc__upload">
                          <label class="btn btn--gold btn--sm doc__upload-btn">
                            @if (uploadProgress(doc.id).state === 'running' || uploadProgress(doc.id).state === 'paused') {
                              Envoi… {{ uploadProgress(doc.id).percent }} %
                            } @else if (uploadProgress(doc.id).state === 'success') {
                              ✅ Envoyé — remplacer ?
                            } @else {
                              {{ uploadCtaLabel(doc.status) }}
                            }
                            <input
                              type="file"
                              hidden
                              [disabled]="uploadProgress(doc.id).state === 'running'"
                              (change)="onFileInput(doc.id, $event)"
                              [attr.aria-label]="'Téléverser ' + labelForCategory(doc.category)" />
                          </label>
                          @if (uploadProgress(doc.id).state === 'running' || uploadProgress(doc.id).state === 'paused') {
                            <div class="doc__progress" role="progressbar"
                                 [attr.aria-valuenow]="uploadProgress(doc.id).percent"
                                 aria-valuemin="0" aria-valuemax="100"
                                 [attr.aria-label]="'Progression: ' + uploadProgress(doc.id).percent + ' pour cent'">
                              <div class="doc__progress-bar" [style.width.%]="uploadProgress(doc.id).percent"></div>
                            </div>
                          }
                          @if (uploadProgress(doc.id).state === 'error' && uploadProgress(doc.id).errorMessage; as err) {
                            <p class="doc__warn" role="alert">
                              ⚠️ {{ err }}
                              <button type="button" class="btn btn--link btn--sm" (click)="resetUpload(doc.id)">
                                Réessayer
                              </button>
                            </p>
                          }
                          <p class="doc__upload-hint">
                            PDF, image ou Word — 15 Mo max. Validation par votre conseiller SYGEPEC.
                          </p>
                        </div>
                      }

                      <footer class="doc__ft">
                        <span class="doc__date">Mis à jour le {{ formatDate(doc.updatedAt) }}</span>
                        @if (doc.status === 'rejected' || doc.status === 'expired') {
                          <a routerLink="/support" class="btn btn--link btn--sm">Besoin d'aide ?</a>
                        }
                      </footer>
                    </article>
                  }
                </div>
              }
            </section>
          }
        }

        <!-- CTA conseiller -->
        <section class="upload">
          <div>
            <h3>Besoin d'un échange avec votre conseiller ?</h3>
            <p>
              Vous pouvez téléverser directement vos pièces depuis chaque carte ci-dessus.
              Pour toute question (document non listé, refus, justificatif spécifique),
              contactez votre conseiller SYGEPEC : il valide chaque pièce manuellement.
            </p>
          </div>
          <a routerLink="/support" class="btn btn--gold">Contacter mon conseiller</a>
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; background: linear-gradient(180deg, #F6F9FC 0%, #FFFFFF 320px); min-height: 100%; }
    .page { max-width: 1280px; margin: 0 auto; padding: 24px clamp(12px, 4vw, 40px) 64px; }
    .bc { color: #64748b; font-size: .85rem; margin-bottom: 16px; }
    .bc a { color: #1E63D6; text-decoration: none; }
    .bc strong { color: #0B1F3A; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 32px; background: linear-gradient(135deg, #0B1F3A 0%, #123C69 70%, #1E63D6 130%); color: #fff; padding: 36px clamp(20px, 4vw, 40px); border-radius: 28px; box-shadow: 0 24px 48px -16px rgba(11,31,58,.35); position: relative; overflow: hidden; }
    .hero::before { content: ''; position: absolute; inset: -40% -10% auto auto; width: 480px; height: 480px; background: radial-gradient(circle, rgba(245,184,65,.22), transparent 60%); pointer-events: none; }
    .hero__copy { position: relative; min-width: 0; }
    .eyebrow { color: #F5B841; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: .72rem; margin: 0 0 10px; }
    h1 { margin: 0 0 12px; font-size: clamp(1.5rem, 3vw, 2.4rem); line-height: 1.15; }
    .lead { margin: 0 0 20px; opacity: .88; max-width: 580px; line-height: 1.55; }
    .hero__cta { display: flex; gap: 12px; flex-wrap: wrap; }
    .hero__score { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.18); backdrop-filter: blur(10px); border-radius: 22px; padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 14px; position: relative; }
    .hero__score-label { font-size: .8rem; opacity: .8; letter-spacing: .04em; }
    .ring { --p: 0; width: 140px; height: 140px; border-radius: 50%; background: conic-gradient(#F5B841 calc(var(--p) * 1%), rgba(255,255,255,.15) 0); display: grid; place-items: center; position: relative; }
    .ring::before { content: ''; position: absolute; inset: 10px; border-radius: 50%; background: #0B1F3A; }
    .ring strong { position: relative; font-size: 1.9rem; font-weight: 800; color: #fff; }
    .ring em { font-size: .9rem; font-style: normal; opacity: .8; }
    .hero__score-stats { font-size: .78rem; line-height: 1.7; opacity: .9; text-align: center; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 4px 0 8px; vertical-align: middle; }
    .dot--ok { background: #22C55E; } .dot--err { background: #EF4444; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 24px 0; }
    .kpi { background: #fff; border: 1px solid rgba(11,31,58,.06); border-radius: 18px; padding: 18px 20px; box-shadow: 0 4px 12px rgba(11,31,58,.04); display: flex; flex-direction: column; gap: 6px; border-left: 4px solid #1E63D6; }
    .kpi--teal { border-left-color: #14B8A6; } .kpi--gold { border-left-color: #F5B841; } .kpi--alert { border-left-color: #EF4444; }
    .kpi__ic { font-size: 1.4rem; }
    .kpi strong { font-size: 1.7rem; color: #0B1F3A; font-weight: 800; }
    .kpi span:last-child { font-size: .82rem; color: #64748b; }
    .ai-banner { display: flex; gap: 14px; background: linear-gradient(90deg, rgba(245,184,65,.12), rgba(245,184,65,.04)); border: 1px solid rgba(245,184,65,.35); border-radius: 14px; padding: 14px 18px; margin: 0 0 24px; align-items: flex-start; }
    .ai-banner__ic { font-size: 1.2rem; }
    .ai-banner p { margin: 0; color: #475569; font-size: .9rem; line-height: 1.55; }
    .ai-banner strong { color: #0B1F3A; }

    /* Filtres */
    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 16px; padding: 6px; background: #fff; border-radius: 14px; border: 1px solid rgba(11,31,58,.06); box-shadow: 0 4px 12px rgba(11,31,58,.04); overflow-x: auto; }
    .filter { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 10px; border: 0; background: transparent; color: #475569; font-weight: 600; font-size: .85rem; cursor: pointer; white-space: nowrap; transition: background .15s ease, color .15s ease; }
    .filter:hover { background: #F1F5F9; color: #0B1F3A; }
    .filter--active { background: #0B1F3A; color: #fff; }
    .filter--active:hover { background: #0B1F3A; color: #fff; }
    .filter--alert.filter--active { background: #B91C1C; }
    .filter--info.filter--active { background: #1E40AF; }
    .filter--success.filter--active { background: #166534; }
    .filter__count { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: rgba(11,31,58,.08); font-size: .7rem; font-weight: 700; color: inherit; }
    .filter--active .filter__count { background: rgba(255,255,255,.2); color: #fff; }

    /* Sections / blocks */
    .block { background: #fff; border-radius: 20px; padding: 22px clamp(16px, 3vw, 24px); border: 1px solid rgba(11,31,58,.06); box-shadow: 0 8px 24px rgba(11,31,58,.05); margin-bottom: 18px; }
    .block[data-tone="alert"] { border-left: 4px solid #EF4444; }
    .block[data-tone="info"] { border-left: 4px solid #1E63D6; }
    .block[data-tone="success"] { border-left: 4px solid #22C55E; }
    .block__hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; }
    .block__hd--group { align-items: flex-start; }
    .block__hd h2 { margin: 0; font-size: 1.05rem; color: #0B1F3A; }
    .block__count { color: #64748b; font-weight: 500; font-size: .9rem; margin-left: 4px; }
    .block__sub { margin: 4px 0 0; font-size: .82rem; color: #64748b; }
    .block__empty { color: #64748b; margin: 0; font-style: italic; padding: 12px 0; }

    /* Progress + checklist */
    .progress { height: 8px; background: #E2E8F0; border-radius: 999px; overflow: hidden; margin-bottom: 16px; }
    .progress__bar { height: 100%; background: linear-gradient(90deg, #14B8A6, #1E63D6); transition: width .3s ease; }
    .check-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .check-item { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; background: #F8FAFC; border-radius: 12px; border-left: 3px solid #CBD5E1; }
    .check-item[data-state="success"] { border-left-color: #22C55E; }
    .check-item[data-state="danger"] { border-left-color: #EF4444; }
    .check-item__ic { font-size: 1.1rem; }
    .check-item__body strong { display: block; color: #0B1F3A; font-size: .92rem; }
    .check-item__meta { font-size: .78rem; color: #64748b; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .check-item__meta em { font-style: normal; font-weight: 600; }

    /* Documents */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 16px; }
    .doc { background: #fff; border: 1px solid rgba(11,31,58,.06); border-radius: 16px; padding: 18px clamp(14px, 2vw, 20px); display: flex; flex-direction: column; gap: 12px; transition: box-shadow .15s ease, transform .15s ease; }
    .doc:hover { box-shadow: 0 10px 24px rgba(11,31,58,.08); }
    .doc[data-status="danger"] { border-color: rgba(239,68,68,.3); }
    .doc[data-status="success"] { border-color: rgba(34,197,94,.3); }
    .doc__hd { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .doc__title { display: flex; gap: 12px; align-items: flex-start; flex: 1; min-width: 0; }
    .doc__ic { width: 40px; height: 40px; border-radius: 12px; background: #EFF6FF; display: grid; place-items: center; font-size: 1.2rem; flex-shrink: 0; }
    .doc__ic[data-status="success"] { background: #DCFCE7; }
    .doc__ic[data-status="warning"] { background: #FEF3C7; }
    .doc__ic[data-status="danger"] { background: #FEE2E2; }
    .doc__title h3 { margin: 0 0 4px; font-size: 1rem; color: #0B1F3A; font-weight: 700; word-break: break-word; }
    .doc__file { margin: 0 0 8px; color: #64748b; font-size: .85rem; word-break: break-word; }
    .doc__tags { display: inline-flex; gap: 6px; flex-wrap: wrap; }
    .doc__desc { margin: 0; color: #475569; font-size: .85rem; line-height: 1.5; }
    .doc__warn { margin: 0; padding: 10px 14px; background: #FEF3C7; color: #92400E; border-radius: 10px; font-size: .85rem; display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
    .doc__warn strong { color: #78350F; }
    .doc__ft { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 10px; border-top: 1px dashed #E2E8F0; }
    .doc__date { font-size: .78rem; color: #64748b; }

    /* Pills (statuts) */
    .pill { padding: 4px 12px; border-radius: 999px; font-size: .72rem; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; }
    .pill.success { background: #DCFCE7; color: #166534; }
    .pill.warning { background: #FEF3C7; color: #92400E; }
    .pill.danger  { background: #FEE2E2; color: #991B1B; }
    .pill.info    { background: #DBEAFE; color: #1E40AF; }
    .pill.neutral { background: #E2E8F0; color: #475569; }

    /* Badges (required/optional) */
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: .68rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
    .badge--required { background: rgba(239,68,68,.12); color: #B91C1C; }
    .badge--optional { background: rgba(100,116,139,.12); color: #475569; }
    .badge--neutral  { background: #F1F5F9; color: #475569; text-transform: none; letter-spacing: 0; font-weight: 500; }

    /* Boutons */
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: .88rem; text-decoration: none; cursor: pointer; border: 0; }
    .btn--gold { background: #F5B841; color: #0B1F3A; box-shadow: 0 4px 12px rgba(245,184,65,.4); }
    .btn--ghost { background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.3); }
    .btn--link { background: transparent; color: #1E63D6; padding: 8px 4px; }
    .btn--sm { padding: 8px 14px; font-size: .82rem; }

    /* Upload */
    .doc__upload { display: flex; flex-direction: column; gap: 8px; padding: 10px 0 4px; border-top: 1px dashed #E2E8F0; }
    .doc__upload-btn { cursor: pointer; align-self: flex-start; max-width: 100%; }
    .doc__upload-btn input[type="file"] { display: none; }
    .doc__upload-hint { margin: 0; font-size: .72rem; color: #64748b; }
    .doc__progress { height: 6px; width: 100%; background: #E2E8F0; border-radius: 999px; overflow: hidden; }
    .doc__progress-bar { height: 100%; background: linear-gradient(90deg, #14B8A6, #1E63D6); transition: width .2s ease; }

    /* Empty / CTA */
    .empty { background: #fff; border-radius: 20px; padding: 60px 20px; text-align: center; border: 2px dashed #CBD5E1; }
    .empty__ic { font-size: 3rem; margin-bottom: 12px; }
    .empty h2 { margin: 0 0 6px; color: #0B1F3A; }
    .empty p { color: #64748b; margin: 0 0 20px; }
    .upload { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; background: #fff; border-radius: 18px; padding: 22px 24px; border: 1px dashed #CBD5E1; margin-top: 18px; }
    .upload h3 { margin: 0 0 6px; color: #0B1F3A; }
    .upload p { margin: 0; color: #64748b; font-size: .9rem; max-width: 560px; }

    /* Responsive — tablette */
    @media (max-width: 880px) {
      .hero { grid-template-columns: 1fr; }
      .hero__score { max-width: 280px; margin: 0 auto; }
      .doc__hd { flex-direction: column; }
      .pill { align-self: flex-start; }
    }

    /* Responsive — mobile */
    @media (max-width: 560px) {
      .page { padding: 16px 12px 48px; }
      .hero { padding: 24px 18px; border-radius: 22px; }
      .hero__cta { flex-direction: column; align-items: stretch; }
      .hero__cta .btn { justify-content: center; }
      .kpis { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .kpi { padding: 14px; }
      .kpi strong { font-size: 1.4rem; }
      .block { padding: 18px 14px; border-radius: 16px; }
      .grid { grid-template-columns: 1fr; gap: 12px; }
      .check-item { grid-template-columns: auto 1fr; }
      .check-item .btn { grid-column: 1 / -1; justify-self: start; }
      .upload { flex-direction: column; align-items: stretch; padding: 18px; }
      .upload .btn { align-self: stretch; justify-content: center; }
    }
  `],
})
export class ClientDocumentsComponent {
  private auth = inject(AuthContextService);
  private dossiers = inject(DossierRepository);
  private dossierDocs = inject(DossierDocumentRepository);
  private checklists = inject(ChecklistRepository);
  private uploader = inject(DossierDocumentUploadService);
  private logger = inject(LoggerService);

  readonly ctx = computed(() => this.auth.context());
  private readonly reloadTick = signal(0);

  /** Filtre actif : 'all' | 'actionable' | 'review' | 'approved'. */
  private readonly filterSig = signal<DocumentsFilter>('all');
  readonly filter = computed(() => this.filterSig());

  private readonly fetchKey = computed(() => ({
    uid: this.ctx().uid,
    loading: this.ctx().loading,
    tick: this.reloadTick(),
  }));

  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged(
        (a, b) => a.uid === b.uid && a.loading === b.loading && a.tick === b.tick,
      ),
      switchMap(({ uid, loading }) => {
        if (loading) {
          return of<DocumentsState>({ ...INITIAL_STATE });
        }
        if (!uid) {
          return of<DocumentsState>({
            loading: false,
            error: null,
            hasActiveDossier: false,
            activeDossier: null,
            documents: [],
            checklist: null,
          });
        }
        return from(this.loadAll(uid)).pipe(
          startWith<DocumentsState>({ ...INITIAL_STATE }),
          catchError((err) => {
            this.logger.error('client-documents loadAll failed', err, { uid });
            return of<DocumentsState>({
              loading: false,
              error:
                err instanceof Error
                  ? err.message
                  : String(err ?? 'Impossible de charger vos documents.'),
              hasActiveDossier: false,
              activeDossier: null,
              documents: [],
              checklist: null,
            });
          }),
        );
      }),
    ),
    { initialValue: { ...INITIAL_STATE } as DocumentsState },
  );

  readonly activeDossier = computed<Dossier | null>(() => this.state().activeDossier);
  readonly documents = computed<DossierDocument[]>(() => this.state().documents);
  readonly checklistView = computed<ChecklistView>(() =>
    viewForChecklist(this.state().checklist),
  );

  /** Comptes par groupe — affichés dans les filtres et KPI. */
  readonly groupCounts = computed(() => {
    const docs = this.documents();
    return {
      actionable: docs.filter((d) => ACTIONABLE_STATUSES.has(d.status)).length,
      review: docs.filter((d) => REVIEW_STATUSES.has(d.status)).length,
      approved: docs.filter((d) => APPROVED_STATUSES.has(d.status)).length,
    };
  });

  /** Groupes affichables selon le filtre actif. */
  readonly visibleGroups = computed<DocumentGroup[]>(() => {
    const docs = this.documents();
    const f = this.filter();

    const sortRequiredFirst = (arr: DossierDocument[]) =>
      [...arr].sort((a, b) => {
        const ar = this.docRequired(a) ? 0 : 1;
        const br = this.docRequired(b) ? 0 : 1;
        if (ar !== br) return ar - br;
        return labelForDocumentCategory(a.category).localeCompare(
          labelForDocumentCategory(b.category),
          'fr',
        );
      });

    const all: DocumentGroup[] = [
      {
        key: 'actionable',
        title: 'À traiter',
        description:
          'Documents demandés par votre conseiller, refusés ou expirés. Téléversez-les pour faire avancer votre dossier.',
        emptyMessage: 'Aucune action requise pour le moment. Vous êtes à jour 🎉',
        tone: 'alert',
        documents: sortRequiredFirst(docs.filter((d) => ACTIONABLE_STATUSES.has(d.status))),
      },
      {
        key: 'review',
        title: 'En revue par votre conseiller',
        description:
          'Documents transmis. Un conseiller SYGEPEC les valide manuellement — vous serez notifié dès la décision.',
        emptyMessage: 'Aucune pièce en attente de revue.',
        tone: 'info',
        documents: sortRequiredFirst(docs.filter((d) => REVIEW_STATUSES.has(d.status))),
      },
      {
        key: 'approved',
        title: 'Validés',
        description: 'Pièces approuvées par votre conseiller. Aucune action complémentaire.',
        emptyMessage: 'Aucun document validé pour le moment.',
        tone: 'success',
        documents: sortRequiredFirst(docs.filter((d) => APPROVED_STATUSES.has(d.status))),
      },
    ];

    if (f === 'all') return all;
    return all.filter((g) => g.key === f);
  });

  setFilter(filter: DocumentsFilter): void {
    this.filterSig.set(filter);
  }

  /** Compte de documents par status (utilisé en interne pour KPIs/tests). */
  countByStatus(status: string): number {
    return this.documents().filter((d) => d.status === status).length;
  }

  /** Pièces pour lesquelles le client est habilité à uploader/réuploader. */
  canUploadFor(status: string | null | undefined): boolean {
    return status === 'requested' || status === 'rejected' || status === 'expired';
  }

  /** Détermine si une pièce est obligatoire (defaut: true si non spécifié et statut non-optionnel). */
  docRequired(doc: DossierDocument): boolean {
    return doc.required !== false;
  }

  /** Lecture du signal de progression d'upload pour un docId donné. */
  uploadProgress(docId: string): UploadProgressState {
    return this.uploader.progressFor(docId)();
  }

  resetUpload(docId: string): void {
    this.uploader.resetProgress(docId);
  }

  uploadCtaLabel(status: string | null | undefined): string {
    if (status === 'requested') return 'Téléverser le document';
    if (status === 'rejected') return 'Envoyer la version corrigée';
    if (status === 'expired') return 'Envoyer une version à jour';
    return 'Téléverser';
  }

  onFileInput(docId: string, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    void this.onFileSelected(docId, file);
    if (input) {
      // Permet de re-sélectionner le même fichier après une erreur.
      input.value = '';
    }
  }

  async onFileSelected(docId: string, file: File | null): Promise<void> {
    if (!file) return;
    const dossier = this.activeDossier();
    if (!dossier) return;

    const prevalidate = this.uploader.validateFile(file);
    if (prevalidate) {
      this.uploader.progressFor(docId).set({
        docId,
        bytesTransferred: 0,
        totalBytes: file.size || 0,
        percent: 0,
        state: 'error',
        errorMessage: prevalidate,
      });
      return;
    }

    try {
      await this.uploader.upload({
        dossierId: dossier.id,
        docId,
        file,
        requestSource: 'client_upload',
      });
      this.logger.info('Document uploaded by owner', { dossierId: dossier.id, docId });
      this.retry();
    } catch (err) {
      // Le service a déjà mis le signal en état 'error' avec un message FR.
      this.logger.warn('Document upload failed', err, { dossierId: dossier.id, docId });
    }
  }

  viewForStatus(status: string | null | undefined) {
    return viewForDocumentStatus(status);
  }

  labelForCategory(category: string | null | undefined): string {
    return labelForDocumentCategory(category);
  }

  /** Traduit en FR les libellés EN renvoyés par le service de status. */
  statusLabelFr(label: string): string {
    switch (label) {
      case 'Requested': return 'À téléverser';
      case 'Submitted': return 'Soumis';
      case 'In review': return 'En revue';
      case 'Approved': return 'Validé';
      case 'Needs correction': return 'À corriger';
      case 'Expired': return 'Expiré';
      case 'Completed': return 'Validé';
      case 'Missing': return 'Manquant';
      case 'Optional': return 'Optionnel';
      default: return label;
    }
  }

  /** Description FR par status (la source EN est dans dossier-document-status-label.ts). */
  statusDescriptionFr(status: string | null | undefined): string {
    switch (status) {
      case 'requested':
        return 'Votre conseiller a demandé ce document. Téléversez-le dès que possible.';
      case 'uploaded':
        return 'Document transmis. Un conseiller SYGEPEC le valide manuellement.';
      case 'in_review':
        return 'Un conseiller SYGEPEC examine actuellement ce document.';
      case 'approved':
        return 'Validé par votre conseiller. Aucune action complémentaire requise.';
      case 'rejected':
        return 'Document refusé. Merci de téléverser une version corrigée.';
      case 'expired':
        return 'Ce document a expiré. Une version à jour est requise.';
      default:
        return '';
    }
  }

  checklistPillClass(): 'success' | 'info' | 'neutral' {
    const s = this.checklistView().status;
    if (s === 'completed') return 'success';
    if (s === 'in_progress') return 'info';
    return 'neutral';
  }

  checklistPillLabel(): string {
    const v = this.checklistView();
    if (v.status === 'empty') return 'En attente';
    if (v.status === 'completed') return 'Complète';
    return `${v.completed} / ${v.total}`;
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  formatDate(value: unknown): string {
    if (!value) return '—';
    try {
      const ts = value as { toDate?: () => Date; seconds?: number };
      if (typeof ts?.toDate === 'function') return ts.toDate().toLocaleDateString('fr-FR');
      if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000).toLocaleDateString('fr-FR');
      if (value instanceof Date) return value.toLocaleDateString('fr-FR');
      if (typeof value === 'number') return new Date(value).toLocaleDateString('fr-FR');
      if (typeof value === 'string') return new Date(value).toLocaleDateString('fr-FR');
    } catch {
      /* ignore */
    }
    return '—';
  }

  private async loadAll(uid: string): Promise<DocumentsState> {
    const owned = await this.dossiers.listForOwner(uid, 10);
    const active = pickActiveDossier(owned);
    if (!active) {
      return {
        loading: false,
        error: null,
        hasActiveDossier: false,
        activeDossier: null,
        documents: [],
        checklist: null,
      };
    }
    const [docs, checklist] = await Promise.all([
      this.dossierDocs.listForDossier(active.id, undefined, 100),
      this.checklists.getForDossier(active.id),
    ]);
    return {
      loading: false,
      error: null,
      hasActiveDossier: true,
      activeDossier: active,
      documents: docs,
      checklist,
    };
  }
}
