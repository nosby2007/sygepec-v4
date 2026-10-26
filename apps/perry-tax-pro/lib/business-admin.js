import "server-only";
import { getDocument, queryCollection, TAX_TENANT } from "@/lib/firebase";

export const BUSINESS_TAX_STATUSES = [
  { key: "SUBMITTED_FOR_REVIEW", label: "Submitted", color: "#f5b841" },
  { key: "IN_REVIEW", label: "In review", color: "#1e63d6" },
  { key: "NEEDS_INFO", label: "Needs info", color: "#e11d48" },
  { key: "READY_FOR_PREPARATION", label: "Tax ready", color: "#14b8a6" },
  { key: "COMPLETED", label: "Completed", color: "#16a34a" },
];

export const BUSINESS_TAX_PRIORITIES = ["NORMAL", "HIGH", "URGENT"];

const withoutMeta = ({ id, createTime, updateTime, ...data }) => data;

function effectiveEntries(entries, corrections) {
  const latest = new Map();
  for (const correction of [...corrections].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) latest.set(correction.entryId, correction);
  return entries.map((entry) => {
    const correction = latest.get(entry.id);
    return correction ? { ...entry, kind: correction.kind, category: correction.category, amountCents: correction.amountCents, corrected: true } : entry;
  });
}

function summarize(entries) {
  let incomeCents = 0;
  let expenseCents = 0;
  const byCategory = {};
  for (const entry of entries) {
    if (entry.kind === "income") incomeCents += entry.amountCents || 0;
    if (entry.kind === "expense") expenseCents += entry.amountCents || 0;
    byCategory[entry.category || "Uncategorized"] = (byCategory[entry.category || "Uncategorized"] || 0) + (entry.amountCents || 0);
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents, byCategory };
}

const keyFor = (clientId, year) => `${clientId}:${year}`;

function latestReports(reports) {
  const latest = new Map();
  for (const report of reports) {
    const key = keyFor(report.clientId, report.taxYear);
    const current = latest.get(key);
    if (!current || String(report.createdAt).localeCompare(String(current.createdAt)) > 0) latest.set(key, report);
  }
  return latest;
}

function readiness(entryCount, matchCount, receiptCount, submitted) {
  if (!entryCount) return submitted ? 25 : 0;
  const reconciled = Math.min(1, matchCount / entryCount);
  const documented = Math.min(1, receiptCount / entryCount);
  return Math.round((submitted ? 0.25 : 0.05) * 100 + reconciled * 40 + documented * 35);
}

export async function loadBusinessTaxWorkspace(session) {
  const tenant = [["tenantId", "EQUAL", TAX_TENANT]];
  const [users, reports, entries, corrections, matches, receipts] = await Promise.all([
    queryCollection("taxUsers", session.idToken, { filters: tenant, limit: 1000 }),
    queryCollection("taxBusinessYearEnd", session.idToken, { filters: tenant, limit: 1000 }),
    queryCollection("taxBusinessEntries", session.idToken, { filters: tenant, limit: 1000 }),
    queryCollection("taxBusinessCorrections", session.idToken, { filters: tenant, limit: 1000 }),
    queryCollection("taxBusinessMatches", session.idToken, { filters: tenant, limit: 1000 }),
    queryCollection("taxBusinessReceipts", session.idToken, { filters: tenant, limit: 1000 }),
  ]);
  const businesses = users.filter((user) => user.role === "CLIENT" && user.accountType === "BUSINESS");
  const userById = new Map(businesses.map((user) => [user.uid || user.id, user]));
  const latest = latestReports(reports);
  const currentYear = new Date().getUTCFullYear();
  const keys = new Set([...latest.keys(), ...entries.map((entry) => keyFor(entry.clientId, entry.taxYear))]);
  for (const business of businesses) keys.add(keyFor(business.uid || business.id, currentYear));

  const rows = [...keys].map((key) => {
    const [clientId, yearValue] = key.split(":");
    const taxYear = Number(yearValue);
    const report = latest.get(key);
    const rawEntries = entries.filter((entry) => entry.clientId === clientId && entry.taxYear === taxYear);
    const rowCorrections = corrections.filter((item) => item.clientId === clientId && item.taxYear === taxYear);
    const adjusted = effectiveEntries(rawEntries, rowCorrections);
    const summary = summarize(adjusted);
    const matchedCount = new Set(matches.filter((item) => item.clientId === clientId && item.taxYear === taxYear).map((item) => item.entryId)).size;
    const receiptCount = receipts.filter((item) => item.clientId === clientId && item.taxYear === taxYear).length;
    const user = userById.get(clientId);
    return {
      id: report?.id || null,
      clientId,
      clientName: user?.name || `Business ${clientId.slice(0, 8)}`,
      clientEmail: user?.email || "",
      taxYear,
      status: report?.status || "DRAFT",
      priority: report?.priority || "NORMAL",
      dueDate: report?.dueDate || "",
      assignedPreparerId: report?.assignedPreparerId || null,
      assignedPreparerName: report?.assignedPreparerName || null,
      internalNote: report?.internalNote || "",
      createdAt: report?.createdAt || null,
      updatedAt: report?.updatedAt || report?.createdAt || null,
      entryCount: rawEntries.length,
      correctionCount: rowCorrections.length,
      matchedCount,
      receiptCount,
      readiness: readiness(rawEntries.length, matchedCount, receiptCount, Boolean(report)),
      ...summary,
    };
  }).sort((a, b) => b.taxYear - a.taxYear || a.clientName.localeCompare(b.clientName));

  const adjustedAll = effectiveEntries(entries, corrections);
  return { businesses, reports, entries: adjustedAll, corrections, matches, receipts, rows, currentYear };
}

export async function loadBusinessTaxCase(session, id) {
  const report = await getDocument(`taxBusinessYearEnd/${id}`, session.idToken);
  if (!report || report.tenantId !== TAX_TENANT) return null;
  const filters = [["tenantId", "EQUAL", TAX_TENANT], ["clientId", "EQUAL", report.clientId], ["taxYear", "EQUAL", report.taxYear]];
  const [user, entries, corrections, matches, receipts] = await Promise.all([
    getDocument(`taxUsers/${report.clientId}`, session.idToken),
    queryCollection("taxBusinessEntries", session.idToken, { filters, limit: 1000 }),
    queryCollection("taxBusinessCorrections", session.idToken, { filters, limit: 1000 }),
    queryCollection("taxBusinessMatches", session.idToken, { filters, limit: 1000 }),
    queryCollection("taxBusinessReceipts", session.idToken, { filters, limit: 1000 }),
  ]);
  const adjusted = effectiveEntries(entries, corrections);
  const summary = summarize(adjusted);
  const matchedIds = new Set(matches.map((item) => item.entryId));
  const receiptIds = new Set(receipts.map((item) => item.entryId));
  return {
    report,
    user,
    entries: adjusted.map((entry) => ({ ...entry, matched: matchedIds.has(entry.id), hasReceipt: receiptIds.has(entry.id) })),
    corrections,
    matches,
    receipts,
    summary,
    readiness: readiness(entries.length, matchedIds.size, receipts.length, true),
  };
}

export function stripBusinessTaxMeta(document) {
  return withoutMeta(document);
}
