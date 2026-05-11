import type { BaseEntity } from './base.entity';

/**
 * Profil étendu d'un user. Stocké dans users/{uid}/profile/main.
 * Séparé du UserDoc pour éviter de charger toutes les données perso à chaque check de rôle.
 */
export interface UserProfile extends BaseEntity {
  uid: string;

  fullName: string | null;
  nationality: string | null;
  residenceCountry: string | null;

  /** Pays cible immigration. */
  destinationCountry: string | null;
  immigrationGoal: 'work' | 'study' | 'family' | 'business' | 'visit' | 'permanent' | null;

  riskLevel: 'low' | 'medium' | 'high' | null;

  preferredLanguage: 'fr' | 'en' | null;

  status: 'draft' | 'completed' | 'verified';

  // ---------------------------------------------------------------------------
  // Lot B (audit wizard premium) — extension non-breaking
  // Tous les champs ci-dessous sont optionnels et nullable.
  // ---------------------------------------------------------------------------

  dateOfBirth?: string | null;          // ISO YYYY-MM-DD
  maritalStatus?: string | null;
  dependentsCount?: number | null;

  /** Alias sémantique de `residenceCountry` exigé par le wizard d'audit. */
  countryOfResidence?: string | null;
  phone?: string | null;

  highestEducationLevel?: string | null;
  fieldOfStudy?: string | null;
  graduationYear?: number | null;

  currentProfession?: string | null;
  yearsOfExperience?: number | null;
  professionalLicense?: string | null;

  languageTests?: Array<{
    type: string;
    score?: string | null;
    date?: string | null;
  }>;

  passportValid?: boolean | null;
  passportExpirationDate?: string | null;   // ISO YYYY-MM-DD

  proofOfFundsAvailable?: boolean | null;
  sponsorAvailable?: boolean | null;

  travelHistorySummary?: string | null;
}
