---
title: Backend Prompting Architecture Audit
sidebar_position: 5
description: "Last Updated: 2026-03-11"
created: 2026-03-11
updated: 2026-05-26
status: living
---
# Backend Prompting Architecture Audit

**Last Updated:** 2026-04-20

This document provides a comprehensive overview of how prompting works in the Meet Without Fear backend, including prompt construction, model usage, parallel vs sequential operations, and memory handling.

## Table of Contents

1. [Overview](#overview)
2. [Model Stratification](#model-stratification)
3. [Main Orchestration Flow](#main-orchestration-flow)
4. [Decision Layers](#decision-layers)
5. [Memory Collection & Retrieval](#memory-collection--retrieval)
6. [Prompt Construction](#prompt-construction)
7. [Parallel vs Sequential Operations](#parallel-vs-sequential-operations)
8. [Service-Specific Flows](#service-specific-flows)

---

## Overview

The backend uses a **two-model stratification** approach:

- **Haiku (Claude Haiku 4.5)**: Fast, structured output for mechanical tasks (classification, detection, planning)
- **Sonnet (Claude Sonnet 4.5)**: Default model for empathetic user-facing responses
- **Dynamic routing**: At response time, `routeModel()` picks between Haiku and Sonnet based on conflict intensity, topic ambiguity, and message length — low-signal turns can be served by Haiku to save cost/latency. `orchestrateResponse` logs the chosen model in the `operation` field (`orchestrator-response-<model>`).

The system follows a **decision-first architecture** where a "decider" (Memory Intent Layer) determines what kind of remembering is appropriate before any retrieval occurs.

---

## Model Stratification

```mermaid
graph TB
    subgraph "AWS Bedrock Models"
        HAIKU["Claude Haiku 4.5<br/>Fast & Cheap<br/>~3x faster than Sonnet"]
        SONNET["Claude Sonnet 4.5<br/>Empathetic & Nuanced<br/>Better conversation"]
        TITAN["Amazon Titan Embed<br/>Vector Embeddings<br/>1024 dimensions"]
    end

    subgraph "Haiku Use Cases"
        H1["Retrieval Planning<br/>(planRetrieval)"]
        H2["Memory Detection<br/>(detectMemoryIntent)"]
        H3["Intent Detection<br/>(detectIntent)"]
        H4["Reference Detection<br/>(detectReferences)"]
        H5["JSON Extraction<br/>(getHaikuJson)"]
    end

    subgraph "Sonnet Use Cases"
        S1["User-Facing Responses<br/>(orchestrateResponse)"]
        S2["Witnessing Responses<br/>(getWitnessingResponse)"]
        S3["Empathy Building<br/>(Stage 2 prompts)"]
        S4["Reconciler Analysis<br/>(runReconciler)"]
    end

    subgraph "Titan Use Cases"
        T1["Semantic Search<br/>(getEmbedding)"]
        T2["Vector Similarity<br/>(searchAcrossSessions)"]
    end

    HAIKU --> H1
    HAIKU --> H2
    HAIKU --> H3
    HAIKU --> H4
    HAIKU --> H5

    SONNET --> S1
    SONNET --> S2
    SONNET --> S3
    SONNET --> S4

    TITAN --> T1
    TITAN --> T2
```

**Key Files:**

- `backend/src/lib/bedrock.ts` - Model configuration and client
- `backend/src/services/ai-orchestrator.ts` - Main orchestration using both models

---

## Main Orchestration Flow

The main flow from user message to AI response follows this sequence:

```mermaid
sequenceDiagram
    participant User
    participant Controller
    participant SessionProcessor
    participant Orchestrator
    participant MemoryIntent
    participant ContextAssembler
    participant ContextRetriever
    participant RetrievalPlanner
    participant SurfacingPolicy
    participant StagePrompts
    participant Sonnet
    participant MemoryDetector

    User->>Controller: POST /sessions/:id/messages
    Controller->>SessionProcessor: processSessionMessage()

    Note over SessionProcessor: Save user message to DB
    Note over SessionProcessor: Embed message (async, non-blocking)

    SessionProcessor->>Orchestrator: orchestrateResponse()

    Note over Orchestrator: Step 0: Fetch user preferences
    Orchestrator->>Orchestrator: getUserMemoryPreferences()

    Note over Orchestrator: Step 1: Determine memory intent (DECIDER)
    Orchestrator->>MemoryIntent: determineMemoryIntent()
    MemoryIntent-->>Orchestrator: MemoryIntentResult<br/>(intent, depth, threshold, etc.)

    Note over Orchestrator: Step 2: Assemble context bundle
    Orchestrator->>ContextAssembler: assembleContextBundle()
    ContextAssembler-->>Orchestrator: ContextBundle

    Note over Orchestrator: Step 2.5: Universal context retrieval (PARALLEL)
    par Parallel Retrieval
        Orchestrator->>ContextRetriever: retrieveContext()
        ContextRetriever->>ContextRetriever: detectReferences() [Haiku]
        ContextRetriever->>ContextRetriever: getSessionHistory()
        ContextRetriever->>ContextRetriever: getPreSessionMessages()
        ContextRetriever->>ContextRetriever: searchAcrossSessions() [Titan]
        ContextRetriever-->>Orchestrator: RetrievedContext
    end

    Note over Orchestrator: Step 2.6: Apply surfacing policy
    Orchestrator->>SurfacingPolicy: decideSurfacing()
    SurfacingPolicy-->>Orchestrator: SurfacingDecision

    Note over Orchestrator: Step 3: Plan retrieval (if depth=full, uses Haiku)
    alt Memory Intent Depth = 'full'
        Orchestrator->>RetrievalPlanner: planRetrieval()
        RetrievalPlanner->>RetrievalPlanner: getHaikuJson() [Haiku]
        RetrievalPlanner-->>Orchestrator: RetrievalPlan
    end

    Note over Orchestrator: Step 4: Build stage-specific prompt
    Orchestrator->>StagePrompts: buildStagePrompt()
    StagePrompts-->>Orchestrator: systemPrompt

    Note over Orchestrator: Step 5: Apply token budget management
    Orchestrator->>Orchestrator: buildBudgetedContext()

    Note over Orchestrator: Step 6: Generate response (Sonnet)
    Orchestrator->>Sonnet: getSonnetResponse()
    Sonnet-->>Orchestrator: response (JSON or text)

    Orchestrator->>Orchestrator: parseStructuredResponse()
    Orchestrator-->>SessionProcessor: OrchestratorResult

    Note over SessionProcessor: Save AI response to DB
    Note over SessionProcessor: Embed AI message (async, non-blocking)

    Note over SessionProcessor: Memory detection (conditional, async)
    alt Should Run Memory Detection
        SessionProcessor->>MemoryDetector: detectMemoryIntent() [Haiku]
        MemoryDetector-->>SessionProcessor: MemorySuggestion
    end

    SessionProcessor-->>Controller: SessionMessageResult
    Controller-->>User: AI Response + Metadata
```

**Key Decision Point:** The **Memory Intent Layer** acts as the "decider" that runs FIRST, before any retrieval or context assembly. It determines:

- What kind of remembering is appropriate (`intent`)
- How deep to retrieve (`depth`: none, minimal, light, full)
- Similarity thresholds and cross-session limits
- How to surface pattern observations

---

## Decision Layers

### Memory Intent Decider (Runs First)

The Memory Intent Layer is the **primary decider** that determines retrieval strategy:

```mermaid
graph TD
    START[User Message Arrives] --> MEMORY_INTENT[Memory Intent Layer<br/>determineMemoryIntent]

    MEMORY_INTENT --> CHECK_DISTRESS{High Distress?<br/>intensity >= 9}
    CHECK_DISTRESS -->|Yes| AVOID_RECALL[avoid_recall<br/>depth: none<br/>No retrieval]

    CHECK_DISTRESS -->|No| CHECK_HIGH_INTENSITY{High Intensity?<br/>intensity >= 8}
    CHECK_HIGH_INTENSITY -->|Yes| EMOTIONAL_VALIDATION[emotional_validation<br/>depth: minimal<br/>Stay present]

    CHECK_HIGH_INTENSITY -->|No| CHECK_COMMITMENT{User References<br/>Past Commitment?<br/>'we agreed', 'you said'}
    CHECK_COMMITMENT -->|Yes| RECALL_COMMITMENT[recall_commitment<br/>depth: full<br/>Full retrieval]

    CHECK_COMMITMENT -->|No| CHECK_SKIP{User Trying<br/>to Skip Stage?}
    CHECK_SKIP -->|Yes| STAGE_ENFORCEMENT[stage_enforcement<br/>depth: none<br/>Enforce process]

    CHECK_SKIP -->|No| CHECK_FIRST_TURN{First Turn<br/>in Session?}
    CHECK_FIRST_TURN -->|Yes| OFFER_CONTINUITY[offer_continuity<br/>depth: light<br/>Light summary]

    CHECK_FIRST_TURN -->|No| STAGE_DEFAULT[Stage-Specific Default]

    STAGE_DEFAULT --> STAGE_1{Stage 1?}
    STAGE_1 -->|Yes| WITNESS_VALIDATION[emotional_validation<br/>depth: minimal/light<br/>Stay present]

    STAGE_1 -->|No| STAGE_2{Stage 2?}
    STAGE_2 -->|Yes| PERSPECTIVE_RECALL[recall_commitment<br/>depth: light<br/>Context for empathy]

    STAGE_2 -->|No| STAGE_3_4{Stage 3 or 4?}
    STAGE_3_4 -->|Yes| FULL_RECALL[recall_commitment<br/>depth: full<br/>Full context]

    STAGE_3_4 -->|No| DEFAULT_MINIMAL[emotional_validation<br/>depth: minimal]

    AVOID_RECALL --> CONFIG[Apply Stage Config<br/>threshold, maxCrossSession,<br/>surfaceStyle]
    EMOTIONAL_VALIDATION --> CONFIG
    RECALL_COMMITMENT --> CONFIG
    STAGE_ENFORCEMENT --> CONFIG
    OFFER_CONTINUITY --> CONFIG
    WITNESS_VALIDATION --> CONFIG
    PERSPECTIVE_RECALL --> CONFIG
    FULL_RECALL --> CONFIG
    DEFAULT_MINIMAL --> CONFIG

    CONFIG --> RESULT[MemoryIntentResult<br/>Used by all downstream services]
```

**Memory Intent Types:**

- `avoid_recall`: High distress - no retrieval
- `emotional_validation`: Stay present, minimal recall
- `recall_commitment`: Full structured retrieval
- `offer_continuity`: Light summary from previous session
- `stage_enforcement`: No recall, enforce stage rules

**Stage-Aware Configuration:**
Each intent gets stage-specific thresholds:

- **Stage 1**: threshold=0.65, `allowCrossSession=false`, surfaceStyle='silent' (config-level `maxCrossSession` has per-stage values for future use)
- **Stage 2**: threshold=0.55, `allowCrossSession=false`, surfaceStyle='tentative'
- **Stage 3-4**: threshold=0.50, `allowCrossSession=false`, surfaceStyle='explicit'

> **Note:** The stage-config `maxCrossSession` values above represent the surfacing policy's intent. The orchestrator currently calls `retrieveContext({ ..., maxCrossSessionMessages: 10 })` with a **hardcoded 10** regardless of stage/turn — the surfacing policy's per-stage limit is not yet propagated into the retrieval call. Cross-session retrieval is still effectively disabled at the vector-search layer because `allowCrossSession: false` short-circuits the semantic search branch.

**Key File:** `backend/src/services/memory-intent.ts`

---

### Surfacing Policy (Runs After Retrieval)

Determines when and how to surface pattern observations:

```mermaid
graph TD
    START[Retrieved Context Available] --> SURFACING[Surfacing Policy<br/>decideSurfacing]

    SURFACING --> CHECK_STAGE_1{Stage 1?}
    CHECK_STAGE_1 -->|Yes| CHECK_USER_ASKED{User Asked<br/>for Pattern?}
    CHECK_USER_ASKED -->|No| SILENT_STAGE_1[shouldSurface: false<br/>style: silent<br/>Never surface in Stage 1]

    CHECK_USER_ASKED -->|Yes| ALLOW_WITH_EVIDENCE[shouldSurface: true<br/>style: tentative<br/>User initiated]

    CHECK_STAGE_1 -->|No| CHECK_STAGE_2{Stage 2?}
    CHECK_STAGE_2 -->|Yes| CHECK_EVIDENCE_2{Evidence >= 2?}
    CHECK_EVIDENCE_2 -->|Yes| TENTATIVE_STAGE_2[shouldSurface: true<br/>style: tentative<br/>Tentative observations]
    CHECK_EVIDENCE_2 -->|No| SILENT_STAGE_2[shouldSurface: false<br/>style: silent]

    CHECK_STAGE_2 -->|No| CHECK_STAGE_3_4{Stage 3 or 4?}
    CHECK_STAGE_3_4 -->|Yes| CHECK_EVIDENCE_3{Evidence >= 3?}
    CHECK_EVIDENCE_3 -->|Yes| CHECK_PREFERENCES{Pattern Insights<br/>Enabled?}
    CHECK_PREFERENCES -->|Yes| EXPLICIT_STAGE_3_4[shouldSurface: true<br/>style: explicit<br/>requiresConsent: true]
    CHECK_PREFERENCES -->|No| SILENT_STAGE_3_4[shouldSurface: false<br/>style: silent]

    CHECK_EVIDENCE_3 -->|No| SILENT_STAGE_3_4

    SILENT_STAGE_1 --> RESULT[SurfacingDecision]
    ALLOW_WITH_EVIDENCE --> RESULT
    TENTATIVE_STAGE_2 --> RESULT
    SILENT_STAGE_2 --> RESULT
    EXPLICIT_STAGE_3_4 --> RESULT
    SILENT_STAGE_3_4 --> RESULT
```

**Key File:** `backend/src/services/surfacing-policy.ts`

---

## Memory Collection & Retrieval

### Memory Collection Flow

Memories are collected in multiple ways:

```mermaid
graph TB
    subgraph "Memory Collection Sources"
        USER_CREATED[User Creates Memory<br/>Explicitly via API]
        MEMORY_DETECTOR[Memory Detector<br/>Detects Implicit Requests<br/>Uses Haiku]
        AI_SUGGESTED[AI Suggests Memory<br/>Based on Detection]
    end

    subgraph "Memory Detection (Haiku)"
        DETECT[detectMemoryIntent<br/>Analyzes user message]
        DETECT --> PATTERNS{Detect Patterns}
        PATTERNS -->|AI_NAME| AI_NAME["'I'll call you X'<br/>Category: AI_NAME<br/>Scope: global"]
        PATTERNS -->|LANGUAGE| LANGUAGE["Message in different language<br/>Category: LANGUAGE<br/>Scope: global"]
        PATTERNS -->|COMMUNICATION| COMM["'Keep it brief'<br/>Category: COMMUNICATION<br/>Scope: global"]
        PATTERNS -->|PERSONAL_INFO| PERSONAL["'Call me X'<br/>Category: PERSONAL_INFO<br/>Scope: global"]
        PATTERNS -->|RELATIONSHIP| REL["'My partner is X'<br/>Category: RELATIONSHIP<br/>Scope: session"]
        PATTERNS -->|PREFERENCE| PREF["'Don't use analogies'<br/>Category: PREFERENCE<br/>Scope: global"]
    end

    subgraph "Memory Storage"
        GLOBAL_MEMORY[Global Memories<br/>Apply to all sessions]
        SESSION_MEMORY[Session Memories<br/>Apply to specific session]
    end

    USER_CREATED --> GLOBAL_MEMORY
    USER_CREATED --> SESSION_MEMORY

    AI_NAME --> AI_SUGGESTED
    LANGUAGE --> AI_SUGGESTED
    COMM --> AI_SUGGESTED
    PERSONAL --> AI_SUGGESTED
    REL --> AI_SUGGESTED
    PREF --> AI_SUGGESTED

    AI_SUGGESTED --> USER_APPROVAL{User Approves?}
    USER_APPROVAL -->|Yes| GLOBAL_MEMORY
    USER_APPROVAL -->|Yes| SESSION_MEMORY
    USER_APPROVAL -->|No| REJECTED[Rejected - logged for analytics]
```

**Memory Detection Gating:**
Memory detection (via the Partner Session Classifier) runs unconditionally on every user message as a fire-and-forget background task. There are no gating conditions -- the classifier processes every message regardless of turn count, emotional intensity, or stage transitions.

**Key Files:**

- `backend/src/services/partner-session-classifier.ts` - Memory detection consolidated into partner session classifier
- `backend/src/services/chat-router/session-processor.ts` - Detection trigger

---

### Context Retrieval Flow

The Universal Context Retriever runs on EVERY message:

```mermaid
graph TD
    START[retrieveContext Called] --> PARALLEL[Parallel Operations]

    subgraph "Parallel Retrieval"
        REF_DETECT[detectReferences<br/>Uses Haiku to detect<br/>references to past content]
        SESSION_HIST[getSessionHistory<br/>Full conversation history<br/>for current session]
        PRE_SESSION[getPreSessionMessages<br/>Unassociated pre-session<br/>messages]
    end

    PARALLEL --> REF_DETECT
    PARALLEL --> SESSION_HIST
    PARALLEL --> PRE_SESSION

    REF_DETECT --> CHECK_NEEDS_RETRIEVAL{needsRetrieval<br/>== true?}

    CHECK_NEEDS_RETRIEVAL -->|Yes| SEMANTIC_SEARCH[Semantic Search]
    CHECK_NEEDS_RETRIEVAL -->|No| SKIP_SEARCH[Skip semantic search]

    subgraph "Semantic Search (if needed)"
        SEARCH_QUERIES[Use searchQueries from<br/>reference detection]
        SEARCH_QUERIES --> CHECK_CROSS_SESSION{Cross-Session<br/>Allowed?}

        CHECK_CROSS_SESSION -->|Yes| SEARCH_ACROSS[searchAcrossSessions<br/>Uses Titan embeddings<br/>Vector similarity search]
        CHECK_CROSS_SESSION -->|No| SKIP_CROSS[Skip cross-session]

        CHECK_CROSS_SESSION -->|Current Session| SEARCH_WITHIN[searchWithinSession<br/>Uses Titan embeddings<br/>Find relevant earlier messages]

        SEARCH_ACROSS --> FILTER[Filter by similarity<br/>threshold & limit]
        SEARCH_WITHIN --> FILTER
    end

    SEMANTIC_SEARCH --> SEARCH_QUERIES
    SKIP_SEARCH --> MERGE[Merge Results]
    FILTER --> MERGE
    SESSION_HIST --> MERGE
    PRE_SESSION --> MERGE

    MERGE --> FORMAT[formatRetrievedContext<br/>Add time context<br/>Natural language]
    FORMAT --> RESULT[RetrievedContext<br/>Ready for prompt injection]
```

**Key Features:**

- **Runs on every message** regardless of stage or intent
- **Parallel operations** for reference detection, history, and pre-session messages
- **Conditional semantic search** only if references detected
- **Stage-aware thresholds** from Memory Intent
- **Data isolation** - only returns user's own messages and AI responses to them

**Key File:** `backend/src/services/context-retriever.ts`

---

## Prompt Construction

### Stage Prompt Building

Prompts are built dynamically based on stage and context:

```mermaid
graph TD
    START[buildStagePrompt Called] --> CHECK_STAGE{Which Stage?}

    CHECK_STAGE -->|Stage 0| CHECK_ONBOARDING{Onboarding?}
    CHECK_ONBOARDING -->|Yes| ONBOARDING_PROMPT[buildOnboardingPrompt<br/>Curiosity Compact review]
    CHECK_ONBOARDING -->|No| CHECK_INVITATION{Invitation Phase?}
    CHECK_INVITATION -->|Yes| INVITATION_PROMPT[buildInvitationPrompt<br/>Craft invitation message]

    CHECK_STAGE -->|Stage 1| WITNESS_PROMPT[buildStage1Prompt<br/>Witnessing mode<br/>Deep listening]

    CHECK_STAGE -->|Stage 2| PERSPECTIVE_PROMPT[buildStage2Prompt<br/>Perspective stretch<br/>Empathy building]

    CHECK_STAGE -->|Stage 3| NEEDS_PROMPT[buildStage3Prompt<br/>What Matters / Self-directed needs<br/>Needs clarity]

    CHECK_STAGE -->|Stage 4| REPAIR_PROMPT[buildStage4Prompt<br/>Strategic repair<br/>Experiments]

    ONBOARDING_PROMPT --> CHECK_TRANSITION
    INVITATION_PROMPT --> CHECK_TRANSITION
    WITNESS_PROMPT --> CHECK_TRANSITION
    PERSPECTIVE_PROMPT --> CHECK_TRANSITION
    NEEDS_PROMPT --> CHECK_TRANSITION
    REPAIR_PROMPT --> CHECK_TRANSITION

    CHECK_TRANSITION{isStageTransition?} -->|Yes| TRANSITION_PROMPT[buildStageTransitionPrompt<br/>Acknowledge previous stage<br/>Introduce new stage]
    CHECK_TRANSITION -->|No| ADD_BASE[Add BASE_SYSTEM_PROMPT]
    TRANSITION_PROMPT --> ADD_BASE

    ADD_BASE --> ADD_CONTEXT[Inject Context Bundle<br/>- Conversation history<br/>- Emotional thread<br/>- Prior themes<br/>- Inner thoughts<br/>- User memories]

    ADD_CONTEXT --> ADD_RETRIEVED[Inject Retrieved Context<br/>- Cross-session messages<br/>- Relevant history<br/>- Detected references]

    ADD_RETRIEVED --> ADD_SURFACING[Add Surfacing Style<br/>silent | tentative | explicit]

    ADD_SURFACING --> FINAL_PROMPT[Final System Prompt<br/>Ready for Sonnet]
```

**Prompt Components:**

1. **BASE_SYSTEM_PROMPT** (always included):
   - `PINNED_CONSTITUTION` (ground rules, safety)
   - `SIMPLE_LANGUAGE_PROMPT` (voice + style)
   - `PRIVACY_GUIDANCE`
   - `PERSPECTIVE_AWARENESS` (neutrality rules for Stages 1–2)
   - Process overview (conditionally included)
   - (`COMMUNICATION_PRINCIPLES` and `MEMORY_GUIDANCE` were removed — Sonnet handles tone natively and the legacy memory-detection-in-prompt feature was deleted.)

2. **Stage-Specific Content:**
   - Stage 1: Witnessing techniques. The Response Protocol exposes these named modes to the model: `WITNESS`, `PERSPECTIVE`, `NEEDS`, `REPAIR`, `ONBOARDING`, `DISPATCH` — the model self-selects per turn.
   - Stage 2: Empathy building, perspective-taking
   - Stage 3: What Matters, no solutions
   - Stage 4: Strategic repair, experiments

3. **Context Injection (Fact-Ledger Order):**
   - **Global facts** (user profile from previous sessions - injected at TOP)
   - Emotional state (intensity, trend)
   - Context bundle (conversation, emotional thread, prior themes)
   - Session summary (for long sessions)
   - Inner Thoughts reflections (if linked)
   - User memories (preferences, names, communication style)
   - **Categorized session facts** (People, Logistics, Conflict, Emotional, History, Process)
   - Retrieved context (cross-session, relevant history)

4. **Surface-Specific Formatting (Slack):**
   When `BuildStagePromptOptions.surface === 'slack'`, `SLACK_FORMATTING_RULES` is appended to the static block. This block instructs the model to use Slack mrkdwn (single `*asterisks*` for bold, `•` for bullets, `<url|label>` for links) instead of standard Markdown. The rules are kept in the static block to preserve prompt caching — they are identical across turns. No other behavior changes: prompt logic, context assembly, and model routing are the same for both surfaces.

   When `PromptContext.invitedSessionNudge` is set (non-null), its content is appended to the dynamic block as `OPERATIONAL NUDGE:`. This signals the AI to weave in an invite-expiry reminder. Only used for Slack-originated `INVITED` sessions approaching their 7-day TTL.

5. **Dynamic Elements:**
   - **Conversation topic** (`topicFrame`) — when the session has a confirmed topic (`topicFrameConfirmedAt` is set), the topic is injected at the top of the dynamic block as `CONVERSATION TOPIC: "{topicFrame}"`. This gives the AI awareness of the agreed-upon topic during stages 1–4.
   - **Stage turn count** (`stageTurnCount`) — counts only messages in the *current stage*, not the session total. This ensures stage-specific guards (e.g. `earlyStage3`, feel-heard timing) fire correctly regardless of how many turns occurred in prior stages.
   - Emotional intensity
   - Surfacing style
   - Stage transition acknowledgments

**Key File:** `backend/src/services/stage-prompts.ts`

---

## Parallel vs Sequential Operations

### Sequential Operations (Must Wait)

```mermaid
graph LR
    A[Memory Intent] -->|Must complete first| B[Context Assembly]
    B -->|Uses intent result| C[Context Retrieval]
    C -->|Uses retrieved context| D[Surfacing Policy]
    D -->|Uses surfacing decision| E[Build Prompt]
    E -->|Uses prompt| F[Sonnet Response]
```

**Why Sequential:**

- Each step depends on the output of the previous step
- Memory Intent determines retrieval depth and thresholds
- Context Assembly uses Memory Intent result
- Prompt building needs all context assembled

---

### Parallel Operations

#### 1. Context Retrieval Parallel Operations

```mermaid
graph TD
    START[retrieveContext] --> PARALLEL[Parallel Execution]

    PARALLEL --> P1[detectReferences<br/>Haiku call]
    PARALLEL --> P2[getSessionHistory<br/>Database query]
    PARALLEL --> P3[getPreSessionMessages<br/>Database query]

    P1 --> WAIT[Wait for all]
    P2 --> WAIT
    P3 --> WAIT

    WAIT --> CONDITIONAL{needsRetrieval?}
    CONDITIONAL -->|Yes| SEMANTIC[Semantic Search<br/>Parallel queries]
    CONDITIONAL -->|No| MERGE[Merge Results]

    SEMANTIC --> MERGE
```

#### 2. Background Classification (Non-Blocking) - Fact-Ledger Architecture

The **Partner Session Classifier** consolidates multiple background Haiku operations into a single call for better latency, cost, and coherence:

```mermaid
graph TD
    START[AI Response Saved] --> CLASSIFIER[runPartnerSessionClassifier<br/>Haiku call<br/>Non-blocking / fire-and-forget]

    CLASSIFIER --> MEMORY[Memory Intent Detection<br/>Detect explicit "remember" requests]
    CLASSIFIER --> FACTS[Categorized Facts Extraction<br/>Update facts by category]
    CLASSIFIER --> TOPIC[Topic Context<br/>What user is discussing]

    MEMORY --> VALID{Memory Valid?}
    VALID -->|Yes| PUBLISH[Create pending memory<br/>Publish via Ably]
    VALID -->|No| LOG[Log rejection reason]

    FACTS --> SAVE_FACTS[Save to UserVessel.notableFacts<br/>JSONB: CategorizedFact[]]

    FACTS --> EMBED[embedSessionContent<br/>Session-level embedding]

    PUBLISH --> RETURN[Return Result<br/>User sees response immediately]
    LOG --> RETURN
    SAVE_FACTS --> RETURN
    EMBED --> RETURN
```

**What Gets Extracted:**

1. **Memory Intent:** Detects explicit "remember" requests (e.g., "remember this", "call me X")
2. **Categorized Notable Facts:** Maintains a curated list of 15-20 facts with categories:
   - **People:** names, roles, relationships (e.g., "daughter Emma is 14")
   - **Logistics:** scheduling, location, practical circumstances
   - **Conflict:** specific disagreements, triggers, patterns
   - **Emotional:** feelings, frustrations, fears, hopes
   - **History:** past events, relationship timeline, backstory
3. **Topic Context:** Brief description of what user is discussing

**Categorized Fact Format:**
```typescript
interface CategorizedFact {
  category: string;  // People, Logistics, Conflict, Emotional, History, Process
  fact: string;      // 1 sentence max
}
```

**Configuration:**

- Runs **after** AI response is sent (fire-and-forget)
- **Non-blocking** - doesn't delay user response
- Uses circuit breaker for Haiku failures (graceful fallback)
- Facts limited to 20 max, consolidated if exceeding
- Facts stored as **JSONB** (not String[])
- **Session-level embedding** triggered after classification

**Key Files:**
- Partner Sessions: `backend/src/services/partner-session-classifier.ts`
- Inner Thoughts: `backend/src/services/background-classifier.ts`

#### 2b. Global Facts Consolidation (Stage Transition)

When a user completes Stage 1 (confirms "Feel Heard"), session facts are consolidated into their global profile:

```mermaid
graph TD
    START[User Confirms Feel Heard] --> CONSOLIDATE[consolidateGlobalFacts<br/>Fire-and-forget]

    CONSOLIDATE --> LOAD_EXISTING[Load User.globalFacts]
    CONSOLIDATE --> LOAD_SESSION[Load UserVessel.notableFacts]

    LOAD_EXISTING --> CHECK{Total > 50?}
    LOAD_SESSION --> CHECK

    CHECK -->|No| SIMPLE_MERGE[Simple concatenation]
    CHECK -->|Yes| HAIKU_MERGE[Haiku consolidation<br/>Deduplicate & prioritize]

    SIMPLE_MERGE --> SAVE[Save to User.globalFacts]
    HAIKU_MERGE --> SAVE
```

**Configuration:**
- **Max global facts:** 50 (~500 tokens)
- **Trigger:** Stage 1 → Stage 2 transition
- **Cost tracking:** `GLOBAL_MEMORY_CONSOLIDATION` call type
- **Key File:** `backend/src/services/global-memory.ts`

#### 3. Message Embedding (Non-Blocking)

```mermaid
graph TD
    START[Message Saved] --> EMBED[embedMessage<br/>Generate Titan embedding]
    EMBED --> SAVE_EMBEDDING[Save to database<br/>Non-blocking]

    START --> CONTINUE[Continue Processing<br/>Don't wait for embedding]
    SAVE_EMBEDDING --> DONE[Embedding Complete<br/>Available for future<br/>semantic search]
```

**Embedding Strategy:**

- User messages: Embedded immediately (async)
- AI messages: Embedded immediately (async)
- Used later for semantic search across sessions
- **Never blocks** the main response flow

#### 4. Conversation Summarization (Non-Blocking)

```mermaid
graph TD
    START[AI Response Saved] --> CHECK{Message Count >= 25?}
    CHECK -->|No| SKIP[Skip Summarization]
    CHECK -->|Yes| CHECK_INTERVAL{Time to<br/>Summarize?}
    CHECK_INTERVAL -->|No| SKIP
    CHECK_INTERVAL -->|Yes| SUMMARIZE[updateSessionSummary<br/>Fire-and-forget]

    SUMMARIZE --> HAIKU[Haiku generates summary]
    HAIKU --> STORE[Store in UserVessel.conversationSummary]
    SKIP --> CONTINUE[Continue - User sees response immediately]
    STORE --> CONTINUE
```

**Summarization Strategy:**

- **Threshold:** Kicks in at 25+ messages (`minMessagesForSummary: 25`)
- **Re-summarize:** Every 25 messages after threshold (`resummaryInterval: 25`)
- **Keeps recent:** Last 15 messages always in full (`recentMessagesToKeep: 15`)
- **Summarizes:** Older messages condensed by Haiku
- **Non-blocking:** Fire-and-forget, doesn't delay response
- **Output:** Summary text, key themes, emotional journey, unresolved topics

**Where Called:**

- `messages.ts` - After AI message saved
- `sessions.ts` - After session message
- `stage2.ts` - After Stage 2 responses
- `session-processor.ts` - After processing
- `session-creation.ts` - After creation

**Key File:** `backend/src/services/conversation-summarizer.ts`

---

## Service-Specific Flows

### 1. Intent Detection (Chat Router)

```mermaid
sequenceDiagram
    participant User
    participant ChatRouter
    participant IntentDetector
    participant Haiku
    participant VectorSearch

    User->>ChatRouter: Message (pre-session)
    ChatRouter->>VectorSearch: Semantic search for similar sessions
    VectorSearch-->>ChatRouter: Semantic matches

    ChatRouter->>IntentDetector: detectIntent()
    IntentDetector->>Haiku: getHaikuJson()<br/>Intent classification
    Haiku-->>IntentDetector: Intent + extracted data

    IntentDetector-->>ChatRouter: IntentDetectionResult
    ChatRouter->>ChatRouter: Route to handler<br/>(CREATE_SESSION, SWITCH_SESSION, etc.)
```

**Key File:** `backend/src/services/chat-router/intent-detector.ts`

---

### 2. Retrieval Planning (Full Depth Only)

```mermaid
sequenceDiagram
    participant Orchestrator
    participant RetrievalPlanner
    participant Haiku
    participant Validator

    Orchestrator->>RetrievalPlanner: planRetrieval()<br/>Only if depth='full'

    RetrievalPlanner->>Haiku: getHaikuJson()<br/>Planning prompt
    Haiku-->>RetrievalPlanner: Raw retrieval plan

    RetrievalPlanner->>Validator: validateRetrievalPlan()
    Validator->>Validator: Schema validation
    Validator->>Validator: Stage contract validation

    Validator-->>RetrievalPlanner: Validated plan
    RetrievalPlanner-->>Orchestrator: RetrievalPlan<br/>(queries array)
```

**Key Features:**

- Only runs when `memoryIntent.depth === 'full'`
- Uses Haiku for fast, structured JSON output
- Validates against stage contracts (what queries are allowed per stage)
- Filters invalid queries before execution

**Key File:** `backend/src/services/retrieval-planner.ts`

---

### 3. Witnessing Service (Pre-Session)

```mermaid
sequenceDiagram
    participant User
    participant Witnessing
    participant ContextRetriever
    participant Sonnet
    participant PersonDetector

    User->>Witnessing: getWitnessingResponse()

    par Parallel Operations
        Witnessing->>ContextRetriever: retrieveContext()<br/>Full awareness
        Witnessing->>PersonDetector: detectPersonAndContext()<br/>Haiku
    end

    ContextRetriever-->>Witnessing: RetrievedContext
    PersonDetector-->>Witnessing: DetectionResult

    Witnessing->>Sonnet: generateWitnessingResponseWithContext()
    Sonnet-->>Witnessing: Response

    Witnessing-->>User: WitnessingResult<br/>+ Session suggestion
```

**Key File:** `backend/src/services/witnessing.ts`

---

### 4. Reconciler Service (Post-Stage 2)

```mermaid
sequenceDiagram
    participant Controller
    participant Reconciler
    participant Sonnet
    participant Database

    Controller->>Reconciler: runReconciler()

    Reconciler->>Database: Get both users'<br/>witnessing content,<br/>notableFacts, Stage 2 hot buffer

    Reconciler->>Sonnet: buildReconcilerPrompt() PromptBlocks<br/>+ evidence packet<br/>Analyze empathy gaps
    Sonnet-->>Reconciler: Analysis (JSON)

    Reconciler->>Reconciler: Extract insights<br/>aUnderstandingB<br/>bUnderstandingA

    Reconciler-->>Controller: ReconcilerResult
```

**Key File:** `backend/src/services/reconciler/` (modular directory: `analysis.ts`, `state.ts`, `sharing.ts`)

---

### Prompt Caching Architecture

The system uses a 2-block architecture for system prompt caching:

1. **Static block** (cached, ~1,024+ tokens): Universal guidance + stage-specific rules that don't change within a stage
2. **Dynamic block** (uncached, ~80-135 tokens): Per-turn context (emotional intensity, turn count, phase guidance)

Plus a message-level breakpoint on the second-to-last conversation message.

**Cache control placement:**
- System block 1: `cache_control: { type: 'ephemeral' }` (Breakpoint 1)
- System block 2: No cache_control (changes every turn)
- Second-to-last message: `cache_control: { type: 'ephemeral' }` (Breakpoint 2)

Streaming responses (`getSonnetStreamingResponse`) also use the same 2-block architecture.

**Key File:** `docs/backend/prompt-caching.md` (detailed strategy)

### Model Routing

The `routeModel()` function in `backend/src/services/model-router.ts` determines which model handles a request based on:
- Task type (classification vs. user-facing response)
- Ambiguity scoring via `scoreAmbiguity()`
- Stage context (some stages always use Sonnet)

**Key File:** `backend/src/services/model-router.ts`

### Token Budget Management

The `buildBudgetedContext()` function in `backend/src/utils/token-budget.ts` manages the token budget:
- Enforces maximum context window size
- Calls `trimConversationHistory()` to truncate older messages when budget exceeded
- Prioritizes: system prompt > recent messages > retrieved context > older history

**Key File:** `backend/src/utils/token-budget.ts`

---

## Summary: Key Decision Points

### 1. Memory Intent (Primary Decider)

**Runs:** FIRST, before any retrieval  
**Purpose:** Determines what kind of remembering is appropriate  
**Output:** `MemoryIntentResult` with intent, depth, thresholds, surface style  
**Used By:** All downstream services (Context Assembler, Context Retriever, Retrieval Planner)

### 2. Surfacing Policy

**Runs:** After context retrieval  
**Purpose:** Determines when/how to surface pattern observations  
**Output:** `SurfacingDecision` with shouldSurface, style, requiresConsent  
**Used By:** Prompt builder (injects surfacing style into prompt)

### 3. Context Retrieval

**Runs:** On EVERY message, regardless of intent  
**Purpose:** Universal awareness of relevant history  
**Output:** `RetrievedContext` with messages, references, summaries  
**Used By:** Prompt builder (injects retrieved context)

### 4. Retrieval Planning

**Runs:** Only when `depth === 'full'`  
**Purpose:** Plans structured data queries  
**Output:** `RetrievalPlan` with validated queries  
**Used By:** (Currently planned but not fully implemented in retrieval execution)

---

## Model Usage Summary

| Service                                 | Model              | Purpose                            | When                               |
| --------------------------------------- | ------------------ | ---------------------------------- | ---------------------------------- |
| Memory Intent                           | None (rules-based) | Determine retrieval strategy       | Every message                      |
| Context Retrieval - Reference Detection | Haiku              | Detect references to past          | Every message (parallel)           |
| Context Retrieval - Semantic Search     | Titan              | Vector similarity search           | When references detected           |
| Retrieval Planning                      | Haiku              | Plan structured queries            | When depth='full'                  |
| Intent Detection                        | Haiku              | Classify user intent               | Pre-session messages               |
| Background Classification               | Haiku              | Memory detection + categorized facts | After every AI response (fire-and-forget) |
| Global Facts Consolidation              | Haiku              | Merge session facts into user profile | Stage 1 → Stage 2 transition       |
| Session Embedding                       | Titan              | Embed session content              | After classification               |
| Conversation Summarization              | Haiku              | Summarize older messages           | When message count >= 25           |
| Response Generation                     | Sonnet             | User-facing responses              | Every message                      |
| Witnessing                              | Sonnet             | Pre-session witnessing             | Pre-session messages               |
| Reconciler                              | Sonnet             | Analyze empathy gaps               | Post-Stage 2                       |
| Needs Extraction                        | Sonnet             | Extract needs from conversation    | Stage 3                            |
| Common Ground                           | Sonnet             | Find common ground                 | Stage 2+                           |

---

## Files Reference

### Core Orchestration

- `backend/src/services/ai-orchestrator.ts` - Main orchestration flow
- `backend/src/services/ai.ts` - AI service wrapper
- `backend/src/lib/bedrock.ts` - Model configuration and client

### Decision Layers

- `backend/src/services/memory-intent.ts` - Primary decider (Memory Intent)
- `backend/src/services/surfacing-policy.ts` - Pattern surfacing decisions

### Context & Retrieval

- `backend/src/services/context-assembler.ts` - Builds context bundles
- `backend/src/services/context-retriever.ts` - Universal context retrieval
- `backend/src/services/retrieval-planner.ts` - Plans structured queries

### Prompt Building

- `backend/src/services/stage-prompts.ts` - Stage-specific prompts

### Memory & Summarization

- `backend/src/services/partner-session-classifier.ts` - Background classification (memory + categorized facts) for partner sessions
- `backend/src/services/background-classifier.ts` - Background classification for Inner Thoughts sessions
- `backend/src/services/global-memory.ts` - Global facts consolidation (cross-session user profile)
- `backend/src/controllers/memories.ts` - Memory CRUD operations
- `backend/src/services/conversation-summarizer.ts` - Rolling conversation summarization
- `backend/src/utils/token-budget.ts` - Token counting and budget management

### Other Services

- `backend/src/services/chat-router/intent-detector.ts` - Intent classification
- `backend/src/services/witnessing.ts` - Pre-session witnessing
- `backend/src/services/reconciler/` - Empathy gap analysis (modular: `analysis.ts`, `state.ts`, `sharing.ts`, `circuit-breaker.ts`)
- `backend/src/services/crisis-detector.ts` - Pattern-based safety detection (additive safety net alongside LLM prompts)
- `backend/src/services/input-sanitizer.ts` - Prompt injection defense (XML delimiters + pattern detection)
- `backend/src/services/needs.ts` - Need extraction + Stage 3 safety-net extraction (`runStage3SafetyNetExtraction`, fires at `stageTurnCount ≥ 6` if no needs identified yet) + shared extraction lock (`isExtractionRunning` / `acquireExtractionLock` / `releaseExtractionLock`)

---

## Conclusion

The backend uses a **decision-first architecture** where:

1. **Memory Intent Layer** acts as the primary decider, running FIRST
2. **Context is pre-assembled** - the AI doesn't decide what to retrieve
3. **Two-model stratification** optimizes cost and speed (Haiku for mechanics, Sonnet for empathy)
4. **Universal context retrieval** ensures awareness on every message
5. **Parallel operations** optimize performance (reference detection, history loading, semantic search)
6. **Non-blocking operations** (embeddings, fact extraction) don't delay responses

The system is designed to be **therapeutically appropriate** - respecting emotional intensity, stage boundaries, and user preferences while maintaining full awareness of relevant history.
