#!/usr/bin/env node
/**
 * SYGEPEC — Phase 4A.1 — Migration legacy → canonical (DRY-RUN ONLY)
 *
 * Lit les anciennes collections sygepec*, mappe vers le schéma canonique,
 * détecte alreadyMigrated / orphans / conflicts / users à bootstrap.
 * AUCUNE écriture, AUCUNE suppression. Refuse explicitement --apply/--write/--commit/--delete.
 *
 * Usage minimal :
 *   npm run migrate:dry-run
 *   npm run migrate:dry-run -- --help
 *   npm run migrate:dry-run -- --limit=20
 *   npm run migrate:dry-run -- --tenant=sygepec-main
 *   npm run migrate:dry-run -- --collection=sygepecCases
 *   npm run migrate:dry-run -- --json
 *   npm run migrate:dry-run -- --out=reports/test.json
 *   npm run migrate:dry-run -- --bootstrap-only
 *   npm run migrate:dry-run -- --verbose
 *
 * Auth : GOOGLE_APPLICATION_CREDENTIALS=<path> ou applicationDefault (Cloud Shell).
 * Project : FIREBASE_PROJECT_ID (défaut 'sygepec-v4').
 */

import process from 'node:process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

// =====================================================================
// 0. CLI parsing + safety rails (BEFORE any Firestore import)
// =====================================================================

const RAW_ARGS = process.argv.slice(2);

