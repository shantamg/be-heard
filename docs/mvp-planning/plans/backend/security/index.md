---
slug: /backend/security
sidebar_position: 1
---

# Security Architecture

Security implementation for Meet Without Fear, focusing on privacy isolation and consent enforcement.

## Documentation

### [Row-Level Security](./rls-policies.md)
PostgreSQL RLS policies enforcing vessel isolation and consent verification at the database level.

### Access Control
API-level authorization and role-based access (user vs admin vs AI acting-on-behalf)

### Encryption
Data encryption at rest and in transit (Render Postgres + TLS everywhere)

### Audit Logging
Consent decisions and retrieval attempts recorded for review

## Core Security Principles

| Principle | Implementation |
|-----------|----------------|
| Privacy by default | UserVessel data isolated via RLS |
| Consent at query time | Every SharedVessel query checks `consentActive` |
| Defense in depth | App layer + DB layer + API layer |
| Audit everything | All consent decisions logged |
| Minimal privilege | AI receives only stage-appropriate context |

## MVP Decisions

- **Stage enforcement source of truth**: App-layer retrieval contracts + StageProgress gates. DB locals for stage are defense-in-depth only.
- **Consent scope**: All consent records are tied to a session + targetId + targetType; revocation must cascade to SharedVessel content (set `consentActive=false`) and mark dependent outputs stale.
- **Admin access**: Only for global library curation; no access to user vessels. Admin queries use separate role and are blocked from relationship/session tables by RLS.
- **Encryption**: TLS to Postgres, Render at-rest encryption, hash push tokens, and avoid storing secrets in user rows.
- **Audit log**: Log every `/consent/decide`, `/consent/revoke`, retrieval contract rejection, and RLS policy violation attempt.

---

[Back to Backend](../index.md)
