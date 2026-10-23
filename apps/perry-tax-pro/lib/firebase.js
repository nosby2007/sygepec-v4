import "server-only";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

export const TAX_TENANT = "perry-tax-pro";

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
    throw error;
  }
  return body;
}

export async function signInWithPassword(email, password) {
  const { apiKey } = firebaseConfig();
  return jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
}

export async function signUpWithPassword(email, password, displayName) {
  const { apiKey } = firebaseConfig();
  const created = await jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  await jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: created.idToken, displayName, returnSecureToken: true }),
  }).catch(() => null);
  return created;
}

export async function refreshIdToken(refreshToken) {
  const { apiKey } = firebaseConfig();
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  return jsonRequest(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function deleteFirebaseAccount(idToken) {
  const { apiKey } = firebaseConfig();
  return jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
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
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function documentName(path) {
  const { projectId } = firebaseConfig();
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function authHeaders(idToken) {
  return { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
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

function fieldFilter(fieldPath, op, value) {
  return { fieldFilter: { field: { fieldPath }, op, value: encodeValue(value) } };
}

export async function queryCollection(collectionId, idToken, { filters = [], orderBy = [], limit = 200 } = {}) {
  const where = filters.length === 0 ? undefined : filters.length === 1
    ? fieldFilter(...filters[0])
    : { compositeFilter: { op: "AND", filters: filters.map((filter) => fieldFilter(...filter)) } };
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
  return jsonRequest(`https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o?uploadType=media&name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": contentType },
    body: bytes,
  });
}

export async function downloadObject(path, idToken) {
  const { storageBucket } = firebaseConfig();
  return fetch(`https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(path)}?alt=media`, {
    headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store",
  });
}

export async function deleteObject(path, idToken) {
  const { storageBucket } = firebaseConfig();
  const response = await fetch(`https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(path)}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store",
  });
  if (!response.ok && response.status !== 404) throw new Error("Firebase Storage delete failed");
}
