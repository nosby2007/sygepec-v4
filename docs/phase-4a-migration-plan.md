# Phase 4A — Plan de migration `sygepec*` → modèle canonique

> **Aucune écriture, aucune suppression.** Phase 4A = analyse + plan uniquement.
> Toute exécution réelle (apply) est différée à Phase 4B+ après validation explicite.
> Pré-requis fonctionnel : le flow Audit Wizard Premium → AuditDraft → Promotion → Dossier → Documents `requested` → Upload client → Admin review est validé en Phase 3.

---

## A. Résumé exécutif

Le projet possède aujourd'hui **deux schémas de données coexistants** :

| Domaine | Legacy (`sygepec*`) | Canonique (cible) |
|---|---|---|
| Lead | `sygepecLeads` | *(pas encore de modèle canonique — à confirmer)* |
| Profil client | `sygepecClientProfiles/{uid}` | `users/{uid}/profile/main` |
| Cas / dossier | `sygepecCases` | `dossiers/{dossierId}` |
| Réponses audit | `sygepecAuditResponses` | `users/{uid}/auditDrafts/{auditId}` (premium) ou `dossiers/{id}.auditSummary` (legacy) |
| Checklist | `sygepecDocumentChecklists` | `checklists/{checklistId}` |
| Timeline | `sygepecTimeline` | `dossiers/{dossierId}/timeline/{eventId}` (+ `auditLogs` pour les actions privilégiées) |
| Documents client | `sygepecClientDocuments` | `dossiers/{dossierId}/documents/{docId}` |
| Formation | `sygepecTrainingReferrals` | `serviceRequests` (category=`training`) |
| Préparation voyage | `sygepecTravelReadiness` | champ `dossiers.readinessScore` + sous-doc dédié |
| Vol | `sygepecFlightRequests` | `travelBookings` (kind=`flight`) |
| Hébergement | `sygepecAccommodationRequests` | `travelBookings` (kind=`hotel`) |

La façade [`SygepecDataService`](../src/app/core/services/sygepec-data.service.ts) implémente déjà un **double-write contrôlé** (legacy obligatoire, canonique best-effort, idempotent via `legacy_<caseId>`). Le script [`scripts/migrate-legacy-collections.mjs`](../scripts/migrate-legacy-collections.mjs) effectue déjà une **inspection dry-run** (counts, samples, status remap, orphans, missing fields) mais **ne crée pas encore d'écriture canonique** et **ne gère pas le bootstrap users/{uid}**.

**Objectif Phase 4A** : verrouiller la spec de migration (mapping, IDs déterministes, dédup, statuts, bootstrap user, garde-fous apply) avant tout `--apply`.

---

## B. Inventaire des collections legacy

> Données réelles à collecter via `npm run migrate:dry-run` (déjà disponible — section I).
> Le script lit en `limit(500)` par collection ; le rapport ci-dessous liste les **champs attendus** issus du code source ([`sygepec.models.ts`](../src/app/core/models/sygepec.models.ts) et [`SygepecDataService`](../src/app/core/services/sygepec-data.service.ts)).

| Collection | Champs critiques | Champs owner/tenant | Statuts attendus | Notes |
|---|---|---|---|---|
| `sygepecLeads` | `email`, `fullName`, `phone`, `destinationCountry`, `immigrationGoal`, `readinessScore`, `source` | `userId` / `ownerUid` / `createdByUid`, `tenantId`/`orgId` | `new`, `contacted`, `qualified`, `converted`, `lost` | Source = `audit` majoritairement |
| `sygepecClientProfiles/{uid}` | `fullName`, `email`, `phone`, `nationality`, `residenceCountry`, `destinationCountry`, `immigrationGoal`, `riskLevel` | id document = `uid`, `userId`, `ownerUid`, `tenantId` | n/a | Une ligne par utilisateur ; doc id = uid |
| `sygepecCases` | `kind`, `dossierNumber`/`caseNumber`, `readinessScore`, `assignedAgentUid`, `program` | `userId`/`uid`/`ownerUid`, `tenantId`/`orgId` | `new`, `audit_completed`, `docs_required`, `submitted`, `under_review`, `approved`, `rejected`, `completed`, `on_hold`, `cancelled` | Cœur du domaine |
| `sygepecAuditResponses` | `caseId`, `answers` (objet libre), `readinessScore`, `submittedAt` | `userId` | n/a | 1↔1 avec un `sygepecCases` ou orphelin |
| `sygepecDocumentChecklists` | `caseId`, `items[]`, `total`, `completed` | id implicite via `caseId` | `in_progress`, `completed` | Items = `{label, status, required}` |
| `sygepecTimeline` | `caseId`, `action`/`event`, `message`, `actorUid`, `actorName` | `caseId`, `tenantId` | n/a | Append-only |
| `sygepecClientDocuments` | `caseId`, `category`/`type`, `label`/`name`, `storagePath`, `downloadUrl`, `fileName`, `contentType`, `size` | `userId`/`uid`/`ownerUid`, `caseId` | `pending`, `requested`, `submitted`, `uploaded`, `approved`, `rejected`, `expired`, `correction_required` | Lien vers Storage |
| `sygepecTrainingReferrals` | `programSlug`/`program`, `recommendedBy` | `uid`, `tenantId` | `recommended`, `assigned`, `in_progress`, `completed`, `dismissed` | |
| `sygepecTravelReadiness` | `caseId`, `readinessScore`, `breakdown` | `caseId` | n/a | Score agrégé |
| `sygepecFlightRequests` | `from`/`departure`, `to`/`destination`, `dates`, `priceUsd`, `carrier` | `uid`, `tenantId` | `requested`, `reviewing`, `quoted`, `confirmed`, `cancelled`, `rejected`, `completed` | |
| `sygepecAccommodationRequests` | `city`, `checkIn`, `checkOut`, `priceUsd`, `hotelName` | `uid`, `tenantId` | idem flights | |