function getFlag(name) {
  return RAW_ARGS.includes(`--${name}`);
}
function getOpt(name, def = null) {
  const hit = RAW_ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

if (getFlag('help') || getFlag('h')) {
  printHelp();
  process.exit(0);
}

// === Safety rails — refuse toute écriture =============================
const FORBIDDEN = ['apply', 'write', 'commit', 'delete', 'force'];
for (const f of FORBIDDEN) {
  if (getFlag(f)) {
    console.error(`\n[ABORT] --${f} is disabled in Phase 4A.1. This script is dry-run only.\n`);
    console.error('        No write / no merge / no delete is performed.');
    console.error('        Apply will be enabled in a future phase under explicit validation.\n');
    process.exit(2);
  }
}

const CFG = {
  dryRun: true,
  limit: parseInt(getOpt('limit', '0'), 10) || 0, // 0 = no per-collection cap
  pageSize: parseInt(getOpt('page-size', '500'), 10) || 500,
  tenant: getOpt('tenant', null),
  filterCol: getOpt('collection', null),
  emitJson: getFlag('json') || !!getOpt('out', null),
  outPath: getOpt('out', null),
  verbose: getFlag('verbose') || getFlag('v'),
  bootstrapOnly: getFlag('bootstrap-only'),
  projectId: process.env.FIREBASE_PROJECT_ID || 'sygepec-v4',
  defaultTenantId: getOpt('default-tenant', 'sygepec-main'),
  concurrency: parseInt(getOpt('concurrency', '8'), 10) || 8,
};

if (CFG.emitJson && !CFG.outPath) {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  CFG.outPath = `reports/migration-dry-run-${ts}.json`;
}

function printHelp() {
  console.log(`
SYGEPEC — Phase 4A.1 — migrate-legacy-collections.mjs (DRY-RUN ONLY)

Usage:
  node scripts/migrate-legacy-collections.mjs [options]

Options:
  --help, -h              Affiche cette aide
  --limit=N               Limite N docs par collection (0 = pagination complète)
  --page-size=N           Taille de page Firestore (défaut 500)
  --tenant=ID             Filtre tenantId (lecture seule, n'écrit rien)
  --collection=NAME       Restreint à une seule collection legacy
  --json                  Émet un rapport JSON dans reports/ (timestamp auto)
  --out=path              Chemin du rapport JSON (active --json)
  --verbose, -v           Affiche samples détaillés et payloads bootstrap proposés
  --bootstrap-only        N'exécute que la section User Bootstrap
  --default-tenant=ID     Tenant fallback proposé pour bootstrap (défaut sygepec-main)
  --concurrency=N         Concurrence des lookups canonique (défaut 8)

Safety rails (refusés) :
  --apply, --write, --commit, --delete, --force
    → script ne fait QUE de la lecture. Tout flag d'écriture provoque ABORT.

Auth :
  GOOGLE_APPLICATION_CREDENTIALS=<path/service-account.json>
  ou Cloud Shell / applicationDefault.

Exemples :
  npm run migrate:dry-run -- --help
  npm run migrate:dry-run -- --limit=20
  npm run migrate:dry-run -- --collection=sygepecCases --verbose
  npm run migrate:dry-run -- --json
  npm run migrate:dry-run -- --bootstrap-only --out=reports/bootstrap.json
`);
}

// =====================================================================
// 1. Mapping legacy → canonical (Phase 4A spec, sections C/F/G)
// =====================================================================

const STATUS_REMAP_DOSSIER = {
  new: 'new',
  audit_completed: 'in_review', // conditionnel : voir Phase 4A §F.1
  docs_required: 'docs_required',
  documents_required: 'docs_required',
  submitted: 'submitted',
  under_review: 'in_review',
  review: 'in_review',
  approved: 'approved',
  rejected: 'rejected',
  completed: 'closed',
  closed: 'closed',
  on_hold: 'in_review',
  cancelled: 'closed',
  training_required: 'in_review',
  travel_prep: 'in_review',
};

const STATUS_REMAP_DOCUMENT = {
  pending: 'requested',
  requested: 'requested',
  submitted: 'uploaded',
  uploaded: 'uploaded',
  approved: 'validated',
  validated: 'validated',
  rejected: 'rejected',
  correction_required: 'rejected',
  expired: 'rejected',
};

const STATUS_REMAP_TRAVEL = {
  new: 'requested',
  requested: 'requested',
  reviewing: 'in_review',
  quoted: 'quoted',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
  rejected: 'cancelled',
  completed: 'confirmed',
};

const TIMELINE_TYPE_REMAP = {
  note: 'note',
  comment: 'note',
  status_change: 'status_change',
  case_status_changed: 'status_change',
  doc_request: 'document_request',
  document_request: 'document_request',
  doc_upload: 'document_uploaded',
  document_uploaded: 'document_uploaded',
  doc_validate: 'document_validated',
  document_validated: 'document_validated',
  document_approved: 'document_validated',
  doc_reject: 'document_rejected',
  document_rejected: 'document_rejected',
  submitted: 'submission',
  submission: 'submission',
  decision: 'decision',
  approved: 'decision',
  rejected: 'decision',
  call: 'call',
  phone: 'call',
  email: 'email',
  mail: 'email',
};

const PROTECTED_ROLES = new Set([
  'super_admin',
  'superAdmin',
  'org_admin',
  'orgAdmin',
  'agent',
  'admin',
  'staff',
  'reviewer',
]);

const OWNER_FIELDS = ['uid', 'userId', 'ownerUid', 'createdByUid', 'actorUid'];
const TENANT_FIELDS = ['tenantId', 'orgId', 'organizationId'];
const CASE_FIELDS = ['caseId', 'dossierId'];

const COLLECTIONS = [
  {
    legacy: 'sygepecLeads',
    target: 'leads (canonique non défini — Phase 4D)',
    targetIdFn: () => null, // no canonical yet
    requiredFields: ['email'],
    canonicalMap: {
      ownerUid: ['uid', 'userId', 'createdByUid'],
      tenantId: TENANT_FIELDS,
      email: ['email'],
      fullName: ['fullName', 'name'],
      status: ['status'],
    },
  },
  {
    legacy: 'sygepecClientProfiles',
    target: 'users/{uid}/profile/main',
    targetIdFn: (id, _data) => ({ path: `users/${id}/profile/main` }),
    requiredFields: ['uid'],
    canonicalMap: {
      uid: ['uid', 'userId'],
      fullName: ['fullName'],
      nationality: ['nationality'],
      destinationCountry: ['destinationCountry', 'targetCountry'],
      immigrationGoal: ['immigrationGoal', 'goal'],
      preferredLanguage: ['preferredLanguage', 'lang'],
      tenantId: TENANT_FIELDS,
    },
  },
  {
    legacy: 'sygepecCases',
    target: 'dossiers/legacy_{id}',
    targetIdFn: (id) => ({ path: `dossiers/legacy_${id}` }),
    requiredFields: ['uid'],
    statusRemap: STATUS_REMAP_DOSSIER,
    canonicalMap: {
      ownerUid: OWNER_FIELDS,
      tenantId: TENANT_FIELDS,
      kind: ['kind', 'type'],
      status: ['status'],
      dossierNumber: ['caseNumber', 'reference', 'dossierNumber'],
      readinessScore: ['readinessScore', 'score'],
      assignedAgentUid: ['assignedAgentUid', 'agentUid'],
    },
  },
  {
    legacy: 'sygepecAuditResponses',
    target: 'dossiers/legacy_{caseId}/auditResponses/legacy_audit_{id}',
    targetIdFn: (id, data) => {
      const cid = data.caseId || data.dossierId;
      if (!cid) return null;
      return { path: `dossiers/legacy_${cid}/auditResponses/legacy_audit_${id}`, parentDossier: `legacy_${cid}` };
    },
    requiredFields: ['caseId'],
    canonicalMap: {
      dossierId: CASE_FIELDS,
      ownerUid: ['uid', 'userId'],
      answers: ['answers', 'responses'],
    },
  },
  {
    legacy: 'sygepecDocumentChecklists',
    target: 'checklists/checklist_legacy_{caseId}',
    targetIdFn: (id, data) => {
      const cid = data.caseId || data.dossierId;
      if (!cid) return null;
      return { path: `checklists/checklist_legacy_${cid}` };
    },
    requiredFields: ['caseId'],
    canonicalMap: {
      dossierId: CASE_FIELDS,
      items: ['items'],
      total: ['total'],
      completed: ['completed', 'done'],
    },
  },
  {
    legacy: 'sygepecTimeline',
    target: 'dossiers/legacy_{caseId}/timeline/legacy_evt_{id}',
    targetIdFn: (id, data) => {
      const cid = data.caseId;
      if (!cid) return null;
      return { path: `dossiers/legacy_${cid}/timeline/legacy_evt_${id}`, parentDossier: `legacy_${cid}` };
    },
    requiredFields: ['caseId'],
    timelineRemap: TIMELINE_TYPE_REMAP,
    canonicalMap: {
      targetId: ['caseId'],
      type: ['action', 'event'],
      message: ['message', 'description'],
      actorUid: ['actorUid'],
    },
  },
  {
    legacy: 'sygepecClientDocuments',
    target: 'dossiers/legacy_{caseId}/documents/legacy_doc_{id}',
    targetIdFn: (id, data) => {
      const cid = data.caseId || data.dossierId;
      if (!cid) return null;
      return { path: `dossiers/legacy_${cid}/documents/legacy_doc_${id}`, parentDossier: `legacy_${cid}` };
    },
    requiredFields: ['caseId'],
    statusRemap: STATUS_REMAP_DOCUMENT,
    canonicalMap: {
      dossierId: CASE_FIELDS,
      ownerUid: ['uid', 'userId', 'ownerUid'],
      type: ['category', 'type'],
      title: ['label', 'name'],
      storagePath: ['storagePath', 'path'],
      status: ['status'],
    },
  },
  {
    legacy: 'sygepecTrainingReferrals',
    target: 'serviceRequests/legacy_train_{id}',
    targetIdFn: (id) => ({ path: `serviceRequests/legacy_train_${id}` }),
    requiredFields: ['uid'],
    canonicalMap: {
      ownerUid: ['uid', 'userId'],
      tenantId: TENANT_FIELDS,
      programSlug: ['programSlug', 'program'],
      status: ['status'],
    },
  },
  {
    legacy: 'sygepecTravelReadiness',
    target: 'dossiers/legacy_{caseId}/readiness/main',
    targetIdFn: (_id, data) => {
      const cid = data.caseId;
      if (!cid) return null;
      return { path: `dossiers/legacy_${cid}/readiness/main`, parentDossier: `legacy_${cid}` };
    },
    requiredFields: ['caseId'],
    canonicalMap: {
      dossierId: ['caseId'],
      readinessScore: ['score', 'readinessScore'],
    },
  },
  {
    legacy: 'sygepecFlightRequests',
    target: 'travelBookings/legacy_travel_{id}',
    targetIdFn: (id) => ({ path: `travelBookings/legacy_travel_${id}` }),
    requiredFields: ['uid'],
    statusRemap: STATUS_REMAP_TRAVEL,
    canonicalMap: {
      ownerUid: ['uid', 'userId'],
      tenantId: TENANT_FIELDS,
      from: ['from', 'departure'],
      to: ['to', 'destination'],
      status: ['status'],
    },
  },
  {
    legacy: 'sygepecAccommodationRequests',
    target: 'travelBookings/legacy_travel_{id}',
    targetIdFn: (id) => ({ path: `travelBookings/legacy_travel_${id}` }),
    requiredFields: ['uid'],
    statusRemap: STATUS_REMAP_TRAVEL,
    canonicalMap: {
      ownerUid: ['uid', 'userId'],
      tenantId: TENANT_FIELDS,
      city: ['city'],
      checkIn: ['checkIn'],
      checkOut: ['checkOut'],
      status: ['status'],
    },
  },
];

// =====================================================================
// 2. Lazy Firebase Admin init (after CLI validation)
// =====================================================================

let db = null;

async function initFirestore() {
  let admin;
  try {
    admin = await import('firebase-admin/app');
  } catch (err) {
    console.error('\n[ABORT] firebase-admin n\'est pas installé.');
    console.error('        Installer avec : npm install --no-save firebase-admin');
    console.error('        ou installer en devDependency dédiée hors de ce script.\n');
    console.error(`        détail : ${err.message}`);
    process.exit(2);
  }
  const { initializeApp, applicationDefault, cert, getApps } = admin;
  const { getFirestore } = await import('firebase-admin/firestore');

  if (getApps().length === 0) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    let credential;
    if (credPath && existsSync(credPath)) {
      credential = cert(JSON.parse(readFileSync(credPath, 'utf-8')));
    } else {
      try {
        credential = applicationDefault();
      } catch {
        console.error('\n[ABORT] Pas de credential Firebase Admin.');
        console.error('        Définir GOOGLE_APPLICATION_CREDENTIALS=<path/service-account.json>\n');
        process.exit(2);
      }
    }
    initializeApp({ credential, projectId: CFG.projectId });
  }
  db = getFirestore();
}

