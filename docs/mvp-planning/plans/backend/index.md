---
slug: /backend
sidebar_position: 6
---

# Backend Architecture

Technical documentation for the Meet Without Fear backend - a **stateful, stage-gated, privacy-partitioned facilitation engine**.

## Core Principle

> Meet Without Fear is NOT a chatbot. It is a Process Guardian that enforces stage-scoped memory contracts.

## Non-Negotiable Architectural Rules

These rules are constitutional and must never be compromised:

| Rule | Rationale |
|------|-----------|
| Partner raw data is never retrieved | Privacy is absolute between vessels |
| Consent is transactional, revocable, and enforced at query time | Trust requires real-time consent checking |
| Vector search is never used to recall agreements or decisions | Trust-affecting data must be deterministic |
| The large model never decides what to retrieve or share | AI receives pre-assembled context only |
| AI Synthesis objects may influence retrieval planning but may never be injected directly into generation context | Prevents hallucination and privacy leakage |

## Technology Stack

- **Runtime**: Node.js with Express
- **ORM**: Prisma with RLS middleware
- **Database**: PostgreSQL (Render) + pgvector + Row-Level Security
- **Realtime**: Ably (pub/sub + presence detection for immediate partner notifications)
- **Push**: Expo Push Notifications (for offline users)
- **AI Models**: AWS Bedrock (Haiku for small tasks, Sonnet for facilitation)
- **Infrastructure**: Render.com (Web Service + Managed Postgres)

## Dual-Layer Data Strategy

```
Binary decisions (Consent, Stage Gates, Agreements) → SQL (deterministic)
Nuanced decisions (Emotional similarity, Episodic recall) → Vectors (semantic)
```

## Documentation Sections

### [Overview](./overview/index.md)
Architecture, mental model, and turn lifecycle

### [Data Model](./data-model/index.md)
Prisma schema, vessel implementations, memory objects

### [State Machine](./state-machine/index.md)
Session states, stage gates, retrieval contracts

### [AI Prompts](./prompts/index.md)
Model stratification, prompt templates for each stage, transformation prompts

### Mechanisms (coming soon)
Backend implementations of Emotional Barometer, Mirror Intervention, Consensual Bridge

### [API](./api/index.md)
REST endpoints for session management, stage progression, and consent flows

### [Security](./security/index.md)
Row-level security policies, access control, consent enforcement

### [Testing](./testing/index.md)
Unit, integration, and E2E testing strategy

### [Glossary](./glossary.md)
Canonical definitions for all Meet Without Fear backend terminology

## Key Design Principles

| Principle | Implementation |
|-----------|----------------|
| Memory is typed, scoped, gated | Not conversation history - structured objects with access rules |
| Vector search is support tool | Never authority for trust-affecting decisions |
| Small model for mechanics | Stage classification, detection, retrieval planning |
| Large model receives pre-assembled context | Does not decide what to retrieve |
| AI Synthesis is regenerable | Persist inputs, regenerate synthesis |
| Stage-scoped retrieval contracts | Hard rules on what each stage can access |

## Related Documentation

- [Privacy Model](../privacy/index.md) - Vessel architecture concepts
- [Stages](../stages/index.md) - User-facing stage documentation
- [Mechanisms](../mechanisms/index.md) - Mechanism behavior documentation
