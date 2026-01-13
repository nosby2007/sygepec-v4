# Firestore Schema (Multi-tenant)

## Users
users/{uid}
- displayName, email
- globalRole: 'user'|'admin'
- defaultTenantId: 'sygepec'
- defaultOrgId: string|null
- plan: 'basic'|'medium'|'premium'|string

## Organizations
orgs/{orgId}
- name
- tenantId: 'org_<orgId>'
- status: 'active'|'inactive'
- subscriptionPlan: string

orgs/{orgId}/members/{uid}
- uid
- role: 'owner'|'admin'|'staff'|'employer'|'viewer'
- status: 'active'|'inactive'
- createdAt

## Org membership index (global)
orgMembers/{docId}  // docId can be `${orgId}_${uid}`
- uid
- orgId
- role
- status
- orgName
- tenantId: 'org_<orgId>'

## Dossiers
dossiers/{dossierId}
- tenantId
- orgId (nullable)
- ownerUid
- assignedToUid (nullable)
- countryTarget
- program
- status
- createdAt, updatedAt

Subcollections:
- dossiers/{dossierId}/documents
- dossiers/{dossierId}/timeline
- dossiers/{dossierId}/messages

## Tickets
tickets/{ticketId}
- tenantId, orgId
- createdByUid
- assignedToUid (nullable)
- status: 'open'|'pending'|'closed'
- subject
- createdAt, updatedAt

tickets/{ticketId}/messages/{msgId}

## Courses / Modules / Lessons
courses/{courseId}
courses/{courseId}/modules/{moduleId}
courses/{courseId}/modules/{moduleId}/lessons/{lessonId}

## Enrollments
enrollments/{uid_courseId}

## Live Sessions
liveSessions/{sessionId}
liveSessions/{sessionId}/rsvps/{uid}

## Jobs
jobs/{jobId}
jobs/{jobId}/applications/{applicationId}

## Travel Bookings
travelBookings/{bookingId}