// =====================================================================
// 3. Helpers
// =====================================================================

function pickFirst(doc, candidates) {
  for (const k of candidates) {
    const v = doc?.[k];
    if (v !== undefined && v !== null && v !== '') return { source: k, value: v };
  }
  return null;
}

function detectTenant(data) {
  const hit = pickFirst(data, TENANT_FIELDS);
  return hit ? String(hit.value) : null;
}

function detectOwner(data) {
  const hit = pickFirst(data, OWNER_FIELDS);
  return hit ? String(hit.value) : null;
}

function safeSample(value, max = 60) {
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return '(unserializable)';
  }
}

async function pMap(items, mapper, concurrency = 8) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await mapper(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function* paginate(collectionName, { tenantFilter = null, hardLimit = 0, pageSize = 500 } = {}) {
  let q = db.collection(collectionName).orderBy('__name__').limit(pageSize);
  if (tenantFilter) {
    // tente tenantId puis orgId — Firestore ne supporte pas where('any of these', '==', x)
    // on essaie d'abord tenantId ; si la coll n'a pas de tenantId on retombera sur scan complet
    q = db.collection(collectionName).where('tenantId', '==', tenantFilter).orderBy('__name__').limit(pageSize);
  }
  let total = 0;
  let last = null;
  while (true) {
    let curr = q;
    if (last) curr = curr.startAfter(last);
    let snap;
    try {
      snap = await curr.get();
    } catch (err) {
      // fallback : si tenantFilter casse l'orderBy (champ absent), retry sans tenant
      if (tenantFilter && /requires an index|Order by/i.test(err.message)) {
        console.warn(`  [warn] ${collectionName}: index manquant pour tenant filter, fallback scan complet`);
        yield* paginate(collectionName, { tenantFilter: null, hardLimit, pageSize });
        return;
      }
      throw err;
    }
    if (snap.empty) return;
    for (const d of snap.docs) {
      yield d;
      total++;
      if (hardLimit > 0 && total >= hardLimit) return;
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) return;
  }
}

async function checkExists(path) {
  try {
    const segs = path.split('/');
    let ref = db;
    for (let i = 0; i < segs.length; i += 2) {
      ref = ref.collection(segs[i]);
      if (segs[i + 1]) ref = ref.doc(segs[i + 1]);
    }
    const snap = await ref.get();
    if (!snap.exists) return { exists: false };
    const data = snap.data() || {};
    return {
      exists: true,
      migrationSource: data.migrationSource || null,
      migrationBatchId: data.migrationBatchId || null,
      tenantId: data.tenantId || null,
      ownerUid: data.ownerUid || data.userId || data.uid || null,
      data,
    };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

// =====================================================================
// 4. Per-collection inspection
// =====================================================================

async function inspectCollection(col, uidRegistry) {
  const stats = {
    legacy: col.legacy,
    target: col.target,
    documentsRead: 0,
    statusDistribution: {},
    statusUnmapped: {},
    timelineUnmapped: {},
    actions: {
      create: 0,
      merge: 0,
      skipAlreadyMigrated: 0,
      conflict: 0,
      orphan: 0,
      missingUser: 0,
      missingTenant: 0,
      missingParentDossier: 0,
      noCanonicalTarget: 0,
    },
    samples: [],
    warnings: [],
    errors: [],
  };

  let pageBuf = [];
  const FLUSH = 50; // process by chunks for concurrency

  async function flush() {
    if (pageBuf.length === 0) return;
    const items = pageBuf;
    pageBuf = [];
    await pMap(
      items,
      async ({ id, data }) => {
        await processDoc(id, data);
      },
      CFG.concurrency,
    );
  }

  async function processDoc(id, data) {
    stats.documentsRead++;

    // status distribution
    if (data.status) {
      stats.statusDistribution[data.status] = (stats.statusDistribution[data.status] || 0) + 1;
      if (col.statusRemap && !col.statusRemap[data.status]) {
        stats.statusUnmapped[data.status] = (stats.statusUnmapped[data.status] || 0) + 1;
      }
    }
    if (col.timelineRemap) {
      const t = data.action || data.event;
      if (t && !col.timelineRemap[t]) {
        stats.timelineUnmapped[t] = (stats.timelineUnmapped[t] || 0) + 1;
      }
    }

    // owner / tenant
    const owner = detectOwner(data) || (col.legacy === 'sygepecClientProfiles' ? id : null);
    const tenant = detectTenant(data);

    if (owner) {
      uidRegistry.add(owner, { sourceColl: col.legacy, sourceId: id, tenantHint: tenant });
    }

    if (!owner) stats.actions.orphan++;
    if (!tenant) stats.actions.missingTenant++;

    // canonical target
    const tgt = col.targetIdFn ? col.targetIdFn(id, data) : null;
    if (!tgt) {
      stats.actions.noCanonicalTarget++;
      maybeSample(id, data, { decision: 'noCanonicalTarget' });
      return;
    }

    // parent dossier check
    if (tgt.parentDossier) {
      const parent = await checkExists(`dossiers/${tgt.parentDossier}`);
      if (!parent.exists) {
        stats.actions.missingParentDossier++;
        maybeSample(id, data, { decision: 'missingParentDossier', parent: tgt.parentDossier });
        return;
      }
    }

    // alreadyMigrated check
    const tgtState = await checkExists(tgt.path);
    let decision = 'create';
    if (tgtState.exists) {
      if (tgtState.migrationSource === 'sygepec_legacy') {
        decision = 'skipAlreadyMigrated';
        stats.actions.skipAlreadyMigrated++;
      } else {
        decision = 'merge';
        stats.actions.merge++;
        // tenant conflict check
        if (tenant && tgtState.tenantId && tenant !== tgtState.tenantId) {
          stats.actions.conflict++;
          stats.warnings.push({
            type: 'tenantMismatch',
            sourceColl: col.legacy,
            sourceId: id,
            legacyTenant: tenant,
            targetTenant: tgtState.tenantId,
            targetPath: tgt.path,
          });
        }
      }
    } else {
      stats.actions.create++;
      // missing user check (R1 critique)
      if (owner) {
        const userDoc = await checkExists(`users/${owner}`);
        if (!userDoc.exists) {
          stats.actions.missingUser++;
          uidRegistry.markBlocking(owner);
        }
      }
    }

    maybeSample(id, data, { decision, targetPath: tgt.path, owner, tenant });
  }

  function maybeSample(id, data, extra) {
    const cap = CFG.verbose ? 8 : 3;
    if (stats.samples.length >= cap) return;
    const s = { id, ...extra };
    for (const [canonical, candidates] of Object.entries(col.canonicalMap)) {
      const hit = pickFirst(data, candidates);
      s[canonical] = hit ? `${hit.source}=${safeSample(hit.value)}` : '(absent)';
    }
    stats.samples.push(s);
  }

  try {
    for await (const d of paginate(col.legacy, {
      tenantFilter: CFG.tenant,
      hardLimit: CFG.limit,
      pageSize: CFG.pageSize,
    })) {
      pageBuf.push({ id: d.id, data: d.data() });
      if (pageBuf.length >= FLUSH) await flush();
    }
    await flush();
  } catch (err) {
    stats.errors.push(err.message);
  }
  return stats;
}

// =====================================================================
// 5. User Bootstrap dry-run
// =====================================================================

class UidRegistry {
  constructor() {
    this.map = new Map(); // uid -> { sources: [], tenantHints: Set, blocking: bool }
  }
  add(uid, { sourceColl, sourceId, tenantHint }) {
    if (!uid) return;
    let entry = this.map.get(uid);
    if (!entry) {
      entry = { sources: [], tenantHints: new Set(), blocking: false };
      this.map.set(uid, entry);
    }
    if (entry.sources.length < 5) entry.sources.push(`${sourceColl}/${sourceId}`);
    if (tenantHint) entry.tenantHints.add(tenantHint);
  }
  markBlocking(uid) {
    const e = this.map.get(uid);
    if (e) e.blocking = true;
  }
  size() {
    return this.map.size;
  }
}

async function inspectBootstrap(uidRegistry) {
  const out = {
    uidsDetected: uidRegistry.size(),
    userDocPresent: 0,
    userDocMissing: 0,
    userDocIncomplete: 0,
    tenantMissing: 0,
    roleMissing: 0,
    protectedRoleDetected: 0,
    tenantConflict: 0,
    proposedCreate: 0,
    proposedMerge: 0,
    skipProtected: 0,
    samples: [],
  };

  const uids = [...uidRegistry.map.keys()];
  await pMap(
    uids,
    async (uid) => {
      const entry = uidRegistry.map.get(uid);
      const detectedTenant =
        [...entry.tenantHints][0] || CFG.defaultTenantId;

      const u = await checkExists(`users/${uid}`);
      let action = null;
      let proposedPayload = null;
      let conserved = [];
      let added = [];

      if (!u.exists) {
        out.userDocMissing++;
        action = 'create';
        out.proposedCreate++;
        proposedPayload = {
          uid,
          userId: uid,
          role: 'client',
          roles: ['client'],
          tenantId: detectedTenant,
          orgId: detectedTenant,
          status: 'active',
          schemaVersion: 1,
          source: 'phase4_bootstrap',
        };
      } else {
        out.userDocPresent++;
        const data = u.data || {};
        const isProtected =
          PROTECTED_ROLES.has(data.role) ||
          (Array.isArray(data.roles) && data.roles.some((r) => PROTECTED_ROLES.has(r)));

        if (isProtected) out.protectedRoleDetected++;

        const missing = {};
        if (!data.tenantId && !data.orgId) {
          missing.tenantId = detectedTenant;
          missing.orgId = detectedTenant;
          out.tenantMissing++;
        }
        if (!data.role && !(Array.isArray(data.roles) && data.roles.length)) {
          missing.role = 'client';
          missing.roles = ['client'];
          out.roleMissing++;
        }
        if (!data.uid) missing.uid = uid;
        if (!data.userId) missing.userId = uid;
        if (!data.status) missing.status = 'active';
        if (!data.schemaVersion) missing.schemaVersion = 1;

        // tenant conflict
        if (data.tenantId && entry.tenantHints.size && !entry.tenantHints.has(data.tenantId)) {
          out.tenantConflict++;
        }

        if (Object.keys(missing).length === 0) {
          action = 'skipComplete';
        } else if (isProtected) {
          // ne propose que des champs non-sensibles (pas role/roles/tenantId si déjà absents on ne touche pas)
          const safe = { ...missing };
          delete safe.role;
          delete safe.roles;
          // si tenantId déjà absent sur un user privilégié → ne PAS proposer auto, signal seulement
          if (!data.tenantId) {
            delete safe.tenantId;
            delete safe.orgId;
          }
          if (Object.keys(safe).length === 0) {
            action = 'skipProtected';
            out.skipProtected++;
          } else {
            action = 'mergeSafeProtected';
            out.proposedMerge++;
            proposedPayload = safe;
            conserved = ['role', 'roles', 'tenantId(privileged)'];
            added = Object.keys(safe);
          }
        } else {
          action = 'merge';
          out.userDocIncomplete++;
          out.proposedMerge++;
          proposedPayload = missing;
          added = Object.keys(missing);
        }
      }

      if (out.samples.length < (CFG.verbose ? 25 : 8)) {
        out.samples.push({
          uid,
          action,
          blocking: entry.blocking,
          tenantHints: [...entry.tenantHints],
          detectedTenant,
          sources: entry.sources,
          proposedPayload: CFG.verbose ? proposedPayload : proposedPayload ? '(payload masqué — utiliser --verbose)' : null,
          fieldsAdded: added,
          fieldsConserved: conserved,
        });
      }
    },
    CFG.concurrency,
  );

  return out;
}

// =====================================================================
// 6. Main
// =====================================================================

(async () => {
  const startedAt = new Date();
  console.log('====================================================================');
  console.log(`SYGEPEC — Phase 4A.1 — Migration DRY-RUN`);
  console.log(`  projectId       : ${CFG.projectId}`);
  console.log(`  tenant filter   : ${CFG.tenant ?? '(all)'}`);
  console.log(`  collection      : ${CFG.filterCol ?? '(all)'}`);
  console.log(`  limit/coll      : ${CFG.limit || 'unlimited'}`);
  console.log(`  page size       : ${CFG.pageSize}`);
  console.log(`  bootstrap only  : ${CFG.bootstrapOnly}`);
  console.log(`  concurrency     : ${CFG.concurrency}`);
  console.log(`  json report     : ${CFG.outPath ?? 'no'}`);
  console.log(`  verbose         : ${CFG.verbose}`);
  console.log(`  mode            : DRY-RUN (no write, no delete)`);
  console.log('====================================================================\n');

  await initFirestore();

  const uidRegistry = new UidRegistry();
  const perCollection = [];

  const targets = CFG.filterCol ? COLLECTIONS.filter((c) => c.legacy === CFG.filterCol) : COLLECTIONS;
  if (targets.length === 0) {
    console.error(`[ABORT] Collection inconnue : ${CFG.filterCol}`);
    process.exit(2);
  }

  if (!CFG.bootstrapOnly) {
    for (const col of targets) {
      const t0 = Date.now();
      process.stdout.write(`▶ ${col.legacy.padEnd(34)} → ${col.target}\n`);
      const stats = await inspectCollection(col, uidRegistry);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      perCollection.push(stats);
      printCollectionSummary(stats, dt);
    }
  } else {
    // Need to populate UID registry with a quick scan (uids only)
    console.log('▶ Bootstrap-only mode : scan léger des UIDs sur toutes les collections...\n');
    for (const col of COLLECTIONS) {
      try {
        for await (const d of paginate(col.legacy, {
          tenantFilter: CFG.tenant,
          hardLimit: CFG.limit,
          pageSize: CFG.pageSize,
        })) {
          const data = d.data();
          const owner =
            detectOwner(data) || (col.legacy === 'sygepecClientProfiles' ? d.id : null);
          if (owner) {
            uidRegistry.add(owner, {
              sourceColl: col.legacy,
              sourceId: d.id,
              tenantHint: detectTenant(data),
            });
          }
        }
      } catch (err) {
        console.warn(`  [warn] ${col.legacy}: ${err.message}`);
      }
    }
  }

  console.log('\n────────────── USER BOOTSTRAP (dry-run) ──────────────');
  const bootstrap = await inspectBootstrap(uidRegistry);
  printBootstrapSummary(bootstrap);

  // ---- Final summary ---------------------------------------------------
  const summary = aggregate(perCollection, bootstrap);
  printFinalSummary(summary);

  // ---- JSON report -----------------------------------------------------
  const finishedAt = new Date();
  let dryRunHash = null;
  let confirmTokenHint = null;
  if (CFG.outPath) {
    const report = {
      generatedAt: finishedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      durationMs: finishedAt - startedAt,
      projectId: CFG.projectId,
      mode: 'dry-run',
      phase: '4A.1',
      filters: {
        tenant: CFG.tenant,
        collection: CFG.filterCol,
        limit: CFG.limit,
        pageSize: CFG.pageSize,
        bootstrapOnly: CFG.bootstrapOnly,
      },
      summary,
      perCollection,
      userBootstrap: bootstrap,
      mappings: {
        statusDossier: STATUS_REMAP_DOSSIER,
        statusDocument: STATUS_REMAP_DOCUMENT,
        statusTravel: STATUS_REMAP_TRAVEL,
        timelineType: TIMELINE_TYPE_REMAP,
        protectedRoles: [...PROTECTED_ROLES],
      },
      conflicts: collectWarnings(perCollection, ['tenantMismatch']),
      orphans: perCollection.map((c) => ({ legacy: c.legacy, count: c.actions.orphan })),
      warnings: perCollection.flatMap((c) => c.warnings || []),
      errors: perCollection.flatMap((c) => (c.errors || []).map((e) => ({ legacy: c.legacy, error: e }))),
      nextRecommendedActions: nextActions(summary, bootstrap),
    };
    dryRunHash = hashReport(report);
    confirmTokenHint = `apply-${dryRunHash.slice(0, 12)}-${finishedAt.toISOString().slice(0, 10)}`;
    report.dryRunHash = dryRunHash;
    report.confirmTokenHint = confirmTokenHint;

    const abs = resolve(CFG.outPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n📄 Rapport JSON : ${abs}`);
    console.log(`   dryRunHash       : ${dryRunHash}`);
    console.log(`   confirmTokenHint : ${confirmTokenHint}  (à conserver pour future phase apply)`);
  }

  console.log('\n====================================================================');
  console.log('DRY-RUN terminé. AUCUNE écriture, AUCUNE suppression effectuée.');
  console.log('====================================================================');
  process.exit(0);
})().catch((err) => {
  console.error('\n[FATAL]', err.stack || err.message);
  process.exit(1);
});

// =====================================================================
// 7. Console formatters
// =====================================================================

function printCollectionSummary(s, dt) {
  console.log(`  documents lus     : ${s.documentsRead} (en ${dt}s)`);
  console.log(
    `  actions proposées : create=${s.actions.create}  merge=${s.actions.merge}  skipAlreadyMigrated=${s.actions.skipAlreadyMigrated}  conflict=${s.actions.conflict}`,
  );
  console.log(
    `  alertes           : orphan=${s.actions.orphan}  missingUser=${s.actions.missingUser}  missingTenant=${s.actions.missingTenant}  missingParentDossier=${s.actions.missingParentDossier}  noCanonicalTarget=${s.actions.noCanonicalTarget}`,
  );
  if (Object.keys(s.statusDistribution).length) {
    console.log(`  status            : ${JSON.stringify(s.statusDistribution)}`);
  }
  if (Object.keys(s.statusUnmapped).length) {
    console.log(`  ⚠ status non mappés : ${JSON.stringify(s.statusUnmapped)}`);
  }
  if (Object.keys(s.timelineUnmapped).length) {
    console.log(`  ⚠ timeline non mappés : ${JSON.stringify(s.timelineUnmapped)}`);
  }
  if (s.errors.length) {
    s.errors.forEach((e) => console.log(`  [error] ${e}`));
  }
  if (CFG.verbose && s.samples.length) {
    console.log(`  samples (${s.samples.length}):`);
    s.samples.forEach((x, i) => console.log(`    [${i}] ${JSON.stringify(x)}`));
  }
  console.log('');
}

function printBootstrapSummary(b) {
  console.log(`  uids détectés         : ${b.uidsDetected}`);
  console.log(`  users/{uid} présents  : ${b.userDocPresent}`);
  console.log(`  users/{uid} manquants : ${b.userDocMissing}    🔴 BLOQUANT pour migration canonique`);
  console.log(`  incomplets            : ${b.userDocIncomplete}`);
  console.log(`  tenantId manquant     : ${b.tenantMissing}`);
  console.log(`  role manquant         : ${b.roleMissing}`);
  console.log(`  rôle privilégié       : ${b.protectedRoleDetected}  (jamais écrasé)`);
  console.log(`  conflit tenant        : ${b.tenantConflict}`);
  console.log(`  → proposed create     : ${b.proposedCreate}`);
  console.log(`  → proposed merge      : ${b.proposedMerge}`);
  console.log(`  → skip protected      : ${b.skipProtected}`);
  if (CFG.verbose && b.samples.length) {
    console.log(`  samples:`);
    b.samples.forEach((s, i) => console.log(`    [${i}] ${JSON.stringify(s)}`));
  } else if (b.samples.length) {
    console.log(`  (samples masqués — utiliser --verbose ; ${b.samples.length} disponibles)`);
  }
  console.log('');
}

function printFinalSummary(s) {
  console.log('────────────────── RÉSUMÉ FINAL ──────────────────');
  console.log(`  Documents lus         : ${s.totalDocs}`);
  console.log(`  Migrations create     : ${s.totalCreate}`);
  console.log(`  Migrations merge      : ${s.totalMerge}`);
  console.log(`  Skip alreadyMigrated  : ${s.totalSkipAlready}`);
  console.log(`  Orphans               : ${s.totalOrphan}`);
  console.log(`  Conflicts             : ${s.totalConflict}`);
  console.log(`  missingUser (R1)      : ${s.totalMissingUser}    ${s.totalMissingUser > 0 ? '🔴 critique' : '✅'}`);
  console.log(`  missingTenant         : ${s.totalMissingTenant}`);
  console.log(`  missingParentDossier  : ${s.totalMissingParent}`);
  console.log(`  Users à bootstrap     : ${s.usersToBootstrap}`);
  console.log(`  Errors                : ${s.totalErrors}`);
  console.log('────────────────────────────────────────────────────');
}

function aggregate(perCollection, bootstrap) {
  const sum = (k) => perCollection.reduce((acc, c) => acc + (c.actions[k] || 0), 0);
  return {
    totalDocs: perCollection.reduce((a, c) => a + c.documentsRead, 0),
    totalCreate: sum('create'),
    totalMerge: sum('merge'),
    totalSkipAlready: sum('skipAlreadyMigrated'),
    totalOrphan: sum('orphan'),
    totalConflict: sum('conflict'),
    totalMissingUser: sum('missingUser'),
    totalMissingTenant: sum('missingTenant'),
    totalMissingParent: sum('missingParentDossier'),
    totalErrors: perCollection.reduce((a, c) => a + (c.errors?.length || 0), 0),
    usersToBootstrap: bootstrap.proposedCreate + bootstrap.proposedMerge,
    bootstrap: {
      missing: bootstrap.userDocMissing,
      incomplete: bootstrap.userDocIncomplete,
      protected: bootstrap.protectedRoleDetected,
    },
  };
}

function collectWarnings(perCollection, types) {
  return perCollection.flatMap((c) =>
    (c.warnings || []).filter((w) => types.includes(w.type)),
  );
}

function nextActions(summary, bootstrap) {
  const out = [];
  if (bootstrap.userDocMissing > 0) {
    out.push(
      `Phase 4B.1 — bootstrap users : ${bootstrap.userDocMissing} users à créer (BLOQUANT pour sameTenant rules)`,
    );
  }
  if (summary.totalConflict > 0) {
    out.push(`Résoudre ${summary.totalConflict} conflits tenant avant tout apply`);
  }
  if (summary.totalOrphan > 0) {
    out.push(`Investiguer ${summary.totalOrphan} documents orphelins (pas d'owner détectable)`);
  }
  if (summary.totalMissingParent > 0) {
    out.push(
      `Migrer dossiers AVANT documents/timeline/auditResponses (${summary.totalMissingParent} parents manquants)`,
    );
  }
  if (summary.totalErrors > 0) {
    out.push(`Corriger ${summary.totalErrors} erreurs script avant nouvelle exécution`);
  }
  if (out.length === 0) {
    out.push('Aucun bloqueur détecté — prêt pour validation stakeholder Phase 4B');
  }
  return out;
}

function hashReport(report) {
  // Hash stable : on hashe uniquement les chiffres clés, pas les samples (qui contiennent du verbose)
  const stable = {
    projectId: report.projectId,
    filters: report.filters,
    summary: report.summary,
    perCollection: report.perCollection.map((c) => ({
      legacy: c.legacy,
      documentsRead: c.documentsRead,
      actions: c.actions,
      statusDistribution: c.statusDistribution,
    })),
    userBootstrap: {
      uidsDetected: report.userBootstrap.uidsDetected,
      userDocMissing: report.userBootstrap.userDocMissing,
      userDocIncomplete: report.userBootstrap.userDocIncomplete,
      protectedRoleDetected: report.userBootstrap.protectedRoleDetected,
      proposedCreate: report.userBootstrap.proposedCreate,
      proposedMerge: report.userBootstrap.proposedMerge,
    },
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
