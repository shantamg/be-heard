---
slug: /backend/prompts
sidebar_position: 1
---

# AI Prompt Templates

Prompt templates for Meet Without Fear AI interactions. Each prompt is designed for specific stage contexts and follows strict retrieval contracts.

## Model Stratification

Meet Without Fear uses Claude models via AWS Bedrock:

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

## Conversational Continuity ("Ghost in the Machine" Prevention)

Because the Large Model receives only a pre-assembled context bundle (not full conversation history), there is a risk of losing conversational thread and tone consistency. This is addressed through:

### 1. Turn Buffer in Context Bundle

Each turn includes a **conversation context** field with recent messages:

```typescript
interface ContextBundle {
  // ... other fields
  conversation_context: {
    recent_turns: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
    }>;
    turn_count: number;
    session_duration_minutes: number;
  };
}
```

**Buffer Size by Stage:**

| Stage | Recent Turns Included | Rationale |
|-------|----------------------|-----------|
| Stage 1 | Last 6 turns | Deep witnessing needs thread memory |
| Stage 2 | Last 4 turns | Empathy building is more structured |
| Stage 3 | Last 4 turns | Need confirmation is procedural |
| Stage 4 | Last 8 turns | Negotiation requires full context |

### 2. Emotional Thread Tracking

The context bundle includes emotional trajectory:

```typescript
emotional_thread: {
  initial_intensity: number;      // Start of session
  current_intensity: number;      // Latest reading
  trend: 'escalating' | 'stable' | 'de-escalating';
  notable_shifts: Array<{
    turn: number;
    from: number;
    to: number;
    trigger_summary: string;      // What caused the shift
  }>;
}
```

This allows the AI to maintain emotional attunement even without full history.

### 3. Personality Anchor in System Prompt

Every system prompt includes a **personality anchor** that reinforces consistent tone:

```
PERSONALITY ANCHOR:
- Warm but not saccharine
- Direct but not blunt
- Curious but not intrusive
- Patient with repetition (users often need to say things multiple times)
- Never rushed, never impatient
- Use the users name occasionally, but not in every response
- Match the users energy level (calm when they are calm, present when they are activated)
```

### 4. Continuity Signals in Responses

Prompts instruct the AI to include natural continuity markers:

```
CONTINUITY TECHNIQUES:
- Reference what the user just said: "You mentioned feeling overlooked..."
- Acknowledge time passing: "Weve been talking for a while now..."
- Note progress: "Earlier you seemed more guarded about this..."
- Use consistent metaphors once introduced
```

### 5. Session Summary Injection

For sessions longer than 30 minutes, a **session summary** is included:

```typescript
session_summary?: {
  key_themes: string[];           // Max 3
  emotional_journey: string;      // One sentence
  current_focus: string;          // What we are working on now
  user_stated_goals: string[];    // What user said they want from this
}
```

### 6. Avoiding Disconnected Form Feeling

The AI is explicitly instructed to avoid patterns that feel mechanical:

```
AVOID THESE PATTERNS (they feel disconnected):
- Starting every response with "I hear you..."
- Generic validation like "That sounds hard"
- Repeating the users words exactly (paraphrase instead)
- Asking the same question twice in a session
- Forgetting something the user explicitly stated earlier (check conversation_context)
```

### Monitoring Continuity

Log when users express frustration with AI memory:

```typescript
// Detect continuity failure signals
const CONTINUITY_FAILURE_PATTERNS = [
  /i (just|already) (said|told you)/i,
  /weren.?t you listening/i,
  /we talked about this/i,
  /you forgot/i,
];

if (CONTINUITY_FAILURE_PATTERNS.some(p => p.test(userMessage))) {
  metrics.increment('ai.continuity_failure_signal');
  // Trigger review of context bundle size/content
}
```

---

[Back to Backend](../index.md)
