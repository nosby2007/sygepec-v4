# SYGEPEC — Modèle de Données Firestore

> Version 1.0 | Collections Firestore utilisées par la plateforme

---

## Vue d'ensemble

SYGEPEC utilise Firebase Firestore (mode natif) comme base de données principale. 
Les données sont organisées en 12 collections principales.

```
firestore/
├── users/               # Profils clients et agents
├── leads/               # Prospects (avant conversion)
├── cases/               # Dossiers d'immigration
├── auditResponses/      # Réponses aux audits personnels
├── documents/           # Documents soumis et leur statut
├── documentChecklists/  # Listes de documents requis par visa/destination
├── trainingReferrals/   # Formations recommandées
├── travelReadiness/     # Score et état de préparation voyage
├── flightRequests/      # Demandes de vol
├── accommodationRequests/ # Demandes d'hébergement
├── caseTimeline/        # Historique des événements (sous-collection de cases/)
└── aiIntakeSessions/    # Sessions du widget IA
```

---

## Collection : `users`

**Chemin :** `/users/{uid}`

| Champ               | Type        | Description |
|---------------------|-------------|-------------|
| `uid`               | string      | Firebase Auth UID |
| `email`             | string      | Email de l'utilisateur |
| `displayName`       | string      | Nom complet |
| `phoneNumber`       | string?     | Numéro de téléphone |
| `nationality`       | string?     | Nationalité |
| `countryOfResidence`| string?     | Pays de résidence |
| `dateOfBirth`       | Timestamp?  | Date de naissance |
| `profession`        | string?     | Profession actuelle |
| `yearsOfExperience` | number?     | Années d'expérience |
| `educationLevel`    | enum        | `none\|primary\|secondary\|bachelor\|master\|phd` |
| `languageSkills`    | array       | `[{ language, proficiency, testName?, testScore?, testExpiry? }]` |
| `preferredLanguage` | enum        | `fr\|en\|ar` |
| `onboardingCompleted` | boolean   | Onboarding terminé |
| `auditCompleted`    | boolean     | Audit personnel terminé |
| `createdAt`         | Timestamp   | Date de création |
| `updatedAt`         | Timestamp   | Dernière mise à jour |

---

## Collection : `leads`

**Chemin :** `/leads/{leadId}`

| Champ                  | Type      | Description |
|------------------------|-----------|-------------|
| `email`                | string    | Email du prospect |
| `name`                 | string?   | Nom |
| `phoneNumber`          | string?   | Téléphone |
| `countryOfOrigin`      | string?   | Pays d'origine |
| `desiredDestination`   | enum      | Pays cible |
| `source`               | enum      | `website\|referral\|social_media\|partner\|direct\|ai_widget` |
| `intakeData`           | map?      | Données collectées par le widget IA |
| `status`               | enum      | `new\|contacted\|qualified\|converted\|unqualified\|lost` |
| `assignedAgentId`      | string?   | UID de l'agent assigné |
| `convertedToClientId`  | string?   | UID client après conversion |
| `convertedAt`          | Timestamp?| Date de conversion |
| `notes`                | string?   | Notes internes |
| `createdAt`            | Timestamp | Date de création |
| `updatedAt`            | Timestamp | Dernière mise à jour |

---

## Collection : `cases`

**Chemin :** `/cases/{caseId}`

| Champ                | Type       | Description |
|----------------------|------------|-------------|
| `clientId`           | string     | UID du client |
| `assignedAgentId`    | string?    | UID de l'agent assigné |
| `destination`        | enum       | Pays de destination |
| `visaType`           | string     | Type de visa (ex: "Express Entry") |
| `status`             | enum       | `lead\|intake_started\|...\|closed` |
| `priority`           | enum       | `low\|medium\|high\|urgent` |
| `readinessScore`     | number     | Score 0–100 |
| `notes`              | string?    | Notes client |
| `internalNotes`      | string?    | Notes agent uniquement |
| `tags`               | string[]?  | Tags de catégorisation |
| `expectedTravelDate` | Timestamp? | Date de voyage prévue |
| `actualTravelDate`   | Timestamp? | Date de voyage réelle |
| `closedReason`       | string?    | Raison de fermeture |
| `createdAt`          | Timestamp  | Date de création |
| `updatedAt`          | Timestamp  | Dernière mise à jour |

### Sous-collection : `cases/{caseId}/timeline`

| Champ          | Type     | Description |
|----------------|----------|-------------|
| `type`         | enum     | Type d'événement |
| `title`        | string   | Titre lisible |
| `description`  | string?  | Détail |
| `agentId`      | string?  | Auteur si agent |
| `isSystemEvent`| boolean  | Auto-généré vs manuel |
| `createdAt`    | Timestamp| Date de l'événement |

---

## Collection : `auditResponses`

