export type StepType = 'question' | 'ai_info' | 'form' | 'multi_select' | 'summary' | 'account_gate';
export type InputType = 'text' | 'email' | 'phone' | 'number' | 'select' | 'cards' | 'checkboxes' | 'textarea' | 'currency' | 'date';

export interface AssessmentOption {
  label: string;
  value: string;
  description?: string;
  icon?: string;
  flag?: string;
}

export interface AssessmentField {
  key: string;
  label: string;
  inputType: InputType;
  placeholder?: string;
  options?: AssessmentOption[];
  required?: boolean;
}

export interface AssessmentStep {
  id: string;
  type: StepType;
  title: string;
  subtitle?: string;
  helperText?: string;
  fieldKey?: string;
  inputType?: InputType;
  options?: AssessmentOption[];
  fields?: AssessmentField[];
  required?: boolean;
  aiMessageTemplate?: string;
  ctaLabel?: string;
  showIf?: (answers: AssessmentAnswers) => boolean;
}

export interface AssessmentAnswers {
  destinationCountry?: string;
  immigrationGoal?: string;
  auditAwareness?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  age?: number;
  nationality?: string;
  residenceCountry?: string;
  maritalStatus?: string;
  numberOfChildren?: number;
  passportValid?: string;
  educationLevel?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
  diplomaAvailable?: string;
  transcriptsAvailable?: string;
  profession?: string;
  yearsExperience?: number;
  employmentStatus?: string;
  workExperienceLettersAvailable?: string;
  frenchLevel?: string;
  englishLevel?: string;
  languageTestTaken?: string;
  languageTestType?: string;
  languageScore?: string;
  budgetAvailable?: number;
  proofOfFundsAvailable?: string;
  sponsorAvailable?: string;
  documentsAvailable?: string[];
  desiredTimeline?: string;
  preferredCityProvince?: string;
  notes?: string;

  // Account gate fields
  password?: string;
  confirmPassword?: string;
  consentAccepted?: boolean;
}

export interface AssessmentState {
  currentStepIndex: number;
  answers: AssessmentAnswers;
  readinessScore: number;
  missingItems: string[];
  recommendedPrograms: string[];
  summary?: SummaryResult;
  createdAt: number;
  updatedAt: number;
}

export type ReadinessCategory =
  | 'Profil incomplet'
  | 'Profil à construire'
  | 'Profil prometteur à vérifier'
  | 'Prêt pour revue humaine';

export interface SummaryResult {
  destination: string;
  goal: string;
  strengths: string[];
  gaps: string[];
  missingDocuments: string[];
  recommendations: string[];
  readinessScore: number;
  readinessCategory: ReadinessCategory;
  nextAction: string;
}
