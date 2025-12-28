/**
 * AI Service
 *
 * Provides AI-powered responses for the BeHeard process.
 * Uses AWS Bedrock Converse API with Claude for witnessing conversations in Stage 1.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
  type InferenceConfiguration,
} from '@aws-sdk/client-bedrock-runtime';

// ============================================================================
// Types
// ============================================================================

export interface WitnessContext {
  userName: string;
  sessionContext?: string;
  turnCount: number;
  emotionalIntensity?: number;
  priorThemes?: string[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIConfig {
  /** Maximum tokens for thinking/reasoning (default: 1024) */
  thinkingBudget?: number;
  /** Maximum tokens for response (default: 1024) */
  maxTokens?: number;
}

// ============================================================================
// Configuration
// ============================================================================

const MODEL_ID = 'anthropic.claude-sonnet-4-20250514-v1:0';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_THINKING_BUDGET = 1024;

/**
 * Get Bedrock client singleton.
 * Returns null if AWS credentials are not configured.
 * Reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION from environment.
 */
function getBedrockClient(): BedrockRuntimeClient | null {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('[AI Service] AWS credentials not configured - using mock responses');
    return null;
  }
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

// Lazy-initialized client
let bedrockClient: BedrockRuntimeClient | null | undefined;

function getClient(): BedrockRuntimeClient | null {
  if (bedrockClient === undefined) {
    bedrockClient = getBedrockClient();
  }
  return bedrockClient;
}

/**
 * Reset the client (useful for testing)
 */
export function resetAIClient(): void {
  bedrockClient = undefined;
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Builds the system prompt for the Witness stage.
 * See docs/mvp-planning/plans/backend/prompts/stage-1-witnessing.md
 */
function buildWitnessSystemPrompt(context: WitnessContext): string {
  const witnessOnlyMode = context.turnCount < 3 || (context.emotionalIntensity ?? 0) >= 8;

  return `You are BeHeard, a Process Guardian in the Witness stage. Your job is to help ${context.userName} feel fully and deeply heard.

YOU HAVE TWO MODES:

WITNESS MODE (Default)
- Listen more than you speak
- Reflect back with accuracy and empathy
- Validate their experience
- Never offer solutions, reframes, or interpretations
- Stay present with whatever they share

INSIGHT MODE (Unlocked after trust is earned)
- 80% reflection, 20% gentle insight
- You may name patterns ("You have mentioned feeling unseen several times")
- You may offer reframes ("What you are calling controlling might be fear of losing connection")
- You may articulate what they have not said yet ("It sounds like underneath the anger there might be grief")
- Insights must be tentative, not declarative

${witnessOnlyMode ? 'IMPORTANT: You are in the first few exchanges or emotional intensity is high. Stay in WITNESS MODE regardless of your analysis. Trust must be earned through presence first.' : ''}

BEFORE EVERY RESPONSE, you must output your thinking in <analysis> tags:

<analysis>
1. Emotional state: [What is the user feeling? How intense?]
2. Green lights: [Signs of trust - "yes exactly", vulnerability, longer shares, settling in]
3. Red lights: [Signs to stay cautious - defensive, correcting you, short responses, still heated]
4. Mode decision: [WITNESS or INSIGHT? Why?]
5. If INSIGHT: What specific insight might serve them? Is it earned?
</analysis>

GREEN LIGHT EXAMPLES (trust signals):
- User affirms your reflection ("Yes, that is exactly it")
- User goes deeper after your reflection
- User shares something vulnerable or specific
- User's tone softens
- User asks you a question

RED LIGHT EXAMPLES (stay in witness):
- User corrects your reflection ("No, that is not what I meant")
- User is defensive or dismissive
- User gives short, clipped responses
- User is escalating, not settling
- User is still in pure venting mode

REFLECTION TECHNIQUES (both modes):
- Paraphrase: "So what I hear is..."
- Emotion naming: "It sounds like there is a lot of frustration there..."
- Validation: "That sounds really difficult..."
- Gentle probing: "Can you tell me more about..."
- Summarizing: "Let me see if I can capture what you have shared..."

INSIGHT TECHNIQUES (INSIGHT MODE only, and tentatively):
- Pattern recognition: "I notice you have mentioned X several times..."
- Reframing: "I wonder if what feels like X might also be Y..."
- Naming unspoken emotions: "I sense some sadness beneath the anger..." (ONLY name emotions, never guess at unstated events, beliefs, or content)
- Holding complexity: "It sounds like two things are true at once..."

WHAT TO ALWAYS AVOID:
- "Have you tried..." (no solutions)
- "Maybe they..." (no partner perspective yet)
- "You should..." (no advice)
- "At least..." (no minimizing)
- Insights delivered as facts rather than offerings
- Moving too quickly to "what do you need"

EMOTIONAL INTENSITY:
Current reading: ${context.emotionalIntensity ?? 'unknown'}/10
${(context.emotionalIntensity ?? 0) >= 8 ? 'User is at high intensity. Stay in WITNESS MODE. Validate heavily. This is not the moment for insight.' : ''}

Turn number: ${context.turnCount}

${context.priorThemes?.length ? `From prior sessions: ${context.priorThemes.join(', ')}\n(Use for continuity only - do not force connections)` : ''}

CRITICAL: After your <analysis>, provide your response to the user. Do NOT include the analysis tags in what the user sees - they will be stripped before delivery.`;
}

// ============================================================================
// AI Response Functions
// ============================================================================

/**
 * Convert our message format to Bedrock Converse API format
 */
function toBedrockMessages(messages: ConversationMessage[]): Message[] {
  return messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));
}

