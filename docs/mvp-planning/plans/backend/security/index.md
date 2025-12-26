---
slug: /backend/security
sidebar_position: 1
---

# Security Architecture

Security implementation for BeHeard, focusing on privacy isolation and consent enforcement.

## Documentation

### [Row-Level Security](./rls-policies.md)
PostgreSQL RLS policies enforcing vessel isolation and consent verification at the database level.

### Access Control (coming soon)
API-level authorization and role-based access.

### Encryption (coming soon)
Data encryption at rest and in transit.

### Audit Logging (coming soon)
Consent decisions and data access audit trail.

## Core Security Principles

| Principle | Implementation |
|-----------|----------------|
| Privacy by default | UserVessel data isolated via RLS |
| Consent at query time | Every SharedVessel query checks `consentActive` |
| Defense in depth | App layer + DB layer + API layer |
| Audit everything | All consent decisions logged |
| Minimal privilege | AI receives only stage-appropriate context |

---

[Back to Backend](../index.md)
