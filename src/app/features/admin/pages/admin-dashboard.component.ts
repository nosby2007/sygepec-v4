import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { AdminRepository } from '../data/admin.repository';
import { AdminContextService } from '../data/admin-context.service';
import { SygepecDataService } from '../../../core/services/sygepec-data.service';
import { LoggerService } from '../../../core/logging/logger.service';
import type {
  Lead,
  ImmigrationCase,
  FlightRequest,
  AccommodationRequest,
  TrainingReferral,
  CaseTimelineEvent,
} from '../../../core/models/sygepec.models';

interface KpiCard {
  label: string;
  value: number | string;
  change: string;
  icon: string;
  color: string;
}

interface RecentLeadRow {
  id: string;
  name: string;
  destination: string;
  status: string;
  time: string;
}

interface ReviewRow {
  id: string;
  client: string;
  doc: string;
  issue: string;
  priority: 'high' | 'medium' | 'low';
}

interface TimelineRow {
  id: string;
  label: string;
  time: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent {
  private repo = inject(AdminRepository);
  private ctx = inject(AdminContextService);
  private data = inject(SygepecDataService);
  private logger = inject(LoggerService);

  readonly stats = toSignal(this.repo.getStats(), { initialValue: null });
  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });
  readonly roles = toSignal(this.ctx.roles$, { initialValue: [] });

  // Données réelles Firestore
  readonly loading = signal<boolean>(true);
  readonly errorMsg = signal<string | null>(null);

  private readonly leads = signal<Lead[]>([]);
  private readonly cases = signal<ImmigrationCase[]>([]);
  private readonly docsToReview = signal<Array<Record<string, any>>>([]);
  private readonly flights = signal<FlightRequest[]>([]);
  private readonly accommodations = signal<AccommodationRequest[]>([]);
  private readonly trainingReferrals = signal<TrainingReferral[]>([]);
  private readonly timelineEvents = signal<CaseTimelineEvent[]>([]);

  readonly kpiCards = computed<KpiCard[]>(() => {
    const leadsList = this.leads();
    const casesList = this.cases();
    const newLeads = leadsList.filter((l) => l.status === 'new').length;
    const reviewing = casesList.filter((c) => c.humanReviewStatus === 'in_review').length;
    const urgentCases = casesList.filter((c) => c.humanReviewStatus === 'pending').length;
    const docsCount = this.docsToReview().length;
    const aiFlagged = this.docsToReview().filter(
      (d) => d['aiPreCheckStatus'] === 'failed' || d['aiPreCheckStatus'] === 'flagged',
    ).length;
    const flightsList = this.flights();
    const flightsNoQuote = flightsList.filter((f) => f.status === 'requested').length;
    const accomList = this.accommodations();
    const accomConfirmed = accomList.filter((a) => a.status === 'confirmed').length;
    const trainings = this.trainingReferrals();
    const trainingEnrolled = trainings.filter(
      (t) => t.status === 'assigned' || t.status === 'in_progress' || t.status === 'completed',
    ).length;

    return [
      {
        label: 'Nouveaux Leads',
        value: leadsList.length,
        change: `${newLeads} nouveau${newLeads > 1 ? 'x' : ''}`,
        icon: '📥',
        color: '#1E63D6',
      },
      {
        label: 'Dossiers en Révision',
        value: casesList.length,
        change: `${reviewing} en cours · ${urgentCases} urgents`,
        icon: '📋',
        color: '#F59E0B',
      },
      {
        label: 'Documents à Réviser',
        value: docsCount,
        change: aiFlagged > 0 ? `${aiFlagged} avec problèmes IA` : 'Aucune alerte IA',
        icon: '📄',
        color: '#DC2626',
      },
      {
        label: 'Demandes de Vol',
        value: flightsList.length,
        change: `${flightsNoQuote} sans devis`,
        icon: '✈️',
        color: '#14B8A6',
      },
      {
        label: "Demandes d'Hébergement",
        value: accomList.length,
        change: `${accomConfirmed} confirmé${accomConfirmed > 1 ? 's' : ''}`,
        icon: '🏨',
        color: '#16A34A',
      },
      {
        label: 'Formations Référées',
        value: trainings.length,
        change: `${trainingEnrolled} inscrits / complétés`,
        icon: '📚',
        color: '#8B5CF6',
      },
    ];
  });

  readonly recentLeads = computed<RecentLeadRow[]>(() =>
    [...this.leads()]
      .sort((a, b) => this.toMillis(b.createdAt) - this.toMillis(a.createdAt))
      .slice(0, 5)
      .map((l) => ({
        id: l.id ?? '',
        name: l.fullName || l.email || 'Anonyme',
        destination: l.destinationCountry || '—',
        status: l.status || 'new',
        time: this.relative(l.createdAt),
      })),
  );

  readonly pendingReviews = computed<ReviewRow[]>(() =>
    this.docsToReview()
      .slice(0, 5)
      .map((d) => ({
        id: String(d['id'] ?? ''),
        client: String(d['ownerFullName'] ?? d['userFullName'] ?? d['userId'] ?? 'Client'),
        doc: String(d['fileName'] ?? d['category'] ?? 'Document'),
        issue: String(
          d['rejectionReason'] ?? d['aiNotes'] ?? this.humanReviewLabel(d['humanReviewStatus']),
        ),
        priority: this.computePriority(d),
      })),
  );

  readonly recentTimeline = computed<TimelineRow[]>(() =>
    [...this.timelineEvents()]
      .sort((a, b) => this.toMillis(b.createdAt) - this.toMillis(a.createdAt))
      .slice(0, 6)
      .map((e) => ({
        id: e.id ?? '',
        label: e.title || e.description || e.type || 'Événement',
        time: this.relative(e.createdAt),
      })),
  );

  readonly queueStats = computed(() => {
    const cases = this.cases();
    return {
      casesAwaitingReview: cases.filter((c) => c.humanReviewStatus === 'pending').length,
      docsUrgent: this.pendingReviews().filter((r) => r.priority === 'high').length,
      flightsOpen: this.flights().filter(
        (f) => f.status !== 'cancelled' && f.status !== 'confirmed',
      ).length,
      trainingsActive: this.trainingReferrals().filter(
        (t) => t.status !== 'completed' && t.status !== 'dismissed',
      ).length,
    };
  });

  constructor() {
    void this.loadAll();
  }

  async refresh(): Promise<void> {
    await this.loadAll();
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const [leads, cases, docs, flights, accom, trainings, timeline] = await Promise.all([
        this.data.getLeads().catch((e) => this.handle('leads', e, [] as Lead[])),
        this.data.getAdminCases().catch((e) => this.handle('cases', e, [] as ImmigrationCase[])),
        this.data
          .getDocumentsNeedingReview()
          .catch((e) => this.handle('docsReview', e, [] as Array<Record<string, any>>)),
        this.data
          .getFlightRequests()
          .catch((e) => this.handle('flights', e, [] as FlightRequest[])),
        this.data
          .getAccommodationRequests()
          .catch((e) => this.handle('accommodations', e, [] as AccommodationRequest[])),
        this.data
          .getTrainingReferrals()
          .catch((e) => this.handle('trainings', e, [] as TrainingReferral[])),
        this.data
          .getTimelineEvents(20)
          .catch((e) => this.handle('timeline', e, [] as CaseTimelineEvent[])),
      ]);
      this.leads.set(leads);
      this.cases.set(cases);
      this.docsToReview.set(docs);
      this.flights.set(flights);
      this.accommodations.set(accom);
      this.trainingReferrals.set(trainings);
      this.timelineEvents.set(timeline);
      this.logger.debug('admin-dashboard:loaded', {
        leads: leads.length,
        cases: cases.length,
        docs: docs.length,
        flights: flights.length,
        accom: accom.length,
        trainings: trainings.length,
        timeline: timeline.length,
      });
    } catch (err) {
      this.logger.error('admin-dashboard:loadAll failed', err);
      this.errorMsg.set('Impossible de charger les données.');
    } finally {
      this.loading.set(false);
    }
  }

  private handle<T>(label: string, err: unknown, fallback: T): T {
    this.logger.warn(`admin-dashboard:${label} failed`, err);
    return fallback;
  }

  // ---------- helpers UI ----------

  getLeadStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      new: 'Nouveau',
      contacted: 'Contacté',
      audit_started: 'Audit en cours',
      audit_completed: 'Audit complété',
      converted: 'Converti',
      lost: 'Perdu',
    };
    return labels[status] || status;
  }

  getLeadStatusClass(status: string): string {
    const classes: Record<string, string> = {
      new: 'new',
      contacted: 'info',
      audit_started: 'warn',
      audit_completed: 'active',
      converted: 'success',
      lost: 'danger',
    };
    return classes[status] || 'info';
  }

  private humanReviewLabel(status: unknown): string {
    const map: Record<string, string> = {
      pending: 'En attente de révision',
      in_review: 'Révision en cours',
      approved: 'Approuvé',
      rejected: 'Rejeté',
    };
    return map[String(status)] || 'À examiner';
  }

  private computePriority(d: Record<string, any>): 'high' | 'medium' | 'low' {
    const ai = d['aiPreCheckStatus'];
    if (ai === 'failed' || ai === 'flagged') return 'high';
    if (d['humanReviewStatus'] === 'pending') return 'medium';
    return 'low';
  }

  private toMillis(ts: any): number {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts?.toMillis === 'function') return ts.toMillis();
    if (ts?.seconds != null) return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    const parsed = Date.parse(String(ts));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private relative(ts: any): string {
    const ms = this.toMillis(ts);
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const min = Math.round(diff / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24);
    if (d < 7) return `il y a ${d} j`;
    return new Date(ms).toLocaleDateString('fr-FR');
  }
}
