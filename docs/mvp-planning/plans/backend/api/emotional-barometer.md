---
slug: /backend/api/emotional-barometer
sidebar_position: 8
---

# Emotional Barometer API

Emotional tracking and support exercises across all stages.

## Record Emotional Reading

Record an emotional intensity reading.

```
POST /api/v1/sessions/:id/emotions
```

### Request Body

```typescript
interface RecordEmotionalReadingRequest {
  intensity: number;  // 1-10 scale
  context?: string;   // Optional description
}
```

### Response

```typescript
interface RecordEmotionalReadingResponse {
  reading: EmotionalReadingDTO;

  // If intensity trending up, offer support
  offerSupport?: boolean;
  supportType?: EmotionalSupportType;
}

enum EmotionalSupportType {
  BREATHING_EXERCISE = 'BREATHING_EXERCISE',
  BODY_SCAN = 'BODY_SCAN',
  GROUNDING = 'GROUNDING',
  PAUSE_SESSION = 'PAUSE_SESSION',
}
```

### Example: Normal Reading

```bash
curl -X POST /api/v1/sessions/sess_abc123/emotions \
  -H "Authorization: Bearer <token>" \
  -d '{"intensity": 5}'
```

```json
{
  "success": true,
  "data": {
    "reading": {
      "id": "emo_002",
      "intensity": 5,
      "context": null,
      "stage": 1,
      "timestamp": "2024-01-16T15:45:00Z"
    }
  }
}
```

### Example: High Intensity with Support Offer

```json
{
  "success": true,
  "data": {
    "reading": {
      "id": "emo_003",
      "intensity": 8,
      "context": null,
      "stage": 1,
      "timestamp": "2024-01-16T16:00:00Z"
    },
    "offerSupport": true,
    "supportType": "BREATHING_EXERCISE"
  }
}
```

### Support Offer Logic

Support is offered based on:

| Condition | Support Type |
|-----------|--------------|
| Intensity >= 8 | BREATHING_EXERCISE |
| Intensity increased by 3+ in last 10 min | GROUNDING |
| Intensity >= 9 sustained | PAUSE_SESSION |
| Intensity >= 7 with distress context | BODY_SCAN |

**Important**: Support is always **offered, never forced**. The user chooses whether to engage.

---

## Get Emotional History

Get emotional reading history for a session.

```
GET /api/v1/sessions/:id/emotions
```

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `stage` | number | all | Filter by stage |
| `limit` | number | 20 | Max results |

### Response

```typescript
interface GetEmotionalHistoryResponse {
  readings: EmotionalReadingDTO[];

  // Trend analysis
  trend: EmotionalTrend;
  averageIntensity: number;
}

interface EmotionalTrend {
  direction: 'INCREASING' | 'STABLE' | 'DECREASING';
  changeFromStart: number;  // Positive = more intense
}
```

---

## Complete Exercise

Log completion of a support exercise.

```
POST /api/v1/sessions/:id/exercises/complete
```

### Request Body

```typescript
interface CompleteExerciseRequest {
  exerciseType: EmotionalSupportType;
  completed: boolean;  // false = skipped/declined
}
```

### Response

```typescript
interface CompleteExerciseResponse {
  logged: boolean;
  postExerciseCheckIn?: boolean;  // Should we prompt for new reading?
}
```

### Example

```bash
curl -X POST /api/v1/sessions/sess_abc123/exercises/complete \
  -H "Authorization: Bearer <token>" \
  -d '{"exerciseType": "BREATHING_EXERCISE", "completed": true}'
```

```json
{
  "success": true,
  "data": {
    "logged": true,
    "postExerciseCheckIn": true
  }
}
```

### Post-Exercise Flow

If `postExerciseCheckIn: true`, the UI should:
1. Show a gentle prompt for new reading
2. "How are you feeling now?" with 1-10 scale
3. Record the new reading via `POST /emotions`

---

## Inline Emotion Check

Emotional readings can also be submitted with messages:

```
POST /api/v1/sessions/:id/messages
```

```json
{
  "content": "I just feel so frustrated...",
  "emotionalIntensity": 7
}
```

This creates both a Message and an EmotionalReading atomically.

---

## Privacy

Emotional readings are stored in the UserVessel and are **private by default**.

| Data | Visibility |
|------|------------|
| Individual readings | Private (UserVessel) |
| Intensity trends | Private (UserVessel) |
| Exercise completion | Private (logged for AI context) |

The AI uses emotional readings to:
- Calibrate response tone
- Offer appropriate support
- Determine Memory Intent (avoid recall at high intensity)

Partner never sees specific readings unless:
1. User explicitly consents
2. Content type is EMOTIONAL_PATTERN
3. Transformation applied before sharing

---

## Design Principles

From [Emotional Barometer Mechanism](../../mechanisms/emotional-barometer.md):

1. **Always visible** - Inline in chat input, not hidden in settings
2. **No forced cooling** - High intensity triggers offers, not blocks
3. **User agency** - User chooses response to offers
4. **Lightweight check-ins** - 1-10 slider, not complex forms

---

## Related Documentation

- [Emotional Barometer Mechanism](../../mechanisms/emotional-barometer.md)
- [Messages API](./stage-1.md#send-message)
- [Memory Intent Layer](../state-machine/retrieval-contracts.md#memory-intent-layer)

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
