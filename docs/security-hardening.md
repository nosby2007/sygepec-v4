# Security Hardening MVP -> Enterprise (Bloc 1)

## Portee
Ce document couvre le hardening effectue sur Firestore, Storage, guards Angular, contexte auth, et configuration hosting pour une preparation production.

## Modifications appliquees

### 1) Firestore Rules
Fichier: `firestore.rules`

- Passage d'un modele simplifie (`admin` unique) vers un RBAC enterprise compatible:
  - Roles cibles: `super_admin`, `org_admin`, `agent`, `client`
  - Compatibilite legacy: `superAdmin`, `orgAdmin`, `admin`, `staff`, `viewer`
- Ajout de helpers de securite:
  - verification session
  - resolution role/roles
  - detection super admin (claims + document user)
  - verification tenant (`tenantId/orgId/organizationId`)
  - verification ownership (`userId/ownerUid/createdByUid`)
- Durcissement des collections critiques:
  - `users`, `organizations`, `orgMembers`
  - `dossiers` + sous-collections `documents`, `timeline`, `tasks`
  - `travelBookings`, `courses`, `liveSessions`, `enrollments`
  - `tickets`, `payments`, `auditLogs`, `mail`
- Ajout de compatibilite securisee pour collections legacy utilisees par l'app (`sygepec*`).
- Suppression du fallback permissif admin global; fallback final = deny all.

### 2) Storage Rules
Fichier: `storage.rules`

- Remplacement du deny-all par un modele strict et operationnel.
- Nouveau chemin securise supporte en ecriture:
  - `tenants/{tenantId}/users/{uid}/dossiers/{dossierId}/documents/{docId}/{fileName}`
- Controle des acces base sur:
  - role
  - tenant
  - ownership dossier
- Limite taille upload ajoutee: 15 MB
- Ancien chemin conserve en lecture seule pour compatibilite:
  - `tenants/{tenantId}/dossiers/{dossierId}/documents/{docId}/{fileName}`

### 3) Angular Guards / Auth Context
Fichiers:
- `src/app/core/auth/auth-context.service.ts`
- `src/app/core/guards/org.guard.ts`
- `src/app/features/admin/admin.guards.ts`
- `src/app/core/auth/auth-state.service.ts`

Actions:
- normalisation role + roles
- ajout `isOrgMember` fiable
- `orgGuard` corrige (loading non bloquant, super admin bypass)
- `adminGuard`/`orgAdminGuard` alignes au RBAC enterprise et fallback legacy
- profil user initialise a l'inscription avec role client minimal (`client`)

### 4) Upload path securise cote client
Fichier: `src/app/features/immigration/data/storage.service.ts`

- suppression du fallback `public`
- tenant obligatoire
- utilisateur authentifie obligatoire
- generation du chemin avec segment `users/{uid}`

### 5) Hosting go-live
Fichier: `firebase.json`

- `hosting.public` aligne sur le build Angular:
  - `dist/sygepec-V4/browser`

## Matrice de permissions (resume)

| Role | Scope | Lecture donnees tenant | Ecriture donnees tenant | Admin plateforme |
|---|---|---|---|---|
| super_admin | global | Oui | Oui | Oui |
| org_admin | tenant | Oui | Oui | Non |
| agent | tenant | Oui | Oui (selon collection) | Non |
| client | propre donnee + tenant borne | Oui (owner + tenant) | Limite (owner-safe) | Non |

## Risques residuels

1. Le controle le plus fort reste a faire via Custom Claims Firebase (source d'autorite server-side).
2. Certaines collections legacy `sygepec*` sont conservees pour compatibilite; migration schema recommandee.
3. Les regles Firestore ne remplacent pas des validations metier server-side (Cloud Functions) pour transitions d'etat sensibles.
4. Le fallback role legacy est volontairement temporaire pour eviter rupture de prod.

## Safeguards backend recommandes (phase suivante)

1. Emettre les roles via custom claims et retirer progressivement les roles critiques du document `users`.
2. Implementer des Cloud Functions pour transitions critiques:
   - validation/rejet documentaire
   - decisions dossier
   - attribution d'agents
3. Centraliser audit trail immutable pour actions admin.
4. Ajouter tests automatiques de regles (Emulator Suite) dans CI/CD.

## Validation effectuee

- Build Angular: OK (`npm run build`)
- Output: `dist/sygepec-V4`
