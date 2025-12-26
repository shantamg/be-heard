---
slug: /backend/glossary
sidebar_position: 7
---

# Glossary

Canonical definitions for BeHeard backend terminology. Use these terms consistently across all documentation and code.

## Core Entities

| Term | Definition | Example |
|------|------------|---------|
| **Relationship** | Long-lived container linking two users. Persists across sessions. | Alice and Bob's relationship record |
| **Session** | One facilitation run through the BeHeard process. Has a lifecycle (Created → Resolved). | A specific conflict resolution attempt |
| **Stage** | FSM state within a session (0-4). Each stage has entry/exit gates. | Stage 1: The Witness |
| **Vessel** | Data isolation boundary. Determines who can access what. | User Vessel, Shared Vessel |

## Vessel Types

| Term | Definition | Access |
|------|------------|--------|
| **User Vessel** | Private container for one user's raw input, emotions, needs, boundaries. | User + AI only |
| **Shared Vessel** | Consensual container for content both users have agreed to share. | Both users + AI |
| **AI Synthesis** | Internal working model. Ephemeral, regenerable. Never exposed to users. | AI only |

## Memory Concepts

| Term | Definition | Storage |
|------|------------|---------|
| **Memory Object** | Typed, structured data extracted from user input. | SQL (Prisma) |
| **Embedding** | Vector representation for semantic search. | pgvector |
| **Retrieval Contract** | Hard rules defining what data can be accessed at each stage. | Code + Documentation |

## Process Terms

| Term | Definition | When Used |
|------|------------|-----------|
| **Gate** | Condition that must be satisfied to advance stages. | Stage transitions |
| **Consent** | Explicit user approval to share content with partner. | Consensual Bridge |
| **Transformation** | Reframing raw content to remove heat while preserving meaning. | Before sharing |

## AI Roles

| Term | Definition | Model Size |
|------|------------|------------|
| **Small Model** | Handles mechanics: classification, detection, retrieval planning. | Claude 3.5 Haiku |
| **Large Model** | Handles empathetic response generation. Receives pre-assembled context. | Claude 3.5 Sonnet |
| **Process Guardian** | The AI's role in BeHeard - enforces process, does not participate in conflict. | Conceptual |

## Technical Terms

| Term | Definition | Implementation |
|------|------------|----------------|
| **RLS** | Row-Level Security. Postgres feature enforcing access at database level. | Prisma + SET LOCAL |
| **Dirty Flag** | Boolean indicating AI Synthesis cache needs regeneration. | StageProgress.isSynthesisDirty |
| **Airlock** | Async queue for notifications when partner is offline. | BullMQ/Redis |
| **Context Bundle** | Pre-assembled data package sent to Large Model. | Context Assembler |

## State Terms

| Term | Definition | Values |
|------|------------|--------|
| **SessionStatus** | Current lifecycle state of a session. | CREATED, INVITED, ACTIVE, PAUSED, WAITING, RESOLVED, ABANDONED |
| **StageStatus** | User's progress within a stage. | NOT_STARTED, IN_PROGRESS, GATE_PENDING, COMPLETED |
| **ConsentDecision** | User's response to a consent request. | GRANTED, DENIED, REVOKED |

## Usage Guidelines

1. **Use "Session" not "Conversation"** - We are not building a chatbot
2. **Use "Vessel" not "Storage"** - Emphasizes privacy boundary, not just location
3. **Use "Stage" not "Step"** - Stages have gates and contracts, steps are just sequences
4. **Use "Process Guardian" not "AI Assistant"** - The AI enforces, not assists

---

[Back to Backend](./index.md)
