import "server-only";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

export const TAX_TENANT = "perry-tax-pro";

// Emulator hosts are honoured only outside production builds, so the integration tests
// can run the real server code locally while a deployed server can never be redirected.
const emulator = (name) => (process.env.NODE_ENV !== "production" ? process.env[name] : undefined);
const AUTH_EMULATOR = emulator("FIREBASE_AUTH_EMULATOR_HOST");
const FIRESTORE_EMULATOR = emulator("FIRESTORE_EMULATOR_HOST");
const STORAGE_EMULATOR = emulator("FIREBASE_STORAGE_EMULATOR_HOST");
const identityUrl = (method) => `${AUTH_EMULATOR ? `http://${AUTH_EMULATOR}/` : "https://"}identitytoolkit.googleapis.com/v1/accounts:${method}`;
const TOKEN_URL = `${AUTH_EMULATOR ? `http://${AUTH_EMULATOR}/` : "https://"}securetoken.googleapis.com/v1/token`;
const FIRESTORE_ORIGIN = FIRESTORE_EMULATOR ? `http://${FIRESTORE_EMULATOR}` : "https://firestore.googleapis.com";
const STORAGE_ORIGIN = STORAGE_EMULATOR ? `http://${STORAGE_EMULATOR}` : "https://firebasestorage.googleapis.com";

function required(value, name) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function firebaseConfig() {
  return {
    projectId: required(PROJECT_ID, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    apiKey: required(API_KEY, "NEXT_PUBLIC_FIREBASE_API_KEY"),
    storageBucket: required(STORAGE_BUCKET, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  };
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.error || "Firebase request failed");
    error.status = response.status;
    error.code = body?.error?.message;
    error.reason = body?.error?.status;
    throw error;
  }
  return body;
}

export async function signInWithPassword(email, password) {
  const { apiKey } = firebaseConfig();
  return jsonRequest(`${identityUrl("signInWithPassword")}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
}

export async function signUpWithPassword(email, password, displayName) {
  const { apiKey } = firebaseConfig();
  const created = await jsonRequest(`${identityUrl("signUp")}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  await jsonRequest(`${identityUrl("update")}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: created.idToken, displayName, returnSecureToken: true }),
  }).catch(() => null);
  return created;
}

export async function refreshIdToken(refreshToken) {
  const { apiKey } = firebaseConfig();
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  return jsonRequest(`${TOKEN_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

// A throwaway identity for one guest booking. Rules tie the booking to this uid, and the
// guest's private manage link carries its refresh token (encrypted).
export async function signInAnonymously() {
  const { apiKey } = firebaseConfig();
  return jsonRequest(`${identityUrl("signUp")}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
}

export async function deleteFirebaseAccount(idToken) {
  const { apiKey } = firebaseConfig();
  return jsonRequest(`${identityUrl("delete")}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  throw new TypeError(`Unsupported Firestore value: ${typeof value}`);
}

function encodeFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
}

function decodeValue(value = {}) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function docBase() {
  const { projectId } = firebaseConfig();
  return `${FIRESTORE_ORIGIN}/v1/projects/${projectId}/databases/(default)/documents`;
}

function documentName(path) {
  const { projectId } = firebaseConfig();
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

// Without a token the request is unauthenticated and only reaches publicly readable data.
function authHeaders(idToken) {
  return { ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}), "Content-Type": "application/json" };
}

export function decodeDocument(document) {
  if (!document) return null;
  return { id: document.name.split("/").at(-1), ...decodeFields(document.fields), createTime: document.createTime, updateTime: document.updateTime };
}

export async function getDocument(path, idToken) {
  try {
    return decodeDocument(await jsonRequest(`${docBase()}/${path}`, { headers: authHeaders(idToken) }));
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function setDocument(path, data, idToken, { createOnly = false } = {}) {
  const suffix = createOnly ? "?currentDocument.exists=false" : "";
  const document = await jsonRequest(`${docBase()}/${path}${suffix}`, {
    method: "PATCH",
    headers: authHeaders(idToken),
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  return decodeDocument(document);
}

export async function createDocuments(documents, idToken) {
  const writes = documents.map(({ path, data }) => ({
    update: { name: documentName(path), fields: encodeFields(data) },
    currentDocument: { exists: false },
  }));
  return jsonRequest(`${docBase()}:commit`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ writes }),
  });
}

// Write builders for commitWrites(). A commit applies all of its writes or none, and the
// preconditions make it fail when another request got there first.
export const createWrite = (path, data) => ({
  update: { name: documentName(path), fields: encodeFields(data) },
  currentDocument: { exists: false },
});

// Replaces the whole document, but only if it is unchanged since `updateTime` was read.
export const replaceWrite = (path, data, updateTime) => ({
  update: { name: documentName(path), fields: encodeFields(data) },
  currentDocument: updateTime ? { updateTime } : { exists: true },
});

export const deleteWrite = (path) => ({ delete: documentName(path) });

export async function commitWrites(writes, idToken) {
  return jsonRequest(`${docBase()}:commit`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ writes }),
  });
}

// True when a commit failed because a precondition no longer held (a slot was taken or
// the document changed), as opposed to a permission or network failure.
export function isConflict(error) {
  return error?.status === 409 || ["ALREADY_EXISTS", "FAILED_PRECONDITION", "ABORTED"].includes(error?.reason);
}

export async function incrementDocument(path, fieldPath, amount, idToken) {
  return jsonRequest(`${docBase()}:commit`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      writes: [{
        transform: {
          document: documentName(path),
          fieldTransforms: [{ fieldPath, increment: encodeValue(amount) }],
        },
        currentDocument: { exists: true },
      }],
    }),
  });
}

