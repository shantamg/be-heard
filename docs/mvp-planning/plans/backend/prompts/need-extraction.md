---
slug: /backend/prompts/need-extraction
model: sonnet
temperature: 0.4
max_tokens: 1000
---

# Need Extraction Prompt

Extract universal human needs from user's Stage 1-2 content.

## Context

- Called when user enters Stage 3
- Input: User's messages, emotional readings, and events from Stages 1-2
- Output: Structured list of identified needs

## System Prompt

```
You are a need extraction system. Your task is to analyze a user's sharing and identify the underlying universal human needs.

UNIVERSAL NEEDS FRAMEWORK:

1. SAFETY
   - Security, stability, predictability, protection
   - Signals: fear of loss, anxiety about future, need for reassurance

2. CONNECTION
   - Belonging, intimacy, closeness, understanding
   - Signals: loneliness, feeling disconnected, wanting to be known

3. AUTONOMY
   - Freedom, choice, independence, self-determination
   - Signals: feeling controlled, wanting space, resisting demands

4. RECOGNITION
   - Appreciation, acknowledgment, respect, being seen
   - Signals: feeling invisible, efforts unnoticed, wanting validation

5. MEANING
   - Purpose, contribution, growth, significance
   - Signals: feeling useless, wanting to matter, seeking purpose

6. FAIRNESS
   - Justice, equality, reciprocity, balance
   - Signals: resentment about imbalance, feeling taken advantage of

EXTRACTION RULES:
1. Look for emotional language - it points to unmet needs
2. Look for complaints - they are unmet needs in disguise
3. Look for "should" statements - they reveal expectations rooted in needs
4. Consider intensity and repetition - strongly felt or repeated themes
5. Extract 2-5 needs maximum - focus on most prominent

OUTPUT FORMAT:
Return a JSON array of needs with the following structure:
{
  "needs": [
    {
      "need": "string - name of need",
      "category": "SAFETY|CONNECTION|AUTONOMY|RECOGNITION|MEANING|FAIRNESS",
      "description": "string - specific description for this user",
      "evidence": ["string array of quotes/references"],
      "confidence": 0.0-1.0
    }
  ]
}
```

## User Prompt Template

```
Analyze the following content from {{user_name}} and extract underlying needs:

MESSAGES (Stage 1-2):
{{#each messages}}
[{{this.timestamp}}] {{this.content}}
{{/each}}

EMOTIONAL READINGS:
{{#each emotional_readings}}
[{{this.timestamp}}] Intensity: {{this.intensity}}/10 {{#if this.context}}- {{this.context}}{{/if}}
{{/each}}

KEY EVENTS RECORDED:
{{#each events}}
- {{this.description}} (attributed to: {{this.attribution}})
{{/each}}

Extract 2-5 universal human needs from this content. For each need, provide:
1. The need name
2. Category from the framework
3. A specific description of how this need manifests for this user
4. Evidence quotes/references from the content
5. Your confidence level (0-1)

Return as JSON.
```

## Expected Output

```json
{
  "needs": [
    {
      "need": "Recognition",
      "category": "RECOGNITION",
      "description": "Need to feel seen and appreciated for contributions at home",
      "evidence": [
        "I cleaned the whole house and they did not even notice",
        "Nothing I do is ever enough"
      ],
      "confidence": 0.87
    },
    {
      "need": "Partnership",
      "category": "FAIRNESS",
      "description": "Need for shared responsibility and balanced effort in relationship",
      "evidence": [
        "I am always the one who has to think about everything",
        "Why am I the only one who cares about this?"
      ],
      "confidence": 0.82
    },
    {
      "need": "Connection",
      "category": "CONNECTION",
      "description": "Need to feel emotionally close and prioritized",
      "evidence": [
        "They spend all their time on work",
        "We never just talk anymore"
      ],
      "confidence": 0.71
    }
  ]
}
```

## Confidence Scoring

| Confidence | Criteria |
|------------|----------|
| 0.9+ | Multiple explicit statements, high emotional intensity |
| 0.7-0.9 | Clear pattern, some explicit statements |
| 0.5-0.7 | Inferred from context, less explicit |
| <0.5 | Speculative, minimal evidence |

## Common Patterns

| Surface Statement | Likely Need(s) |
|-------------------|----------------|
| "They never listen" | Recognition, Connection |
| "They are always criticizing" | Recognition, Safety |
| "They work too much" | Connection, Fairness |
| "They make all the decisions" | Autonomy, Fairness |
| "Nothing I do matters" | Recognition, Meaning |
| "I feel like I am walking on eggshells" | Safety |
| "They do not understand me" | Connection |

## Validation

Before presenting to user:
1. Ensure at least 2 needs identified
2. Ensure each need has at least 1 evidence quote
3. Filter out needs with confidence < 0.5
4. Order by confidence descending

## Related

- [Stage 3: Need Mapping](../../stages/stage-3-need-mapping.md)
- [Stage 3 Prompt](./stage-3-needs.md)
- [Universal Needs Framework](../../stages/stage-3-need-mapping.md#universal-needs-framework)

---

[Back to Prompts](./index.md)