**Méta-checks attendus pour chaque collection** (à produire par le dry-run enrichi — voir section I) :
- `total` (count complet, pas limit 500)
- `withTenantId`, `withoutTenantId`
- `withOwner` (au moins un parmi `uid`/`userId`/`ownerUid`/`createdByUid`), `orphans`
- `withCaseId` (pour les collections enfant de `sygepecCases`)
- `alreadyMigrated` (présence de `migrationSource: 'sygepec_legacy'` dans la cible canonique correspondante)
- `duplicates` détectés (même `caseId` + même `category` pour documents, etc.)
- `statusDistribution` complète

---

## C. Mapping legacy → canonique

| # | Source | Cible | ID cible déterministe | Stratégie |
|---|---|---|---|---|
| 1 | `sygepecClientProfiles/{uid}` | `users/{uid}/profile/main` | path fixe `users/{uid}/profile/main` | `merge: true` prudent, ne jamais écraser un champ non-null déjà présent |
| 2 | `sygepecCases/{caseId}` | `dossiers/{dossierId}` | `legacy_<caseId>` (sauf si déjà lié à un `audit_<auditDraftId>`) | create si absent, sinon merge avec garde-fous tenant/owner |
| 3 | `sygepecAuditResponses/{respId}` | `dossiers/{dossierId}.auditSummary` (champ) **+** archive dans `dossiers/{dossierId}/auditResponses/{legacy_<respId>}` | sous-doc `legacy_<respId>` | jamais d'écrasement de `auditSummary` si déjà rempli |
| 4 | `sygepecDocumentChecklists/{checklistId}` | `checklists/{checklistId}` | `checklist_<dossierId>` | merge des items manquants uniquement (matching par `label` ou `slug`) |
| 5 | `sygepecClientDocuments/{docId}` | `dossiers/{dossierId}/documents/{docId}` | `legacy_doc_<sygepecClientDocumentId>` | skip si déjà migré (présence `legacyId`) |
| 6 | `sygepecTimeline/{evtId}` | `dossiers/{dossierId}/timeline/{legacy_evt_<evtId>}` ; **et** `auditLogs/{auto}` si `action ∈ {decision, status_change, payment_*}` | `legacy_evt_<evtId>` | append-only |
| 7 | `sygepecTrainingReferrals/{refId}` | `serviceRequests/{legacy_train_<refId>}` (category=`training`) | `legacy_train_<refId>` | aucun écrasement de devis `quotedAmountUsd` |
| 8 | `sygepecTravelReadiness/{tId}` | `dossiers/{dossierId}.readinessScore` (champ) **+** `dossiers/{dossierId}/readiness/main` | sous-doc fixe `main` | merge prudent |
| 9 | `sygepecFlightRequests/{fId}` | `travelBookings/{legacy_travel_<fId>}` (kind=`flight`) | `legacy_travel_<fId>` | conserver `priceUsd` legacy uniquement si `flight.priceUsd` cible est null |
| 10 | `sygepecAccommodationRequests/{aId}` | `travelBookings/{legacy_travel_<aId>}` (kind=`hotel`) | `legacy_travel_<aId>` | idem |
| 11 | `sygepecLeads/{lId}` | **conserver legacy** en Phase 4B/4C ; modèle canonique `leads/` à concevoir Phase 4D | n/a | aucun mapping pour l'instant |

### C.1 Champs systématiquement injectés sur chaque doc canonique migré

```ts
{
  // Identité de la migration
  migrationSource: 'sygepec_legacy',
  legacyCollection: 'sygepecCases',          // ex
  legacyId: '<original doc id>',
  migratedAt: serverTimestamp(),
  migrationVersion: '4a.1',
  migrationBatchId: 'YYYYMMDD_HHMM',

  // Tenant/owner garantis (sinon skip + warning)
  tenantId, ownerUid, userId, createdByUid,
}
```

---

## D. Champs transformés

| Source → Cible | Transformation |
|---|---|
| `sygepecCases.caseNumber` → `dossiers.title` | si `title` cible vide : `title = "Dossier " + caseNumber` |
| `sygepecCases.kind` → `dossiers.program` | direct |
| `sygepecCases.assignedAgentUid` → `dossiers.assignedToUid` | direct |
| `sygepecClientDocuments.label`/`name` → `dossiers/.../documents.title` | direct (priorité `label`) |
| `sygepecClientDocuments.category`/`type` → `documents.type` | direct (priorité `category`) |
| `sygepecClientDocuments.storagePath` → `documents.storagePath` + `downloadUrl` | conserver l'URL Storage existante, ne pas régénérer |
| `sygepecTimeline.action`/`event` → `timeline.type` | mapping explicite (voir F.3) |
| `sygepecTimeline.message`/`description` → `timeline.message` | priorité `message` |
| `sygepecFlightRequests.from`/`to`/`dates` → `travelBookings.flight = {origin, destination, departureDate, returnDate}` | structure imbriquée |
| `sygepecAccommodationRequests.checkIn`/`checkOut` → `travelBookings.hotel = {city, checkIn, checkOut}` | structure imbriquée |
| `sygepecClientProfiles.preferredLanguage`/`lang` → `users/.../profile/main.locale` | `'fr' | 'en'` normalisé |

