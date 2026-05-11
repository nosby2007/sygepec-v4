// ============================================
// SYGEPEC TypeScript Data Models
// src/app/shared/models/index.ts
// ============================================

// Use a generic Timestamp type to avoid direct Firebase dependency in models
// Replace with: import { Timestamp } from '@angular/fire/firestore'; if @angular/fire is installed
export type Timestamp = { seconds: number; nanoseconds: number; toDate(): Date };

// ============================================
// ENUMERATIONS
// ============================================

export type CaseStatus =
  | 'lead'
  | 'intake_started'
  | 'intake_completed'
  | 'audit_started'
  | 'audit_completed'
  | 'documents_pending'
  | 'documents_review'
  | 'documents_approved'
  | 'travel_prep'
  | 'travel_ready'
  | 'arrived'
  | 'closed'
  | 'on_hold'
  | 'rejected';

export type DocumentStatus =
  | 'not_submitted'
  | 'submitted'
  | 'ai_check_pending'
  | 'ai_check_passed'
  | 'ai_check_failed'
  | 'human_review_pending'
  | 'accepted'
  | 'rejected'
  | 'expired';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

export type DestinationCountry =
  | 'canada'
  | 'usa'
  | 'uk'
  | 'uae'
  | 'qatar'
  | 'france'
  | 'germany'
  | 'australia'
  | 'other';

// ============================================
// CLIENT PROFILE
// ============================================

export interface ClientProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  nationality?: string;
  countryOfResidence?: string;
  dateOfBirth?: Timestamp;
  profession?: string;
  yearsOfExperience?: number;
  educationLevel?: 'none' | 'primary' | 'secondary' | 'bachelor' | 'master' | 'phd';
  languageSkills?: LanguageSkill[];
  linkedInUrl?: string;
  preferredLanguage: 'fr' | 'en' | 'ar';
  onboardingCompleted: boolean;
  auditCompleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LanguageSkill {
  language: string;
  proficiency: 'basic' | 'intermediate' | 'fluent' | 'native';
  testName?: string;  // IELTS, DELF, TOEFL, etc.
  testScore?: string;
  testExpiry?: Timestamp;
}

// ============================================
// IMMIGRATION CASE
// ============================================