export async function mergeDocument(path, changes, idToken) {
  const current = await getDocument(path, idToken);
  if (!current) return null;
  const { id, createTime, updateTime, ...data } = current;
  return setDocument(path, { ...data, ...changes }, idToken);
}

// Filters on "__name__" take document IDs within the collection, which allows ID-prefix
// range queries without a composite index.
function fieldFilter(collectionId, fieldPath, op, value) {
  const encoded = fieldPath === "__name__" ? { referenceValue: documentName(`${collectionId}/${value}`) } : encodeValue(value);
  return { fieldFilter: { field: { fieldPath }, op, value: encoded } };
}

export async function queryCollection(collectionId, idToken, { filters = [], orderBy = [], limit = 200 } = {}) {
  const where = filters.length === 0 ? undefined : filters.length === 1
    ? fieldFilter(collectionId, ...filters[0])
    : { compositeFilter: { op: "AND", filters: filters.map((filter) => fieldFilter(collectionId, ...filter)) } };
  const structuredQuery = {
    from: [{ collectionId }],
    ...(where ? { where } : {}),
    ...(orderBy.length ? { orderBy: orderBy.map(([fieldPath, direction = "ASCENDING"]) => ({ field: { fieldPath }, direction })) } : {}),
    limit,
  };
  const rows = await jsonRequest(`${docBase()}:runQuery`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ structuredQuery }),
  });
  return rows.filter((row) => row.document).map((row) => decodeDocument(row.document));
}

export async function deleteDocument(path, idToken) {
  const response = await fetch(`${docBase()}/${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
  if (!response.ok && response.status !== 404) throw new Error("Firebase delete failed");
}

export async function uploadObject(path, bytes, contentType, idToken) {
  const { storageBucket } = firebaseConfig();
  return jsonRequest(`${STORAGE_ORIGIN}/v0/b/${storageBucket}/o?uploadType=media&name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": contentType },
    body: bytes,
  });
}

export async function downloadObject(path, idToken) {
  const { storageBucket } = firebaseConfig();
  return fetch(`${STORAGE_ORIGIN}/v0/b/${storageBucket}/o/${encodeURIComponent(path)}?alt=media`, {
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}, cache: "no-store",
  });
}

export async function deleteObject(path, idToken) {
  const { storageBucket } = firebaseConfig();
  const response = await fetch(`${STORAGE_ORIGIN}/v0/b/${storageBucket}/o/${encodeURIComponent(path)}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store",
  });
  if (!response.ok && response.status !== 404) throw new Error("Firebase Storage delete failed");
}
