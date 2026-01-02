/**
 * Token Budget Calculator
 *
 * Estimates token usage and helps manage context window size.
 * Uses conservative estimates based on Claude tokenization patterns.
 *
 * Key insight: Average English word ≈ 1.3 tokens
 * Conservative estimate: 4 characters ≈ 1 token
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Model context limits
 * - Sonnet v2: 200k tokens input, but we'll be conservative
 * - For smooth operation, we target staying well under limits
 */
export const MODEL_LIMITS = {
  /** Maximum input tokens we'll use (leaving headroom) */
  maxInputTokens: 150_000,

  /** Reserved for system prompt */
  systemPromptBudget: 4_000,

  /** Reserved for AI response */
  outputReservation: 4_000,

  /** Target max for context injection */
  contextBudget: 100_000,
};

/**
 * Recommended limits per context type.
 * These are designed to balance relevance vs. token cost.
 */
export const CONTEXT_LIMITS = {
  /** Maximum recent conversation messages to include */
  maxConversationMessages: 50,

  /** Maximum characters per conversation message */
  maxMessageLength: 2_000,

  /** Maximum messages from other sessions (via embedding retrieval) */
  maxCrossSessionMessages: 10,

  /** Maximum messages from earlier in current session (via retrieval) */
  maxCurrentSessionRetrieved: 5,

  /** Maximum pre-session messages */
  maxPreSessionMessages: 10,
};

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for a string.
 * Uses conservative heuristic: ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Conservative: 4 chars/token. Actual is usually 3.5-4.5 depending on content.
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a message array.
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>
): number {
  let tokens = 0;
  for (const msg of messages) {
    // Add overhead for role markup (~4 tokens per message)
    tokens += 4;
    tokens += estimateTokens(msg.content);
  }
  return tokens;
}

// ============================================================================
// Context Budget Management
// ============================================================================

export interface ContextBudget {
  totalAvailable: number;
  systemPrompt: number;
  conversationHistory: number;
  retrievedContext: number;
  remaining: number;
}

export interface BudgetedContext {
  /** Messages to include in conversation history */
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>;

  /** Retrieved context (formatted string) */
  retrievedContext: string;

  /** Tokens used by conversation history */
  conversationTokens: number;

  /** Tokens used by retrieved context */
  retrievedTokens: number;

  /** Total tokens used */
  totalTokens: number;

  /** Messages that were truncated/excluded */
  truncated: number;
}

/**
 * Calculate how many messages from conversation history to include.
 *
 * Strategy:
 * - Always include at least the last 4 messages for context continuity
 * - Include more if budget allows
 * - Prioritize recent messages
 */
export function calculateMessageBudget(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  minMessages: number = 4
): { included: number; tokens: number } {
  if (messages.length === 0) {
    return { included: 0, tokens: 0 };
  }

  // Start from the most recent and work backwards
  let tokens = 0;
  let included = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content) + 4; // +4 for role overhead

    // Always include minimum messages, even if over budget
    if (included < minMessages) {
      tokens += msgTokens;
      included++;
      continue;
    }

    // For additional messages, check if we have budget
    if (tokens + msgTokens <= maxTokens) {
      tokens += msgTokens;
      included++;
    } else {
      break; // No more budget
    }
  }

  return { included, tokens };
}

/**
 * Build context within token budget.
 *
 * Priority order:
 * 1. Recent conversation (last N messages) - HIGHEST
 * 2. Pre-session messages (if not in a session)
 * 3. Retrieved messages from current session
 * 4. Retrieved messages from other sessions - LOWEST
 *
 * @param systemPrompt - The system prompt being used
 * @param conversationHistory - Full conversation history
 * @param retrievedContext - Formatted retrieved context string
 * @param maxTotalTokens - Maximum tokens to use (default: MODEL_LIMITS.contextBudget)
 */
