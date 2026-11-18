// The reasons a preparer gave in client files, mirrored on their own taxUsers record as
// { clientUid: expiry in ms }. The Storage rules read them there because they may read only
// two Firestore documents per request. Expired entries are dropped on every write.
export const FILE_GRANTS_MAX = 100;

export function nextFileGrants(current, clientUid, expiresAtMs, nowMs) {
  const kept = Object.entries(current && typeof current === "object" && !Array.isArray(current) ? current : {})
    .filter(([k, ms]) => k !== clientUid && Number(ms) > nowMs);
  return Object.fromEntries([...kept, [clientUid, expiresAtMs]].slice(-FILE_GRANTS_MAX));
}