---

## E. Champs abandonnés (volontairement)

| Champ legacy | Raison |
|---|---|
| `sygepec*.createdAtServer`, `updatedAtServer` | remplacés par `serverTimestamp()` à l'écriture canonique |
| `sygepec*.organizationId` (alias `orgId`) | un seul champ canonique : `tenantId` (alias `orgId` conservé pour compat lecture) |
| `sygepecLeads.source = 'audit'` | conservé dans le doc legacy ; non remappé tant que `leads/` canonique inexistant |
| `sygepecCases.riskLevel` | conservé en lecture legacy via `SygepecDataService` ; non promu en Phase 4B |
| `sygepecCases.checklistId` | redondant avec `checklists/{checklist_<dossierId>}` |
| Champs UI legacy (`uiHints`, `_lastSyncedAt`) | jamais migrés |

Toute valeur abandonnée doit être **listée explicitement** dans le rapport JSON dry-run (`fieldsDropped[]`) pour audit.

---

## F. Mapping des statuts

### F.1 Cases → Dossiers

| Legacy | Canonique (`DossierStatus`) |
|---|---|
| `new` | `new` |
| `audit_completed` | `in_review` *(le wizard est terminé, pré-revue admin)* |
| `docs_required` / `documents_required` | `docs_required` |
| `submitted` | `submitted` |
| `under_review` / `review` | `in_review` |
| `approved` | `approved` |
| `rejected` | `rejected` |
| `completed` / `closed` | `closed` |
| `on_hold` | `in_review` (avec note `on_hold` dans `dossiers.notes`) |
| `cancelled` | `closed` (avec note) |
| `training_required`, `travel_prep` | `in_review` (état métier porté par sous-collections) |

> ⚠️ Le mapping `audit_completed → in_review` diffère de la suggestion utilisateur (`awaiting_documents`). Justification : `DossierStatus` canonique n'a pas `awaiting_documents` ; `docs_required` est le statut existant équivalent. **Décision Phase 4A** : utiliser `docs_required` pour `audit_completed` **uniquement si** la checklist legacy contient au moins un item non rempli ; sinon `in_review`.

### F.2 Documents

| Legacy | Canonique (`DossierDocument.status`) | Notes |
|---|---|---|
| `pending` | `requested` | |
| `requested` | `requested` | |
| `submitted` | `uploaded` | |
| `uploaded` | `uploaded` | |
| `approved` / `validated` | `validated` | terme canonique = `validated` |
| `rejected` | `rejected` | conserver `rejectionReason` legacy |
| `correction_required` | `rejected` | + `rejectionReason = 'Correction requise (legacy)'` |
| `expired` | `rejected` | + `rejectionReason = 'Expiré (legacy)'` |

### F.3 Timeline (events)

| Legacy `action`/`event` | Canonique `TimelineEventType` |
|---|---|
| `note`, `comment` | `note` |
| `status_change`, `case_status_changed` | `status_change` |
| `doc_request`, `document_request` | `document_request` |
| `doc_upload`, `document_uploaded` | `document_uploaded` |
| `doc_validate`, `document_validated`, `document_approved` | `document_validated` |
| `doc_reject`, `document_rejected` | `document_rejected` |
| `submitted`, `submission` | `submission` |
| `decision`, `approved`, `rejected` | `decision` |
| `call`, `phone` | `call` |
| `email`, `mail` | `email` |
| **autres** | `note` (fallback) + `legacyAction` conservé en champ |

### F.4 Travel

| Legacy | `TravelRequestStatus` |
|---|---|
| `new`, `requested` | `requested` |
| `reviewing` | `in_review` |
| `quoted` | `quoted` |
| `confirmed` | `confirmed` |
| `cancelled` | `cancelled` |
| `rejected` | `cancelled` *(pas de `rejected` canonique)* |
| `completed` | `confirmed` *(closed-with-success)* |

---

## G. Stratégie d'IDs déterministes

| Cible | Convention ID |
|---|---|
| `dossiers/{id}` | `legacy_<caseId>` *(legacy)* / `audit_<auditDraftId>` *(premium déjà existant)* |
| `dossiers/{id}/documents/{docId}` | `legacy_doc_<sygepecClientDocumentId>` |
| `dossiers/{id}/timeline/{evtId}` | `legacy_evt_<sygepecTimelineId>` |
| `dossiers/{id}/auditResponses/{respId}` | `legacy_audit_<sygepecAuditResponsesId>` |
| `checklists/{id}` | `checklist_<dossierId>` |
| `serviceRequests/{id}` | `legacy_train_<sygepecTrainingReferralsId>` |
| `travelBookings/{id}` | `legacy_travel_<sygepecFlightRequestsId>` ou `legacy_travel_<sygepecAccommodationRequestsId>` |
| `users/{uid}/profile/main` | path fixe |
| `auditLogs/{id}` | auto-id (append-only, pas de dédup nécessaire) |

**Garantie idempotence** : tout `--apply` ré-exécuté avec le même `--batchId` doit produire `0 create / 0 update` après une première passe réussie.

---

## H. User bootstrap / reconciliation (étape obligatoire **avant** toute migration)

> Sans `users/{uid}` : `sameTenant()` échoue dans les rules → toutes les écritures canoniques seront refusées.

### H.1 Sources d'UIDs à scanner

