export type LeadStatus = 'new' | 'qualified' | 'contacted' | 'converted' | 'closed';
export type CaseStatus = 'new' | 'audit_completed' | 'docs_required' | 'under_review' | 'training_required' | 'travel_prep' | 'completed' | 'on_hold';
export type DocumentStatus = 'missing' | 'uploaded' | 'ai_prechecked' | 'needs_revision' | 'approved' | 'rejected' | 'expired';
export type AiPreCheckStatus = 'not_started' | 'in_progress' | 'completed' | 'flagged';
export type HumanReviewStatus = 'not_requested' | 'pending' | 'in_review' | 'completed';
export type TrainingReferralStatus = 'recommended' | 'assigned' | 'in_progress' | 'completed' | 'dismissed';
export type TravelRequestStatus = 'requested' | 'in_review' | 'quoted' | 'confirmed' | 'cancelled';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface BaseEntity {
  id?: string;
  orgId: string;
  createdAt: number;
  updatedAt: number;
  // Champs propriétaire optionnels — requis par firestore.rules
  // (canWriteOwnedOrTenant : isOwner(data.userId) || isOwner(data.ownerUid) || isOwner(data.createdByUid))
  ownerUid?: string | null;
  createdByUid?: string | null;
  tenantId?: string | null;
}

export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  status: 'active' | 'inactive';
}

export interface SygepecUser extends BaseEntity {
  uid: string;
  email: string;
  displayName?: string | null;
  phone?: string | null;
  role: 'client' | 'agent' | 'admin';
}

export interface Lead extends BaseEntity {
  userId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  destinationCountry?: string;
  immigrationGoal?: string;
  readinessScore: number;
  status: LeadStatus;
  source: 'audit' | 'manual' | 'import';
}

export interface ClientProfile extends BaseEntity {
  userId: string;
  fullName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  residenceCountry?: string;
  destinationCountry?: string;
  immigrationGoal?: string;
  riskLevel?: RiskLevel;
}

export interface ImmigrationCase extends BaseEntity {
  userId: string;
  leadId?: string;
  caseNumber: string;
  destinationCountry?: string;
  immigrationGoal?: string;
  readinessScore: number;
  status: CaseStatus;
  nextBestAction?: string;
  humanReviewStatus: HumanReviewStatus;
}

export interface AuditResponse extends BaseEntity {
  caseId: string;
  userId?: string;
  answers: Record<string, unknown>;
  readinessScore: number;
  missingItems: string[];
  recommendedPrograms: string[];
  summary: string;
}

export interface ClientDocument extends BaseEntity {
  caseId: string;
  userId: string;
  category:
    | 'passport'
    | 'diploma'
    | 'transcripts'
    | 'work_experience_letter'
    | 'birth_certificate'
    | 'police_clearance'
    | 'proof_of_funds'
    | 'language_test'
    | 'cv_resume'
    | 'visa_photo';
  fileName?: string;
  status: DocumentStatus;
  aiPreCheckStatus: AiPreCheckStatus;
  humanReviewStatus: HumanReviewStatus;
}

export interface DocumentChecklist extends BaseEntity {
  caseId: string;
  userId: string;
  total: number;
  completed: number;
  missing: string[];
  completionRate: number;
}

export interface TrainingReferral extends BaseEntity {
  caseId: string;
  userId: string;
  programName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  status: TrainingReferralStatus;
}

export interface TravelReadiness extends BaseEntity {
  caseId: string;
  userId: string;
  score: number;
  passportReady: boolean;
  visaReady: boolean;
  flightRequested: boolean;
  accommodationRequested: boolean;
  insuranceReady: boolean;
}

export interface FlightRequest extends BaseEntity {
  caseId?: string;
  userId: string;
  departureCity: string;
  arrivalCity: string;
  preferredDepartureDate: string;
  flexibleDates: boolean;
  passengerCount: number;
  baggageNeeds?: string;
  budget?: number;
  notes?: string;
  status: TravelRequestStatus;
}

export interface AccommodationRequest extends BaseEntity {
  caseId?: string;
  userId: string;
  destinationCity: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  accommodationType: string;
  budget?: number;
  notes?: string;
  status: TravelRequestStatus;
}

export interface CaseTask extends BaseEntity {
  caseId: string;
  title: string;
  done: boolean;
  dueDate?: string;
}

export interface CaseMessage extends BaseEntity {
  caseId: string;
  fromUserId: string;
  toUserId?: string;
  body: string;
  read: boolean;
}

export interface CaseTimelineEvent extends BaseEntity {
  caseId: string;
  type: string;
  title: string;
  description?: string;
  actorId?: string;
}
