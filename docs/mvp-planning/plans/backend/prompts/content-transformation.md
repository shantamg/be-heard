---
slug: /backend/prompts/content-transformation
model: sonnet
temperature: 0.5
max_tokens: 300
---

# Content Transformation Prompt

Transform raw user content into shareable form (removing heat, preserving meaning).

## Context

- Used when content will be shared with partner via Consensual Bridge
- Input: Raw venting, emotional expression, or identified needs
- Output: Transformed content that preserves meaning without inflammatory language

## Transformation Principles

| Remove | Preserve |
|--------|----------|
| Accusations | Feelings |
| Attack language | Needs |
| "You always/never" | "I feel/need" |
| Character judgments | Behavioral descriptions |
| Heat/intensity | Core meaning |

## System Prompt

```
You are transforming raw content into a form that can be shared with the user's partner. Your goal is to preserve the core meaning and needs while removing inflammatory language.

TRANSFORMATION RULES:
1. Convert accusations to feelings: "You ignore me" -> "I feel unheard"
2. Convert attacks to needs: "You are selfish" -> "I need to feel considered"
3. Remove absolute language: "always/never" -> specific situations
4. Preserve vulnerability: Keep the human need underneath
5. Maintain first-person perspective: "I feel/need/want"

OUTPUT FORMAT:
- 1-3 sentences
- First person ("I...")
- Focuses on feelings and needs, not partner behavior
- Should feel true to user's experience but safe to share

DO NOT:
- Sanitize so much that meaning is lost
- Add words the user did not express
- Make it sound clinical or therapeutic
- Lose the emotional truth
```

## User Prompt Template

```
Transform this content for sharing with partner:

Original content:
"{{original_content}}"

Content type: {{content_type}} (EVENT_SUMMARY | IDENTIFIED_NEED | EMOTIONAL_PATTERN | BOUNDARY)

Context: {{context}}
```

## Examples

### Event Summary

**Original**: "They completely ignored me at the party. Just talked to everyone else like I was not even there. So typical."

**Transformed**: "I felt invisible and alone at the party, like I was not important to them in that moment."

### Identified Need

**Original**: "They never help with anything around the house. I am sick of being the only one who cares."

**Transformed**: "I have a need to feel like we are a team at home, with both of us contributing to our shared space."

### Emotional Pattern

**Original**: "Every time we fight, they just shut down. It is infuriating. They are such a coward."

**Transformed**: "When conflict arises, I feel alone and scared when connection breaks down. I need to feel like we can stay connected even when things are hard."

### Boundary

**Original**: "I can not keep being the one who always apologizes first. They need to take responsibility for once."

**Transformed**: "I need acknowledgment when I have been hurt before I can move forward. Feeling heard in my pain is important to me."

## Quality Checks

The transformation should pass these checks:

1. **Truth preservation**: Does it still represent what the user meant?
2. **Heat removal**: Is it safe for partner to read without triggering defensiveness?
3. **Need visibility**: Is the underlying need clear?
4. **First person**: Is it framed as "I" statements?
5. **Readability**: Would the user recognize this as their experience?

## User Review

After transformation, present to user:

```
Before I share this with {{partner_name}}, here is how I would express it:

"{{transformed_content}}"

Does this capture what you meant? You can edit this before sharing.
```

## Related

- [Consensual Bridge Mechanism](../../mechanisms/consensual-bridge.md)
- [Consent API](../api/consent.md)
- [Stage 2 API](../api/stage-2.md)

---

[Back to Prompts](./index.md)