```
sygepecClientProfiles.id (= uid)
sygepecClientProfiles.userId / ownerUid
sygepecCases.userId / uid / ownerUid / createdByUid / assignedAgentUid
sygepecAuditResponses.userId / uid
sygepecClientDocuments.userId / uid / ownerUid
sygepecTrainingReferrals.uid / userId
sygepecFlightRequests.uid / userId
sygepecAccommodationRequests.uid / userId
sygepecTimeline.actorUid
+ Auth: listUsers() côté Admin SDK (pour détecter les Auth users orphelins de tout sygepec*)
```

### H.2 Algorithme bootstrap (dry-run par défaut)

Pour chaque uid détecté :

1. `users/{uid}` **existe** ?
   - **non** → planifier `create` avec :
     ```
     { uid, email (depuis Auth), displayName, tenantId: <détecté ou 'sygepec-main'>, role: 'client', roles: ['client'], createdAt: serverTimestamp(), source: 'phase4_bootstrap' }
     ```
   - **oui** → vérifier complétude :
     - `tenantId` absent ? → planifier `merge` `tenantId = <détecté ou 'sygepec-main'>`
     - `role` absent ET `roles` absent ? → planifier `merge` `role: 'client', roles: ['client']`
     - `role` ∈ `{super_admin, org_admin, agent, admin, staff, reviewer}` ? → **NE JAMAIS écraser** (log + skip)
     - `tenantId` déjà défini ? → **NE JAMAIS écraser** (log + skip ; remonter conflit si différent du tenant détecté)

### H.3 Détection du tenant

Ordre de priorité (premier non-null gagne) :
1. `sygepec*.tenantId`
2. `sygepec*.orgId`
3. `sygepec*.organizationId`
4. fallback : `'sygepec-main'` (= `defaultOrgId` de [`SygepecDataService`](../src/app/core/services/sygepec-data.service.ts))

### H.4 Garde-fous

- `merge: true` exclusivement (jamais de `set` brut)
- aucun `delete`
- aucun changement de `email`/`uid`
- log JSON par uid : `{ uid, action: 'create'|'merge'|'skip'|'conflict', reason, fieldsAdded, fieldsConserved }`

---

## I. Plan dry-run (lecture seule)

### I.1 État existant

- ✅ Script : [`scripts/migrate-legacy-collections.mjs`](../scripts/migrate-legacy-collections.mjs)
- ✅ Commande : `npm run migrate:dry-run` *(déjà câblée dans `package.json`)*
- ✅ Auth : `GOOGLE_APPLICATION_CREDENTIALS` ou `applicationDefault`
- ✅ `--apply` est **bloqué** explicitement (`process.exit(2)`) — bonne ceinture de sécurité

### I.2 Lacunes à combler en Phase 4A (sans toucher la logique d'écriture)

| Manque | À ajouter |
|---|---|
| Pagination | retirer `limit(500)`, paginer par 500 avec `startAfter()` pour avoir le **count exact** |
| Détection `alreadyMigrated` | lire la cible canonique correspondante et compter ceux avec `migrationSource: 'sygepec_legacy'` |
| Détection doublons | grouper par `(caseId + category)` pour documents, par `(uid + programSlug)` pour training, etc. |
| Bootstrap users | nouvelle section `inspectUserBootstrap()` qui agrège tous les UIDs et compare à `users/{uid}` |
| Rapport JSON local | `--report=./reports/migration-dryrun-YYYYMMDD-HHMM.json` (écriture **sur disque seulement**, pas Firestore) |
| Filtre tenant | `--tenant=sygepec-main` |
| Limite test | `--limit=10` pour tests à blanc |

### I.3 Sortie attendue (résumé console)

```
════════════════════════════════════════════════════════════════
Phase 4A — Migration DRY-RUN — projectId=sygepec-v4 — batchId=DRYRUN_<ts>
════════════════════════════════════════════════════════════════

[USER BOOTSTRAP]
  uids détectés       : 142
  users/{uid} présents:  98
  à créer             :  44
  à compléter         :  17
  conflits tenant     :   2
  rôles privilégiés conservés : 5

[sygepecClientProfiles → users/{uid}/profile/main]
  documents lus       : 98
  create prévus       : 44
  merge prévus        : 32
  skip (déjà migré)   : 22
  orphans             : 0
  warnings            : ...

[sygepecCases → dossiers]
  ...

────────────────────────────────────────────────────────────────
TOTAUX
  users à bootstrap   : 44
  dossiers à créer    : 211
  documents à créer   : 1483
  checklists à créer  : 198
  travelBookings      : 64
  serviceRequests     : 27
  conflits            : 6
  orphans             : 12
  warnings            : 31
  AUCUNE ÉCRITURE EFFECTUÉE
════════════════════════════════════════════════════════════════
```

### I.4 Commande proposée

```bash
# inchangée pour Phase 4A
npm run migrate:dry-run
# variantes futures (Phase 4A.2, dry-run uniquement)
npm run migrate:dry-run -- --collection=sygepecCases --tenant=sygepec-main --report=./reports/4a.json
npm run migrate:dry-run -- --bootstrap-only
```

---

## J. Apply contrôlé — **plan uniquement**

> ⚠️ Ne sera **jamais** exécuté sans validation manuelle écrite.

### J.1 Future commande

```bash
npm run migrate:apply -- \
  --batchId=20260520_1400 \
  --collection=sygepecCases \
  --tenant=sygepec-main \
  --confirm-token=<token-issu-du-dry-run>
```

### J.2 Garde-fous obligatoires