/**
 * Get a witness response from the AI for Stage 1 conversations.
 *
 * @param messages - The conversation history
 * @param context - Context about the user and session
 * @param config - Optional AI configuration (thinking budget, max tokens)
 * @returns The AI's response text
 */
export async function getWitnessResponse(
  messages: ConversationMessage[],
  context: WitnessContext,
  config?: AIConfig
): Promise<string> {
  const client = getClient();

  if (!client) {
    // Mock response for development without API key
    return getMockWitnessResponse(messages, context);
  }

  try {
    const systemPrompt = buildWitnessSystemPrompt(context);
    const maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const thinkingBudget = config?.thinkingBudget ?? DEFAULT_THINKING_BUDGET;

    // Build system content blocks
    const system: SystemContentBlock[] = [{ text: systemPrompt }];

    // Build inference configuration
    const inferenceConfig: InferenceConfiguration = {
      maxTokens,
    };

    // Build the Converse command with thinking budget
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: toBedrockMessages(messages),
      system,
      inferenceConfig,
      // Configure extended thinking via additional model fields
      additionalModelRequestFields: {
        thinking: {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        },
      },
    });

    const response = await client.send(command);

    // Extract text content from response
    const outputMessage = response.output?.message;
    if (!outputMessage?.content) {
      console.error('[AI Service] No content in response');
      return getMockWitnessResponse(messages, context);
    }

    // Find the text block in the response (skip thinking blocks)
    const textBlock = outputMessage.content.find((block) => 'text' in block);
    if (!textBlock || !('text' in textBlock)) {
      console.error('[AI Service] No text content in response');
      return getMockWitnessResponse(messages, context);
    }

    // Strip analysis tags before returning
    return stripAnalysisTags(textBlock.text ?? '');
  } catch (error) {
    console.error('[AI Service] Error getting witness response:', error);
    // Fall back to mock response on error
    return getMockWitnessResponse(messages, context);
  }
}

/**
 * Strip <analysis> tags from AI response.
 * The analysis is for internal processing and should not be shown to users.
 */
function stripAnalysisTags(response: string): string {
  // Remove analysis tags and their content
  const stripped = response.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
  return stripped || response; // Return original if stripping resulted in empty string
}

/**
 * Mock witness response for development without API key.
 */
function getMockWitnessResponse(
  messages: ConversationMessage[],
  context: WitnessContext
): string {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return `Hello ${context.userName}. I'm here to listen and help you feel heard. What's on your mind?`;
  }

  // Simple mock responses based on turn count
  const turnCount = context.turnCount;

  if (turnCount <= 2) {
    return `Thank you for sharing that with me, ${context.userName}. It sounds like this has been weighing on you. I'm here to listen - can you tell me more about what you're experiencing?`;
  }

  if (turnCount <= 4) {
    return `I hear you. It sounds like there's a lot of frustration there, and that makes complete sense given what you've described. What feels most important for me to understand right now?`;
  }

  return `I really appreciate you opening up about this. What you're describing - feeling unheard and unseen - is deeply painful. I want you to know that your feelings are valid, and I'm fully present with you here.`;
}

// ============================================================================
// AI Service Health Check
// ============================================================================

/**
 * Check if the AI service is properly configured and accessible.
 */
export async function checkAIServiceHealth(): Promise<{
  configured: boolean;
  accessible: boolean;
  error?: string;
}> {
  const client = getClient();

  if (!client) {
    return {
      configured: false,
      accessible: false,
      error: 'AWS credentials not configured',
    };
  }

  try {
    // Make a minimal API call to verify connectivity
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      inferenceConfig: { maxTokens: 10 },
    });

    await client.send(command);

    return {
      configured: true,
      accessible: true,
    };
  } catch (error) {
    return {
      configured: true,
      accessible: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
