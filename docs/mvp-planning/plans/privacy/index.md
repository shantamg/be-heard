# Privacy Model

The Vessel architecture that protects user data and controls information flow.

## Documents

- **[Vessel Architecture](./vessel-model.md)** - The three-vessel privacy model

## Overview

Meet Without Fear uses a three-vessel model to separate and protect data:

```mermaid
flowchart TB
    subgraph UserVesselA[User A Vessel - Private]
        A1[Raw venting]
        A2[Documents]
        A3[Emotions]
        A4[Full history]
    end

    subgraph UserVesselB[User B Vessel - Private]
        B1[Raw venting]
        B2[Documents]
        B3[Emotions]
        B4[Full history]
    end

    subgraph AISynthesis[AI Synthesis - Internal Only]
        S1[Cross-user patterns]
        S2[Conflict mapping]
        S3[Need analysis]
    end

    subgraph SharedVessel[Shared Vessel - Consensual]
        Sh1[Consented content only]
        Sh2[Common ground]
        Sh3[Agreements]
    end

    UserVesselA -->|AI reads| AISynthesis
    UserVesselB -->|AI reads| AISynthesis
    AISynthesis -->|With consent| SharedVessel

    SharedVessel -->|Both can view| UserVesselA
    SharedVessel -->|Both can view| UserVesselB
```

## Key Principles

| Principle | Implementation |
|-----------|---------------|
| Privacy by default | All user input starts private |
| Consent required | Nothing shared without explicit approval |
| Transformation | Raw content transformed before sharing |
| Revocable | Users can withdraw consent |
| Transparency | Users can see what has been shared |

---

[Back to Plans](../index.md)
