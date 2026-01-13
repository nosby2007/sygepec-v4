# SYGEPEC v3 (Angular 16.1 + Firebase + Multi-tenant) – Blueprint

This package provides a professional refactor target for SYGEPEC:
- Angular 16.1 (standalone + lazy routes)
- Firebase via AngularFire
- Multi-tenant data model using global collections + `tenantId`
- Tenant switching (Personal SYGEPEC vs Organization context)
- RBAC and org membership pattern (`orgMembers` global index + `orgs/{orgId}/members/{uid}`)
- Feature domains: Immigration, Training, Jobs, Travel, Support, Admin
- Course Reader + Live Sessions scaffolds

This blueprint is designed to be merged into your existing repo and used as the target architecture.
It includes migration instructions and security rules you can paste.

Version: v3
Date: 2026-01-12