| # | Garde-fou |
|---|---|
| 1 | `--batchId` obligatoire et **non réutilisable** (vérification `auditLogs` côté script) |
| 2 | `--confirm-token` = hash sha256 du dernier rapport dry-run, valide 24 h |
| 3 | Confirmation interactive (`Are you sure? Type APPLY-<batchId>`) |
| 4 | Limite hard : `MAX_OPS_PER_BATCH = 500` par collection (sinon découper) |
| 5 | Idempotence : tout doc cible avec `migrationBatchId == <batchId>` est skipé |
| 6 | `merge: true` exclusivement, **jamais** `set` brut, **jamais** `delete` |
| 7 | `noneChanged(['tenantId', 'ownerUid', 'userId', 'createdByUid'])` côté script avant write |
| 8 | Stop on critical error (mismatch tenant, perte d'owner) |
| 9 | Chaque write canonique → entrée `auditLogs` `{kind:'migration', batchId, sourceColl, sourceId, targetColl, targetId, action}` |
| 10 | Rapport JSON local + upload best-effort à `migrationReports/{batchId}` |
| 11 | Backup Firestore export recommandé **avant** apply (commande `gcloud firestore export`) |
| 12 | **Aucune suppression** des docs `sygepec*` |

---

## K. Rollback / reconciliation

Firestore n'a pas de transaction de rollback multi-document → **stratégie logique** :

1. Tous les docs canoniques migrés portent `migrationBatchId` → requête `where('migrationBatchId', '==', X)` permet d'isoler un batch.
2. **Mode "rolled_back"** (préféré) : `merge` `migrationStatus: 'rolled_back', rolledBackAt: serverTimestamp()` sur les docs migrés du batch ; l'UI ignore les docs `rolled_back`.
3. **Mode "delete"** (exceptionnel, super-admin uniquement) : supprimer **uniquement** les docs créés par le batch (pas les docs pré-existants merged) ; nécessite un flag `--rollback-delete --batchId=X --confirm-token=...`.
4. Aucune restauration des `sygepec*` n'est nécessaire (ils ne sont pas touchés).
5. Reconciliation : `npm run migrate:reconcile -- --batchId=X` re-compare cible vs source et produit un diff sans écrire.

**Index requis pour rollback** :
```json
{ "collectionGroup": "<chaque cible>", "fields": [{"fieldPath": "migrationBatchId", "order": "ASCENDING"}] }
```

---

## L. Retrait progressif `SygepecDataService`

| Phase | Action | Critère de passage |
|---|---|---|
| **4B** | `admin-case-detail`, `admin-dashboard`, `admin-users` lisent **canonique uniquement** pour `dossiers/documents/checklists/timeline`. Façade `SygepecDataService` reste cible des écritures legacy. | Dry-run vert + 1 dossier de test migré et visible côté admin |
| **4C** | Migrer `sygepecTrainingReferrals`, `sygepecTravelReadiness`, `sygepecTimeline`. Vues client `/dashboard/training`, `/dashboard/case` lisent canonique. | Vue client validée |
| **4D** | Migrer `sygepecFlightRequests`, `sygepecAccommodationRequests` → `travelBookings`. Migrer support si applicable (`tickets/`). Concevoir modèle `leads/` canonique. | `/admin/travel`, `/client/travel` lisent canonique |
| **4E** | **Désactiver** les lectures legacy dans l'UI (flag `READ_LEGACY=false`). Garder les scripts d'audit legacy. Façade conserve les méthodes de lecture mais elles renvoient `null`/`[]` legacy. | Aucun appel legacy détecté en logs prod 14 jours |
| **4F** | Supprimer le **dead code** : méthodes inutilisées de `SygepecDataService`, modèles `sygepec.models.ts` non référencés. **Ne pas** supprimer la collection physique `sygepec*` ni les scripts d'audit. | Validation production + accord stakeholder |

> 🔒 **Tant que la Phase 4F n'est pas validée**, `SygepecDataService` et toutes les collections `sygepec*` restent **intouchables**.

---

## M. Recommandation `/start-audit` premium

État actuel ([`audit.routes.ts`](../src/app/features/audit/audit.routes.ts)) :
- `/start-audit` → `ImmigrationAssessmentFlowComponent` (legacy)
- `/start-audit/premium` → `AuditWizardPremiumPageComponent` (Phase 3 ✅)

### Plan progressif

| Étape | Changement | Garde-fou |
|---|---|---|
| **M.1 (Phase 4B)** | Conserver les deux routes. Ajouter une bannière sur la legacy : « Nouvelle version disponible → /start-audit/premium ». | aucun |
| **M.2 (Phase 4C)** | Inverser : `/start-audit` charge `AuditWizardPremiumPageComponent` ; legacy déplacée à `/start-audit/legacy`. Mettre à jour les 18 références `routerLink="/start-audit"` détectées (registre ci-dessous). | feature flag `systemSettings/auditPremiumDefault` (lecture autorisée par les rules pour tout user signé) |
| **M.3 (Phase 4D)** | Supprimer le draft persisté `localStorage.startAuditDraft` côté legacy si premium devenu défaut. Préserver la résumption (queryParam `?resume=1`). | tests E2E |
| **M.4 (Phase 4E)** | Désactiver `/start-audit/legacy` derrière un flag admin. | analytics : <1 % du trafic |
| **M.5 (Phase 4F)** | Supprimer `ImmigrationAssessmentFlowComponent` et son routing. | accord stakeholder |

**Ne PAS supprimer `immigration-assessment-flow.component.ts` avant validation production complète de la migration.**

### Références `routerLink="/start-audit"` à mettre à jour en M.2

```
src/app/features/client/pages/client-training-recommendations.component.ts:41
src/app/features/client/pages/client-service-requests.component.ts:121
src/app/features/client/pages/client-profile.component.ts:27, 50
src/app/features/client/pages/client-my-case.component.ts:74
src/app/features/client/pages/client-documents.component.ts:71, 106
src/app/features/auth/register.component.ts:227-228
src/app/features/auth/login.component.ts:235-236
src/app/features/public/pages/public-info-page.component.ts:76
src/app/features/immigration/pages/immigration-home.component.ts:52, 118
src/app/features/audit/premium/audit-wizard-premium-page.component.ts:152 (returnUrl)
src/app/features/audit/pages/immigration-assessment-flow.component.ts:621 (returnUrl)
src/app/app.routes.ts:41 (redirect 'audit')
```

---

## N. Risques

| # | Risque | Sévérité | Mitigation |
|---|---|---|---|
| R1 | `users/{uid}` manquant → toutes les writes canoniques refusées par les rules | 🔴 critique | Étape H obligatoire **avant** toute migration métier |
| R2 | Tenant mismatch entre `sygepecCases.tenantId` et `users/{uid}.tenantId` | 🟠 haute | Skip + log conflit en H.4 ; jamais d'auto-merge |
| R3 | Doublons dossiers (`legacy_<caseId>` ET `audit_<auditDraftId>` pour le même client) | 🟠 haute | Détection en B (`alreadyMigrated`) ; pas de fusion auto en Phase 4A |
| R4 | Perte de `priceUsd`/`carrier` legacy si écrasement | 🟡 moyenne | F.4 + règle « ne pas écraser un champ cible non-null » |
| R5 | `auditResponses.answers` (objet libre) contient des PII non normalisées | 🟡 moyenne | archivage tel quel sous `dossiers/{id}/auditResponses/legacy_*` ; pas de transformation |
| R6 | `--apply` lancé par erreur en CI | 🔴 critique | confirm-token + interactive prompt + `if process.env.CI` → refus automatique |
| R7 | Volumétrie : `>10 000` documents par collection | 🟡 moyenne | pagination + batches de 500 + sleep 200 ms |
| R8 | Storage URLs (`downloadUrl` Firebase) expirées ou révoquées | 🟡 moyenne | régénérer `getDownloadURL()` côté Admin SDK uniquement si null cible |
| R9 | Suppression accidentelle d'un rôle privilégié pendant le bootstrap | 🔴 critique | H.2 : `isPrivilegedRolePayload` → skip + log |
| R10 | Index Firestore manquants pour les nouvelles requêtes (cf. Lot M) | 🟢 faible | générer `firestore.indexes.json` en Lot M, déployer **avant** apply |

---

## O. Ordre recommandé Phase 4B / 4C / 4D

1. **4A.1** — Enrichir `migrate-legacy-collections.mjs` (pagination, alreadyMigrated, bootstrap section, JSON report). **Aucune écriture.**
2. **4A.2** — Exécuter `npm run migrate:dry-run` complet → revue manuelle du rapport.
3. **4B.1** — Implémenter `bootstrapUsers()` (dry-run + apply) — apply isolé, valide la santé des `users/{uid}` avant toute migration métier.
4. **4B.2** — Migrer `sygepecClientProfiles` → `users/{uid}/profile/main` (faible risque, écritures merge sur sous-doc).
5. **4B.3** — Migrer `sygepecCases` → `dossiers` + `sygepecAuditResponses` (lien direct).
6. **4B.4** — Migrer `sygepecDocumentChecklists` + `sygepecClientDocuments` (dépend de 4B.3).
7. **4C.1** — Migrer `sygepecTimeline` (append-only, faible risque).
8. **4C.2** — Migrer `sygepecTrainingReferrals` → `serviceRequests`.
9. **4C.3** — Migrer `sygepecTravelReadiness` (champ + sous-doc).
10. **4D.1** — Migrer `sygepecFlightRequests` + `sygepecAccommodationRequests` → `travelBookings`.
11. **4D.2** — Concevoir et migrer `sygepecLeads` → `leads` canonique.
12. **4E** — Bascule lecture canonique uniquement (flag).
13. **4F** — Cleanup dead code (uniquement après validation prod 30 jours).

---

## P. Tests obligatoires avant tout `--apply`

| # | Test | Mode |
|---|---|---|
| 1 | `npm run migrate:dry-run` complet sans erreur | dry-run |
| 2 | `bootstrap-only` dry-run produit 0 conflit non documenté | dry-run |
| 3 | Migration 1 user (uid de test) → `users/{uid}/profile/main` créé | apply scope=1 |
| 4 | Migration 1 dossier de test → `dossiers/legacy_<id>` créé avec tenantId/ownerUid | apply scope=1 |
| 5 | Migration 1 dossier + ses documents → sous-collection `documents/` peuplée | apply scope=1 |
| 6 | Migration 1 dossier + travel → `travelBookings` créé avec `flight`/`hotel` | apply scope=1 |
| 7 | Migration dossier sans tenantId → skip + warning, pas d'écriture | dry-run |
| 8 | Migration doublon (re-run même batch) → 0 ops | apply x2 |
| 9 | Migration orphan (sans owner détectable) → skip + warning | dry-run |
| 10 | Profile existant déjà rempli → merge prudent, aucun champ non-null écrasé | apply scope=1 |
| 11 | Vérification visuelle admin (`/admin/dashboard`, `/admin/users`, `/immigration/dossiers/<id>`) | manuel |
| 12 | Vérification visuelle client (`/dashboard`, `/dashboard/documents`) | manuel |
| 13 | Test rules : un client tente de modifier `tenantId` → refus | unit firestore-rules |
| 14 | `npm run build` vert (script et UI) | build |

---

## Q. Aucun changement destructif effectué en Phase 4A

| Action | État |
|---|---|
| Lecture Firestore | ❌ non exécutée dans ce plan (à faire via `npm run migrate:dry-run` quand souhaité) |
| Écriture Firestore | ❌ aucune |
| Suppression Firestore | ❌ aucune |
| Modification de `firestore.rules` | ❌ aucune |
| Modification de `SygepecDataService` | ❌ aucune |
| Modification du script `migrate-legacy-collections.mjs` | ❌ aucune (lacunes documentées en I.2 pour Phase 4A.1) |
| Suppression de collections `sygepec*` | ❌ aucune (interdit jusqu'à 4F) |
| Suppression de `ImmigrationAssessmentFlowComponent` | ❌ aucune (interdit avant validation prod) |
| Build | ✅ Lot J validé précédemment ; aucun nouveau code dans Phase 4A |

---

## R. Décisions ouvertes (à arbitrer avant Phase 4A.1)

1. **`audit_completed` → `in_review` ou `docs_required`** ? *(proposition : conditionnel sur l'état checklist — voir F.1)*
2. **Modèle canonique `leads/`** : à concevoir Phase 4D ou conserver legacy indéfiniment ?
3. **`tenantId` par défaut** : `'sygepec-main'` (depuis `SygepecDataService.defaultOrgId`) — confirmer ?
4. **Stratégie pour `sygepecCases.assignedAgentUid`** quand l'agent n'a pas de `users/{uid}` côté canonique : skip ou créer un user staff inactif ?
5. **`completed` → `closed` ou `approved`** ? *(proposition : `closed` car `approved` doit refléter une décision explicite ; `completed` legacy est ambigu)*

---

**Fin Phase 4A.** Aucun apply. Aucune écriture. Prêt pour revue stakeholder → Phase 4A.1 (enrichissement script dry-run).

---

## S. Phase 4A.1 — Script dry-run enrichi (LIVRÉ)

État : ✅ livré. Aucune écriture, aucune migration, aucun apply.

### S.1 Fichiers modifiés

| Fichier | Changement |
|---|---|
| [scripts/migrate-legacy-collections.mjs](../scripts/migrate-legacy-collections.mjs) | Réécriture complète : pagination, alreadyMigrated, user bootstrap, JSON report, safety rails, dryRunHash |
| [package.json](../package.json) | +3 scripts npm : `migrate:dry-run:help`, `migrate:dry-run:json`, `migrate:dry-run:bootstrap` |
| [.gitignore](../.gitignore) | Exclusion `/reports` |

### S.2 Options CLI

```
--help, -h              Affiche l'aide
--limit=N               Limite N docs/collection (0 = pagination complète)
--page-size=N           Taille de page Firestore (défaut 500)
--tenant=ID             Filtre tenantId (lecture)
--collection=NAME       Restreint à une collection legacy
--json                  Émet rapport JSON dans reports/ (timestamp auto)
--out=path              Chemin du rapport JSON (active --json)
--verbose, -v           Samples détaillés + payloads bootstrap
--bootstrap-only        Exécute uniquement la section User Bootstrap
--default-tenant=ID     Tenant fallback (défaut sygepec-main)
--concurrency=N         Concurrence lookups canonique (défaut 8)
```

### S.3 Safety rails (refusés avec exit code 2)

`--apply`, `--write`, `--commit`, `--delete`, `--force` → ABORT immédiat avec message :
> `Apply mode is disabled in Phase 4A.1. This script is dry-run only.`

Vérifié : 5/5 testés en local, tous retournent exit 2 avant toute initialisation Firestore.

### S.4 Logique pagination

- `orderBy('__name__').limit(pageSize).startAfter(lastDoc)` itéré jusqu'à snapshot vide ou `--limit` atteint.
- Filtre tenant : tente `where('tenantId', '==', X).orderBy('__name__')`. Fallback automatique scan complet si l'index manque (warning console, pas d'arrêt).
- Concurrence : pages bufferisées par 50 puis traitées en `pMap` à `--concurrency=8`.

### S.5 Détection alreadyMigrated

Pour chaque doc legacy, lookup de la cible canonique calculée par `targetIdFn` :

| Source | Cible vérifiée |
|---|---|
| `sygepecCases/{id}` | `dossiers/legacy_{id}` |
| `sygepecClientProfiles/{uid}` | `users/{uid}/profile/main` |
| `sygepecClientDocuments/{id}` | `dossiers/legacy_{caseId}/documents/legacy_doc_{id}` |
| `sygepecAuditResponses/{id}` | `dossiers/legacy_{caseId}/auditResponses/legacy_audit_{id}` |
| `sygepecDocumentChecklists/{id}` | `checklists/checklist_legacy_{caseId}` |
| `sygepecTimeline/{id}` | `dossiers/legacy_{caseId}/timeline/legacy_evt_{id}` |
| `sygepecTrainingReferrals/{id}` | `serviceRequests/legacy_train_{id}` |
| `sygepecTravelReadiness/{id}` | `dossiers/legacy_{caseId}/readiness/main` |
| `sygepecFlightRequests/{id}` | `travelBookings/legacy_travel_{id}` |
| `sygepecAccommodationRequests/{id}` | `travelBookings/legacy_travel_{id}` |
| `sygepecLeads/{id}` | n/a (canonique non défini → `noCanonicalTarget`) |

Décisions classifiées : `create | merge | skipAlreadyMigrated | conflict | orphan | missingUser | missingTenant | missingParentDossier | noCanonicalTarget`.

### S.6 User Bootstrap dry-run

Registre `UidRegistry` agrège tous les UIDs détectés (champs `OWNER_FIELDS = [uid, userId, ownerUid, createdByUid, actorUid]`) à travers les 10 collections.

Pour chaque uid : `checkExists('users/{uid}')` puis classification :

| Cas | Action proposée |
|---|---|
| `users/{uid}` absent | `proposedCreate` avec payload `{uid, userId, role:'client', roles:['client'], tenantId, orgId, status:'active', schemaVersion:1, source:'phase4_bootstrap'}` |
| `users/{uid}` présent + complet | `skipComplete` |
| `users/{uid}` présent + incomplet | `merge` (champs manquants uniquement) |
| `users/{uid}` présent + rôle privilégié + safe à compléter | `mergeSafeProtected` (jamais `role`/`roles`/`tenantId`) |
| `users/{uid}` présent + rôle privilégié + rien à ajouter safely | `skipProtected` |

Compteurs émis : `userDocMissing | userDocIncomplete | tenantMissing | roleMissing | protectedRoleDetected | tenantConflict | proposedCreate | proposedMerge | skipProtected`.

Payloads complets masqués sauf `--verbose`.

### S.7 Format JSON

Fichier : `reports/migration-dry-run-YYYYMMDD-HHMMSS.json`

```jsonc
{
  "generatedAt": "2026-05-09T...",
  "startedAt": "...",
  "durationMs": 12345,
  "projectId": "sygepec-v4",
  "mode": "dry-run",
  "phase": "4A.1",
  "filters": { "tenant": null, "collection": null, "limit": 0, "pageSize": 500, "bootstrapOnly": false },
  "summary": {
    "totalDocs": 0, "totalCreate": 0, "totalMerge": 0, "totalSkipAlready": 0,
    "totalOrphan": 0, "totalConflict": 0, "totalMissingUser": 0,
    "totalMissingTenant": 0, "totalMissingParent": 0, "totalErrors": 0,
    "usersToBootstrap": 0,
    "bootstrap": { "missing": 0, "incomplete": 0, "protected": 0 }
  },
  "perCollection": [ /* stats par collection */ ],
  "userBootstrap": { /* stats + samples */ },
  "mappings": { /* STATUS_REMAP_*, TIMELINE_TYPE_REMAP, PROTECTED_ROLES */ },
  "conflicts": [ /* tenantMismatch */ ],
  "orphans":   [ /* { legacy, count } */ ],
  "warnings":  [ /* warnings collectés */ ],
  "errors":    [ /* erreurs script */ ],
  "nextRecommendedActions": [ /* checklist priorisée */ ],
  "dryRunHash": "<sha256 stable des chiffres clés>",
  "confirmTokenHint": "apply-<12 first chars>-YYYY-MM-DD"
}
```

### S.8 dryRunHash + confirmTokenHint (préparation Phase 4B+)

`dryRunHash` = sha256 stable de `{ projectId, filters, summary, perCollection.actions/distribution, userBootstrap chiffres clés }`. Exclut samples/timestamps pour reproductibilité.

`confirmTokenHint` = `apply-<hash[0:12]>-<YYYY-MM-DD>` à conserver. Le futur script apply (Phase 4B+) exigera `--confirm-token=<hint>` issu d'un dry-run datant de moins de 24 h.

**Aucun apply implémenté en 4A.1.** Le script refuse `--apply` (exit 2).

### S.9 Commandes testées

| Commande | Résultat |
|---|---|
| `node scripts/migrate-legacy-collections.mjs --help` | ✅ Affiche aide complète, exit 0 |
| `node scripts/migrate-legacy-collections.mjs --apply` | ✅ ABORT exit 2 |
| `node scripts/migrate-legacy-collections.mjs --write` | ✅ ABORT exit 2 |
| `node scripts/migrate-legacy-collections.mjs --commit` | ✅ ABORT exit 2 |
| `node scripts/migrate-legacy-collections.mjs --delete` | ✅ ABORT exit 2 |
| `node scripts/migrate-legacy-collections.mjs --force` | ✅ ABORT exit 2 |
| `node scripts/migrate-legacy-collections.mjs --limit=5` | ✅ ABORT propre si firebase-admin absent (exit 2 + message clair) |

### S.10 Pré-requis runtime (à valider hors scope 4A.1)

- `firebase-admin` non installé localement (le script affiche un message d'install clair). Pour exécution réelle :
  ```powershell
  npm install --no-save firebase-admin
  $env:GOOGLE_APPLICATION_CREDENTIALS="path/service-account.json"
  npm run migrate:dry-run -- --limit=20
  ```
- Aucun service account commité (cf. `.gitignore` : `scripts/service-account.json`, `scripts/*-service-account.json`).
- `reports/` ignoré par git.

### S.11 Confirmation finale

✅ Aucune écriture Firestore.
✅ Aucune suppression.
✅ Aucune modification de `firestore.rules`, `SygepecDataService`, ni du code Angular.
✅ Safety rails actifs (5 flags refusés).
✅ Script sûr en production : refuse écriture par défaut.
✅ Le rapport JSON et le dryRunHash préparent la Phase 4B (apply contrôlé) sans l'activer.

