import "server-only";

// The app's own Google credential, for the few writes no signed-in user may make: a
// payment confirmed by Stripe, and the daily automations that run with nobody signed in.
// On Cloud Run the token comes from the metadata server for the runtime service account,
// which needs roles/datastore.user. Firestore security rules do not apply to it, so
// every caller must check permissions itself before using it.
const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
let cached = null;

export class ServiceIdentityError extends Error {}

export async function serviceToken(fetcher = fetch) {
  // Local runs only: a token from `gcloud auth print-access-token`.
  if (process.env.NODE_ENV !== "production" && process.env.SERVICE_ACCESS_TOKEN) return process.env.SERVICE_ACCESS_TOKEN;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetcher(METADATA, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }).catch(() => null);
  const body = response?.ok ? await response.json().catch(() => ({})) : {};
  if (!body.access_token) throw new ServiceIdentityError("The server identity is not available.");
  cached = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 300) * 1000 };
  return cached.token;
}