export interface ImmigrationCase {
  id: string;
  clientId: string;
  assignedAgentId?: string;
  destination: DestinationCountry;
  visaType: string;              // e.g. "Express Entry", "Skilled Worker Visa"
  status: CaseStatus;
  priority: PriorityLevel;
  readinessScore: number;        // 0–100
  notes?: string;
  internalNotes?: string;        // Agent-only notes
  tags?: string[];
  expectedTravelDate?: Timestamp;
  actualTravelDate?: Timestamp;
  closedReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// AUDIT RESPONSE
// ============================================

export interface AuditResponse {
  id: string;
  clientId: string;
  caseId?: string;
  completedAt?: Timestamp;
  isComplete: boolean;
  responses: AuditAnswer[];
  aiSummary?: string;
  aiRecommendations?: string[];
  aiDisclaimerAcknowledged: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditAnswer {
  questionId: string;
  questionText: string;
  answer: string | string[] | boolean | number;
  step: number;
}

// ============================================
// DOCUMENT
// ============================================

export interface Document {
  id: string;
  clientId: string;
  caseId: string;
  category: DocumentCategory;
  name: string;
  description?: string;
  status: DocumentStatus;
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  uploadedAt?: Timestamp;
  expiryDate?: Timestamp;
  aiCheckResult?: AiDocumentCheckResult;
  humanReviewNote?: string;
  humanReviewedBy?: string;
  humanReviewedAt?: Timestamp;
  rejectionReason?: string;
  isRequired: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DocumentCategory =
  | 'identity'
  | 'education'
  | 'work_experience'
  | 'language'
  | 'financial'
  | 'medical'
  | 'legal'
  | 'travel'
  | 'other';

export interface AiDocumentCheckResult {
  passed: boolean;
  confidence: number;  // 0–1
  issues: string[];
  suggestions: string[];
  checkedAt: Timestamp;
  disclaimer: string;
}

// ============================================
// DOCUMENT CHECKLIST
// ============================================

export interface DocumentChecklist {
  id: string;
  destination: DestinationCountry;
  visaType: string;
  requiredDocuments: DocumentChecklistItem[];
  lastUpdated: Timestamp;
}

export interface DocumentChecklistItem {
  category: DocumentCategory;
  name: string;
  description: string;
  isRequired: boolean;
  notes?: string;
  officialLink?: string;
}

// ============================================
// TRAINING REFERRAL
// ============================================

export interface TrainingReferral {
  id: string;
  clientId: string;
  caseId?: string;
  title: string;
  provider: string;           // e.g. "InnovaCare LMS", "Coursera", "Alliance Française"
  category: 'language' | 'professional' | 'cultural' | 'legal' | 'technical' | 'soft_skills';
  reason: string;
  priority: PriorityLevel;
  externalUrl?: string;
  enrollmentStatus?: 'not_started' | 'enrolled' | 'in_progress' | 'completed' | 'dropped';
  referredBy?: string;  // agentId or 'ai'
  referredAt: Timestamp;
  completedAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================
// TRAVEL READINESS
// ============================================

export interface TravelReadiness {
  id: string;
  clientId: string;
  caseId: string;
  overallScore: number;        // 0–100 (weighted)
  passportStatus: TravelItem;         // weight 20%
  visaStatus: TravelItem;             // weight 20%
  flightStatus: TravelItem;           // weight 15%
  accommodationStatus: TravelItem;    // weight 15%
  insuranceStatus: TravelItem;        // weight 10%
  arrivalPlanStatus: TravelItem;      // weight 20%
  updatedAt: Timestamp;
}

export interface TravelItem {
  status: 'not_started' | 'in_progress' | 'completed';
  notes?: string;
  completedAt?: Timestamp;
  expiryDate?: Timestamp;
}

// ============================================
// FLIGHT REQUEST
// ============================================

export interface FlightRequest {
  id: string;
  clientId: string;
  caseId: string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  preferredDepartureDate: Timestamp;
  flexibleDates: boolean;
  passengers: number;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  specialRequirements?: string;
  estimatedBudget?: number;
  currency?: string;
  status: 'pending' | 'searching' | 'quote_sent' | 'booked' | 'cancelled';
  agentNotes?: string;
  bookingReference?: string;
  bookingConfirmedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// ACCOMMODATION REQUEST
// ============================================

export interface AccommodationRequest {
  id: string;
  clientId: string;
  caseId: string;
  city: string;
  country: string;
  checkInDate: Timestamp;
  checkOutDate?: Timestamp;
  stayDurationWeeks?: number;
  accommodationType: 'hotel' | 'apartment' | 'shared_housing' | 'student_residence' | 'any';
  bedroomCount: number;
  budget?: number;
  currency?: string;
  specialRequirements?: string;
  status: 'pending' | 'searching' | 'options_sent' | 'confirmed' | 'cancelled';
  agentNotes?: string;
  bookingReference?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// LEAD
// ============================================

export interface Lead {
  id: string;
  email: string;
  name?: string;
  phoneNumber?: string;
  countryOfOrigin?: string;
  desiredDestination?: DestinationCountry;
  source: 'website' | 'referral' | 'social_media' | 'partner' | 'direct' | 'ai_widget';
  intakeData?: Record<string, unknown>;  // AI widget answers
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'unqualified' | 'lost';
  assignedAgentId?: string;
  convertedToClientId?: string;
  convertedAt?: Timestamp;
  notes?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// CASE TIMELINE EVENT
// ============================================

export interface CaseTimelineEvent {
  id: string;
  caseId: string;
  clientId: string;
  agentId?: string;
  type: TimelineEventType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  isSystemEvent: boolean;  // auto-generated vs manual
  createdAt: Timestamp;
}

export type TimelineEventType =
  | 'case_created'
  | 'status_changed'
  | 'document_uploaded'
  | 'document_approved'
  | 'document_rejected'
  | 'audit_completed'
  | 'agent_assigned'
  | 'note_added'
  | 'training_referred'
  | 'flight_requested'
  | 'accommodation_requested'
  | 'travel_ready'
  | 'arrival_confirmed'
  | 'case_closed';

// ============================================
// AI INTAKE SESSION
// ============================================

export interface AiIntakeSession {
  id: string;
  sessionToken: string;
  leadId?: string;
  clientId?: string;
  stage: 'greeting' | 'destination' | 'profession' | 'experience' | 'language' | 'summary' | 'conversion';
  messages: IntakeMessage[];
  collectedData: Partial<Lead & ClientProfile>;
  completedAt?: Timestamp;
  convertedToLeadAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IntakeMessage {
  role: 'bot' | 'user';
  text: string;
  quickReplies?: string[];
  timestamp: Timestamp;
}
