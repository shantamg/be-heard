# Mechanisms

Key behavioral mechanics that govern how Meet Without Fear operates across all stages.

## Documents

- **[Emotional Barometer](./emotional-barometer.md)** - Intensity monitoring and pacing control
- **[Mirror Intervention](./mirror-intervention.md)** - Redirecting judgment to self-reflection
- **[Consensual Bridge](./consensual-bridge.md)** - Controlling what gets shared between users
- **[Hint System](./hint-system.md)** - AI-assisted hints when users are stuck building empathy
- **[System Guardrails](./guardrails.md)** - Rules the AI always follows

## Overview

```mermaid
flowchart TD
    subgraph Always Active
        EB[Emotional Barometer]
        SG[System Guardrails]
    end

    subgraph Stage-Specific
        MI[Mirror Intervention]
        CB[Consensual Bridge]
    end

    EB -->|Monitors| All[All Stages]
    SG -->|Enforces| All

    MI -->|Active in| S2[Stage 2-3]
    CB -->|Active in| S23[Stage 2-4]
```

## Quick Reference

| Mechanism | Purpose | When Active |
|-----------|---------|-------------|
| [Emotional Barometer](./emotional-barometer.md) | Monitor intensity; trigger pauses | All stages |
| [Mirror Intervention](./mirror-intervention.md) | Redirect judgment to curiosity | Stage 2-3 |
| [Consensual Bridge](./consensual-bridge.md) | Control data sharing | Stage 2-4 |
| [Hint System](./hint-system.md) | Help stuck users with partner context | Stage 2 |
| [System Guardrails](./guardrails.md) | Enforce core principles | Always |

---

[Back to Plans](../index.md)
