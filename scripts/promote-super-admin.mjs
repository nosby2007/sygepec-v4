/**
 * promote-super-admin.mjs
 *
 * Promeut un utilisateur Firebase Auth existant au rôle super-admin SYGEPEC.
 *
 * Préparation (une seule fois) :
 *   1) Console Firebase → Project Settings → Service accounts → "Generate new private key"
 *   2) Sauvegarder le JSON sous : sygepec-V4/scripts/service-account.json  (NE PAS COMMIT)
 *   3) Depuis sygepec-V4/, installer firebase-admin si absent :
 *        cd functions && npm i firebase-admin
 *
 * Utilisation :
 *   node scripts/promote-super-admin.mjs you@example.com
 *
 * Le compte doit déjà exister (créé via /auth/register ou Firebase Console).
 * Le script :
 *   - Marque le user document avec globalRole='admin', roles incluant 'super_admin'
 *   - Pose un Custom Claim Firebase Auth { admin: true, super_admin: true }
 *     (utile pour les rules Firestore avancées)
 *   - Crée le doc si absent
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SA_PATH = resolve(__dirname, 'service-account.json');

if (!existsSync(SA_PATH)) {
  console.error(`\n❌ service-account.json introuvable.`);
  console.error(`   Place-le ici : ${SA_PATH}`);
  console.error(`   (Console Firebase → Paramètres projet → Comptes de service → Générer une nouvelle clé privée)\n`);
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage : node scripts/promote-super-admin.mjs <email>');
  process.exit(1);
}

const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });

const auth = admin.auth();
const db = admin.firestore();

try {
  const user = await auth.getUserByEmail(email);
  console.log(`→ Utilisateur trouvé : ${user.uid} (${user.email})`);

  // 1) Custom claims (utile pour rules Firestore qui lisent request.auth.token.*)
  await auth.setCustomUserClaims(user.uid, {
    admin: true,
    super_admin: true,
  });
  console.log('  ✓ Custom claims posés : { admin: true, super_admin: true }');

  // 2) Document Firestore /users/{uid}
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : {};
  const existingRoles = Array.isArray(existing?.roles) ? existing.roles : [];
  const mergedRoles = Array.from(new Set([...existingRoles, 'super_admin', 'admin']));

  await ref.set(
    {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName ?? existing?.displayName ?? null,
      globalRole: 'admin',
      role: 'super_admin',
      roles: mergedRoles,
      isActive: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  console.log(`  ✓ Document users/${user.uid} mis à jour (globalRole=admin, roles=[${mergedRoles.join(', ')}])`);

  console.log(`\n✅ ${email} est désormais SUPER-ADMIN.`);
  console.log(`   Action requise : déconnecte/reconnecte ce compte sur /auth/admin-login`);
  console.log(`   pour rafraîchir le token Firebase + le contexte Angular.\n`);
  process.exit(0);
} catch (err) {
  console.error(`\n❌ Erreur :`, err.message ?? err);
  process.exit(1);
}
