import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (getApps().length === 0) {
  initializeApp();
}

interface AnonymizePayload {
  tenantId: string;
  confirmToken: string; // doit valoir `ANONYMIZE-${tenantId}-${YYYY-MM-DD}`
  scope?: 'soft' | 'full'; // soft = users only ; full = users + audit + payments meta
}

/**
 * Cloud Function callable : anonymise toutes les données nominatives d'un tenant.
 *
 * SÉCURITÉ :
 *  - Auth requis (super-admin uniquement, vérification custom claim ou rôle)
 *  - Token de confirmation contenant la date du jour (anti-rejeu)
 *  - Idempotente : marque chaque user `anonymizedAt` et skippe si déjà fait
 *
 * EFFETS :
 *  - users : email/displayName/phoneNumber/photoURL → valeurs neutres `anon-{shortId}@example.invalid`
 *  - dossiers : strip ownerEmail / ownerName du cache si présent
 *  - payments : strip provider customer email
 *  - auditLogs : NON modifiés (immuables) — actorEmail reste pour la traçabilité légale
 *  - Auth Firebase : disable + email anonymisé
 *
 * Renvoie un compte rendu détaillé. Génère un audit `SA_TENANT_ANONYMIZED`.
 */
export const anonymizeTenant = onCall<AnonymizePayload>(
  { region: 'us-central1', timeoutSeconds: 540, memory: '512MiB', maxInstances: 2 },
  async (request) => {
    const t0 = Date.now();
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise.');
    }

    const isSuperAdmin =
      auth.token['super_admin'] === true ||
      auth.token['role'] === 'super_admin' ||
      auth.token['role'] === 'superAdmin' ||
      (Array.isArray(auth.token['roles']) && (auth.token['roles'] as string[]).some((r) => r === 'super_admin' || r === 'superAdmin'));

    if (!isSuperAdmin) {
      throw new HttpsError('permission-denied', 'Réservé aux super-administrateurs.');
    }

    const { tenantId, confirmToken, scope = 'soft' } = request.data;

    if (!tenantId || typeof tenantId !== 'string') {
      throw new HttpsError('invalid-argument', 'tenantId manquant.');
    }
    const today = new Date().toISOString().slice(0, 10);
    const expected = `ANONYMIZE-${tenantId}-${today}`;
    if (confirmToken !== expected) {
      throw new HttpsError('failed-precondition', `Token invalide. Attendu : ${expected}`);
    }

    const db = getFirestore();
    const adminAuth = getAuth();

    let usersAnonymized = 0;
    let usersSkipped = 0;
    let usersDisabled = 0;
    let dossiersScrubbed = 0;
    let paymentsScrubbed = 0;
    const errors: string[] = [];

    try {
      // ----- USERS -----
      const usersSnap = await db.collection('users').where('tenantId', '==', tenantId).limit(2000).get();
      logger.info('anonymizeTenant: users found', { count: usersSnap.size, tenantId });

      const writer = db.bulkWriter();
      writer.onWriteError((err) => {
        errors.push(`bulkWriter user: ${err.message}`);
        return err.failedAttempts < 3;
      });

      for (const u of usersSnap.docs) {
        const data = u.data();
        if (data['anonymizedAt']) {
          usersSkipped += 1;
          continue;
        }
        const shortId = u.id.slice(0, 8);
        const anonEmail = `anon-${shortId}@example.invalid`;
        writer.update(u.ref, {
          email: anonEmail,
          displayName: `Utilisateur anonymisé ${shortId}`,
          phoneNumber: null,
          photoURL: null,
          anonymizedAt: FieldValue.serverTimestamp(),
          anonymizedBy: auth.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        usersAnonymized += 1;

        // Auth side
        try {
          await adminAuth.updateUser(u.id, { email: anonEmail, displayName: `Anonymisé`, disabled: true });
          usersDisabled += 1;
        } catch (err) {
          // user may not exist in Auth — non bloquant
          logger.warn('anonymizeTenant: auth update skipped', { uid: u.id, err: (err as Error).message });
        }
      }
      await writer.close();

      if (scope === 'full') {
        // ----- DOSSIERS (strip cached owner info) -----
        const dossiersSnap = await db.collection('dossiers').where('tenantId', '==', tenantId).limit(2000).get();
        const dWriter = db.bulkWriter();
        for (const d of dossiersSnap.docs) {
          const data = d.data();
          if (data['ownerEmail'] || data['ownerName']) {
            dWriter.update(d.ref, {
              ownerEmail: null,
              ownerName: null,
              anonymizedAt: FieldValue.serverTimestamp(),
            });
            dossiersScrubbed += 1;
          }
        }
        await dWriter.close();

        // ----- PAYMENTS (strip provider customer email) -----
        const paySnap = await db.collection('payments').where('tenantId', '==', tenantId).limit(2000).get();
        const pWriter = db.bulkWriter();
        for (const p of paySnap.docs) {
          const data = p.data();
          if (data['providerCustomerEmail'] || data['payerEmail']) {
            pWriter.update(p.ref, {
              providerCustomerEmail: null,
              payerEmail: null,
              anonymizedAt: FieldValue.serverTimestamp(),
            });
            paymentsScrubbed += 1;
          }
        }
        await pWriter.close();
      }

      // ----- AUDIT (immuable — uniquement CREATE) -----
      await db.collection('auditLogs').add({
        tenantId,
        actorUid: auth.uid,
        actorEmail: auth.token['email'] ?? null,
        action: 'SA_TENANT_ANONYMIZED',
        targetType: 'organizations',
        targetId: tenantId,
        meta: {
          scope,
          usersAnonymized,
          usersSkipped,
          usersDisabled,
          dossiersScrubbed,
          paymentsScrubbed,
          durationMs: Date.now() - t0,
          errors: errors.slice(0, 10),
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        scope,
        usersAnonymized,
        usersSkipped,
        usersDisabled,
        dossiersScrubbed,
        paymentsScrubbed,
        errors: errors.slice(0, 10),
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      logger.error('anonymizeTenant failed', err);
      throw new HttpsError('internal', `Erreur durant l'anonymisation: ${(err as Error).message}`);
    }
  },
);