**Chemin :** `/auditResponses/{responseId}`

| Champ                       | Type      | Description |
|-----------------------------|-----------|-------------|
| `clientId`                  | string    | UID client |
| `caseId`                    | string?   | ID dossier associé |
| `completedAt`               | Timestamp?| Date de complétion |
| `isComplete`                | boolean   | Audit terminé |
| `responses`                 | array     | `[{ questionId, questionText, answer, step }]` |
| `aiSummary`                 | string?   | Résumé généré par IA |
| `aiRecommendations`         | string[]? | Recommandations IA |
| `aiDisclaimerAcknowledged`  | boolean   | Disclaimer IA accepté |
| `createdAt`                 | Timestamp | Date de création |
| `updatedAt`                 | Timestamp | Dernière mise à jour |

---

## Collection : `documents`

**Chemin :** `/documents/{documentId}`

| Champ                | Type       | Description |
|----------------------|------------|-------------|
| `clientId`           | string     | UID client |
| `caseId`             | string     | ID dossier |
| `category`           | enum       | Catégorie document |
| `name`               | string     | Nom du document |
| `status`             | enum       | `not_submitted\|...\|expired` |
| `fileUrl`            | string?    | URL Firebase Storage |
| `fileName`           | string?    | Nom du fichier |
| `fileSizeBytes`      | number?    | Taille en octets |
| `mimeType`           | string?    | Type MIME |
| `uploadedAt`         | Timestamp? | Date d'upload |
| `expiryDate`         | Timestamp? | Date d'expiration |
| `aiCheckResult`      | map?       | `{ passed, confidence, issues[], suggestions[], checkedAt, disclaimer }` |
| `humanReviewNote`    | string?    | Note de révision humaine |
| `humanReviewedBy`    | string?    | UID agent réviseur |
| `humanReviewedAt`    | Timestamp? | Date de révision |
| `rejectionReason`    | string?    | Raison de rejet |
| `isRequired`         | boolean    | Document obligatoire |
| `createdAt`          | Timestamp  | Date de création |
| `updatedAt`          | Timestamp  | Dernière mise à jour |

---

## Collection : `travelReadiness`

**Chemin :** `/travelReadiness/{readinessId}`

| Champ                  | Type      | Poids | Description |
|------------------------|-----------|-------|-------------|
| `clientId`             | string    | —     | UID client |
| `caseId`               | string    | —     | ID dossier |
| `overallScore`         | number    | —     | Score global 0–100 |
| `passportStatus`       | TravelItem| 20%   | État passeport |
| `visaStatus`           | TravelItem| 20%   | État visa |
| `flightStatus`         | TravelItem| 15%   | Vol réservé |
| `accommodationStatus`  | TravelItem| 15%   | Hébergement confirmé |
| `insuranceStatus`      | TravelItem| 10%   | Assurance voyage |
| `arrivalPlanStatus`    | TravelItem| 20%   | Plan d'arrivée |
| `updatedAt`            | Timestamp | —     | Dernière mise à jour |

**TravelItem structure :**
```json
{
  "status": "not_started | in_progress | completed",
  "notes": "string optionnel",
  "completedAt": "Timestamp optionnel",
  "expiryDate": "Timestamp optionnel"
}
```

---

## Collection : `flightRequests`

**Chemin :** `/flightRequests/{requestId}`

| Champ                  | Type       | Description |
|------------------------|------------|-------------|
| `clientId`             | string     | UID client |
| `caseId`               | string     | ID dossier |
| `originCity`           | string     | Ville de départ |
| `destinationCity`      | string     | Ville d'arrivée |
| `preferredDepartureDate`| Timestamp | Date préférée |
| `flexibleDates`        | boolean    | Flexibilité dates |
| `passengers`           | number     | Nombre de passagers |
| `cabinClass`           | enum       | `economy\|premium_economy\|business\|first` |
| `status`               | enum       | `pending\|searching\|quote_sent\|booked\|cancelled` |
| `bookingReference`     | string?    | Référence de réservation |
| `createdAt`            | Timestamp  | Date de création |
| `updatedAt`            | Timestamp  | Dernière mise à jour |

---

## Règles de Sécurité (résumé)

```
users/{uid}: read/write if request.auth.uid == uid
leads/{leadId}: create by anyone, read/write by admin
cases/{caseId}: read if clientId == auth.uid OR admin
documents/{docId}: read/write if clientId == auth.uid
documents/{docId}: admin can update status fields
travelReadiness/{id}: read if clientId == auth.uid OR admin
flightRequests/{id}: create/read if clientId == auth.uid
accommodationRequests/{id}: create/read if clientId == auth.uid
auditResponses/{id}: read/write if clientId == auth.uid
```

Voir `firestore.rules` pour les règles complètes.