export function buildBudgetedContext<T extends { role: 'user' | 'assistant'; content: string }>(
  systemPrompt: string,
  conversationHistory: T[],
  retrievedContext: string,
  maxTotalTokens: number = MODEL_LIMITS.contextBudget
): BudgetedContext {
  const systemTokens = estimateTokens(systemPrompt);
  const availableForContext = maxTotalTokens - systemTokens - MODEL_LIMITS.outputReservation;

  // Allocate 70% to conversation, 30% to retrieved context
  // Conversation is more important for continuity
  const conversationBudget = Math.floor(availableForContext * 0.7);
  const retrievedBudget = Math.floor(availableForContext * 0.3);

  // Calculate conversation messages to include
  const conversationPlan = calculateMessageBudget(conversationHistory, conversationBudget);
  const includedMessages = conversationHistory.slice(-conversationPlan.included);

  // Truncate retrieved context if needed
  let finalRetrievedContext = retrievedContext;
  let retrievedTokens = estimateTokens(retrievedContext);

  if (retrievedTokens > retrievedBudget) {
    // Truncate retrieved context to fit budget
    const maxChars = retrievedBudget * 4; // Rough character limit
    finalRetrievedContext = truncateContextIntelligently(retrievedContext, maxChars);
    retrievedTokens = estimateTokens(finalRetrievedContext);
  }

  return {
    conversationMessages: includedMessages,
    retrievedContext: finalRetrievedContext,
    conversationTokens: conversationPlan.tokens,
    retrievedTokens,
    totalTokens: systemTokens + conversationPlan.tokens + retrievedTokens,
    truncated: conversationHistory.length - conversationPlan.included,
  };
}

/**
 * Truncate context string intelligently, trying to preserve complete sections.
 */
function truncateContextIntelligently(context: string, maxChars: number): string {
  if (context.length <= maxChars) {
    return context;
  }

  // Try to break at section boundaries (=== headers)
  const sections = context.split(/(?=^===)/m);

  let result = '';
  for (const section of sections) {
    if (result.length + section.length <= maxChars) {
      result += section;
    } else if (result.length === 0) {
      // First section is too long, truncate it
      result = section.slice(0, maxChars - 50) + '\n[...truncated for length]';
      break;
    } else {
      // Add truncation notice
      result += '\n[...additional context truncated for length]';
      break;
    }
  }

  return result;
}

// ============================================================================
// Recommendations
// ============================================================================

/**
 * Get recommended limits based on current usage patterns.
 *
 * These are evidence-based recommendations:
 * - Conversation: 20-30 messages gives great context without bloat
 * - Cross-session: 5-10 semantically similar messages is usually enough
 * - Pre-session: 5-10 messages captures recent routing context
 */
export function getRecommendedLimits(): {
  conversationMessages: { min: number; recommended: number; max: number };
  crossSessionMessages: { min: number; recommended: number; max: number };
  currentSessionRetrieved: { min: number; recommended: number; max: number };
  preSessionMessages: { min: number; recommended: number; max: number };
  rationale: string;
} {
  return {
    conversationMessages: {
      min: 4,
      recommended: 20,
      max: 50,
    },
    crossSessionMessages: {
      min: 3,
      recommended: 5,
      max: 10,
    },
    currentSessionRetrieved: {
      min: 3,
      recommended: 5,
      max: 10,
    },
    preSessionMessages: {
      min: 3,
      recommended: 5,
      max: 10,
    },
    rationale: `
CONVERSATION HISTORY (20 recommended, max 50):
- Most recent messages are critical for maintaining conversational flow
- 20 messages (~10 turns) gives excellent context for emotional continuity
- Beyond 30-40, diminishing returns on relevance
- Always include at least 4 for basic turn continuity

CROSS-SESSION RETRIEVAL (5 recommended, max 10):
- These are semantically similar, so quality > quantity
- 5 high-similarity matches usually capture key patterns
- More risks injecting tangentially related but distracting content
- Stage-dependent: Stage 1 uses 0-3, Stage 3-4 uses up to 10

CURRENT SESSION RETRIEVAL (5 recommended):
- Catches relevant earlier content not in recent window
- Helpful for long sessions where early context matters
- 5 is usually enough since it's topically focused

PRE-SESSION MESSAGES (5 recommended, max 10):
- Captures routing context before session assignment
- Important for invitation phase and session discovery
- Expires after 24h so usually small set
    `.trim(),
  };
}
