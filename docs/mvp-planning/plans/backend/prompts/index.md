---
slug: /backend/prompts
sidebar_position: 1
---

# AI Prompt Templates

Prompt templates for BeHeard AI interactions. Each prompt is designed for specific stage contexts and follows strict retrieval contracts.

## Model Stratification

BeHeard uses Claude models via AWS Bedrock:

| Task | Model | Rationale |
|------|-------|-----------|
| Stage classification | Claude 3.5 Haiku | Fast, deterministic |
| Emotional intensity detection | Claude 3.5 Haiku | Quick pattern matching |
| Retrieval planning | Claude 3.5 Haiku | Structured output, no creativity |
| **User-facing responses** | **Claude 3.5 Sonnet** | Empathy, nuance, safety |
| Need extraction | Claude 3.5 Sonnet | Complex reasoning |
| Transformation (raw to shareable) | Claude 3.5 Sonnet | Preserving meaning, removing heat |

## Prompt Categories

### Stage-Specific

| Prompt | Stage | Purpose |
|--------|-------|---------|
| [Stage 0: Opening](./stage-0-opening.md) | 0 | Welcome and Curiosity Compact |
| [Stage 1: Witnessing](./stage-1-witnessing.md) | 1 | Deep listening and reflection |
| [Stage 2: Perspective](./stage-2-perspective.md) | 2 | Building empathy guess |
| [Stage 3: Need Mapping](./stage-3-needs.md) | 3 | Validating needs and common ground |
| [Stage 4: Strategic Repair](./stage-4-repair.md) | 4 | Collaborative strategy creation |

### Cross-Stage

| Prompt | Stages | Purpose |
|--------|--------|---------|
| [Emotional Support](./emotional-support.md) | All | Responding to high intensity |
| [Mirror Intervention](./mirror-intervention.md) | 2+ | Redirecting judgment to curiosity |

### Utility

| Prompt | Purpose |
|--------|---------|
| [Need Extraction](./need-extraction.md) | Extract needs from venting (Stage 3 input) |
| [Content Transformation](./content-transformation.md) | Raw to shareable content |

## Prompt Structure

Each prompt file uses this format:

```markdown
---
model: sonnet | haiku
temperature: 0.0-1.0
max_tokens: number
---

## System Prompt

[The system prompt content]

## User Prompt Template

[Template with {{variables}}]

## Expected Output

[Description or JSON schema]

## Examples

[Few-shot examples if needed]
```

## Retrieval Context

Prompts receive pre-assembled context based on [Retrieval Contracts](../state-machine/retrieval-contracts.md). The AI:

- Never decides what to retrieve
- Receives only stage-appropriate data
- Cannot access partner UserVessel content
- Sees AI Synthesis for internal planning only (never in generation context)

## Safety Guidelines

All user-facing prompts must:

1. Never assign blame or take sides
2. Never diagnose mental health conditions
3. Always validate emotions without endorsing harmful actions
4. Redirect to professional help if safety concerns detected
5. Maintain the Process Guardian role (facilitate, don't advise)

---

[Back to Backend](../index.md)
