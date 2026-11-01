import "server-only";
import { BusinessError, resolveBusiness } from "@/lib/business-booking";
import { deleteDocument, getDocument, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { favoriteId, favoriteRecord } from "@/lib/client-app";

// Businesses a signed-in client saved with the heart button.

export async function listFavorites(session) {
  const rows = await queryCollection("clientFavorites", session.idToken, {
    filters: [["ownerUid", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 100,
  });
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function isFavorite(session, businessId) {
  return getDocument(`clientFavorites/${favoriteId(session.uid, businessId)}`, session.idToken).then(Boolean, () => false);
}

export async function setFavorite(session, slug, saved) {
  const business = await resolveBusiness(slug);
  if (!business) throw new BusinessError("Business not found.", 404);
  const path = `clientFavorites/${favoriteId(session.uid, business.businessId)}`;
  // Saving twice is fine: the existing row stays (rows never change once written).
  const current = await isFavorite(session, business.businessId);
  if (saved && !current) await setDocument(path, favoriteRecord(session.uid, business, new Date().toISOString()), session.idToken, { createOnly: true });
  if (!saved && current) await deleteDocument(path, session.idToken);
  return { saved: Boolean(saved) };
}
