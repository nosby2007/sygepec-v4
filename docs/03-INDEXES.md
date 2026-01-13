# Indexes (recommended)

Firestore will prompt you to create composite indexes when needed.
Start with these:

## dossiers
- tenantId ASC, createdAt DESC
- tenantId ASC, status ASC, createdAt DESC

## tickets
- tenantId ASC, updatedAt DESC
- tenantId ASC, status ASC, updatedAt DESC

## liveSessions
- tenantId ASC, startAt ASC
- tenantId ASC, status ASC, startAt ASC

## jobs
- tenantId ASC, status ASC, createdAt DESC

## orgMembers
- uid ASC, status ASC
