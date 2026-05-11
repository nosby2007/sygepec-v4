# SYGEPEC — Parcours de Relocalisation

> Guide complet du parcours client sur la plateforme SYGEPEC

---

## Vue d'ensemble

SYGEPEC guide les utilisateurs à travers 7 grandes étapes, depuis la découverte de la plateforme 
jusqu'à l'arrivée et l'intégration dans le pays de destination.

```
1. Découverte → 2. Qualification → 3. Audit → 4. Documents → 5. Formation → 6. Voyage → 7. Arrivée
```

---

## Étape 1 : Découverte (Lead)

**Route :** `/public`  
**Composant :** `PublicHomeComponent`  
**Widget IA :** `AiIntakeWidgetComponent`

L'utilisateur arrive sur la landing page. Le widget IA flottant engage une conversation
pour collecter les informations de base :

- Destination souhaitée
- Profession
- Années d'expérience
- Niveau linguistique
- Adresse email

**Résultat :** Un enregistrement `Lead` est créé dans Firestore.  
**Statut initial :** `lead.status = 'new'`

---

## Étape 2 : Qualification & Inscription

**Route :** `/auth/register`  
**Flow :** Email/mot de passe ou Google Sign-In

L'utilisateur crée son compte. Le `Lead` est converti en `ClientProfile` + `ImmigrationCase`.

**Transitions :**
- `Lead.status` → `'converted'`
- `ImmigrationCase.status` → `'intake_started'`

---

## Étape 3 : Audit Personnel

**Route :** `/immigration/audit`  
**Composant :** `AuditWizardComponent` (multi-étapes)

Un questionnaire en 11 étapes collecte des informations détaillées :

| Étape | Sujet |
|-------|-------|
| 1 | Informations personnelles |
| 2 | Situation familiale |
| 3 | Niveau d'éducation |
| 4 | Expérience professionnelle |
| 5 | Compétences linguistiques |
| 6 | Situation financière |
| 7 | Motivations d'immigration |
| 8 | Contraintes et préférences |
| 9 | Historique de voyages |
| 10 | Santé et exigences médicales |
| 11 | Consentements et disclaimers |

**Résultat :**
- `AuditResponse` créé dans Firestore
- Analyse IA des réponses (avec disclaimer visible)
- Recommandations de destinations et de visas
- `ImmigrationCase.status` → `'audit_completed'`

---

## Étape 4 : Préparation des Documents

**Route :** `/immigration/documents`

L'utilisateur voit la liste des documents requis pour son profil spécifique, 
uploadés via Firebase Storage. Chaque document passe par :

1. **Vérification IA :** Détection de problèmes courants (lisibilité, champs manquants, expiration)
2. **Révision humaine :** Un agent SYGEPEC valide et approuve ou demande une correction

**Statuts de document :**
```
not_submitted → submitted → ai_check_pending → ai_check_passed/failed → human_review_pending → accepted/rejected
```

---

## Étape 5 : Formation & Préparation

**Route :** `/training`

Sur la base de l'audit, des formations sont recommandées :

- **Langue :** Préparation IELTS, DELF, cours d'anglais/français
- **Professionnel :** Certifications sectorielles, adaptation au marché local
- **Culturel :** Guide d'intégration culturelle, droits et obligations
- **Légal :** Processus d'immigration, droits des travailleurs étrangers

Chaque formation référée est tracée dans `TrainingReferral` avec un statut d'inscription.

---

## Étape 6 : Préparation au Voyage

**Route :** `/travel`

Score de préparation pondéré (0–100) basé sur 6 facteurs :

| Facteur | Poids | Critère |
|---------|-------|---------|
| Passeport valide | 20% | Expiry > 6 mois |
| Visa obtenu | 20% | Document accepté |
| Vol réservé | 15% | Référence de réservation |
| Hébergement confirmé | 15% | Confirmation reçue |
| Assurance voyage | 10% | Police valide |
| Plan d'arrivée | 20% | Contacts, transport, démarches admin |

**Actions disponibles :**
- Formulaire de demande de vol → `FlightRequest`
- Formulaire de demande d'hébergement → `AccommodationRequest`

---

## Étape 7 : Arrivée & Intégration

**Post-arrivée :** L'agent marque le dossier comme `'arrived'` puis `'closed'`

La plateforme conserve l'historique complet dans `CaseTimeline` pour référence future.

---

## Rôles Système

| Rôle | Description | Accès |
|------|-------------|-------|
| `client` | Utilisateur standard | Son dossier, ses documents, son profil |
| `agent` | Conseiller SYGEPEC | Dossiers assignés, révision documents |
| `admin` | Administrateur plateforme | Accès complet + stats + paramètres |
| `org_admin` | Admin organisation partenaire | Portée limitée à son organisation |

---

## Notifications (à implémenter)

| Événement | Canal | Destinataire |
|-----------|-------|--------------|
| Document approuvé | Email + in-app | Client |
| Document rejeté | Email + in-app | Client |
| Agent assigné | Email | Client |
| Nouveau lead | Email | Agent |
| Dossier bloqué (30j inactif) | Email | Client + Agent |
| Vol/Hébergement confirmé | Email + in-app | Client |
