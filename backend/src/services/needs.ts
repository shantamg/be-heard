/**
 * Needs Service
 *
 * Provides AI-powered need extraction and common ground analysis for Stage 3.
 * Uses AWS Bedrock with Claude to analyze conversation history and identify needs.
 */

import { getCompletion, resetBedrockClient } from '../lib/bedrock';
import { prisma } from '../lib/prisma';
import { NeedCategory } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedNeed {
  category: NeedCategory;
  need: string;
  evidence: string[];
  aiConfidence: number;
}

export interface IdentifiedNeedRecord {
  id: string;
  vesselId: string;
  need: string;
  category: NeedCategory;
  evidence: string[];
  aiConfidence: number;
  confirmed: boolean;
  createdAt: Date;
}

export interface CommonGroundRecord {
  id: string;
  sharedVesselId: string;
  need: string;
  category: NeedCategory;
  confirmedByA: boolean;
  confirmedByB: boolean;
  confirmedAt: Date | null;
}

// ============================================================================
// Configuration
// ============================================================================

const MAX_TOKENS = 2048;

/**
 * Reset the client (useful for testing)
 */
export function resetNeedsClient(): void {
  resetBedrockClient();
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Builds the system prompt for need extraction.
 */
function buildNeedExtractionPrompt(): string {
  return `You are an expert at identifying underlying human needs from conversations about relationship conflicts.

Your task is to analyze a conversation and identify the core needs being expressed by the speaker.

Use these need categories:
- SAFETY: Need for security, stability, predictability, trust
- CONNECTION: Need for closeness, intimacy, belonging, acceptance
- AUTONOMY: Need for independence, choice, self-determination
- RECOGNITION: Need to be seen, valued, appreciated, understood
- MEANING: Need for purpose, contribution, growth
- FAIRNESS: Need for equity, reciprocity, justice

For each need you identify:
1. Choose the most appropriate category
2. Write a clear, concise need name (e.g., "To feel emotionally safe")
3. Provide 1-2 direct quotes from the conversation as evidence
4. Rate your confidence (0.0-1.0) based on how clearly the need was expressed

Output your analysis as JSON in this exact format:
{
  "needs": [
    {
      "category": "CATEGORY_NAME",
      "need": "Clear, concise need statement",
      "evidence": ["Quote 1", "Quote 2"],
      "aiConfidence": 0.85
    }
  ]
}

Important guidelines:
- Focus on underlying needs, not surface-level wants or complaints
- Identify 2-5 core needs (not too many, not too few)
- Use empathetic, non-judgmental language
- Base confidence on clarity of expression, not importance of need
- Only include needs clearly supported by the conversation`;
}

/**
 * Builds the system prompt for common ground analysis.
 */
function buildCommonGroundPrompt(): string {
  return `You are an expert at finding shared needs between two people in conflict.

You will receive two sets of identified needs - one from each partner. Your task is to find:
1. Needs that are directly shared (same category and similar description)
2. Needs that are complementary (different expression but same underlying desire)
3. Needs that could be bridge points for understanding

For each piece of common ground you identify:
1. Choose the category that best represents the shared need
2. Write a need statement that honors both perspectives
3. Explain briefly how this is shared

Output your analysis as JSON in this exact format:
{
  "commonGround": [
    {
      "category": "CATEGORY_NAME",
      "need": "Need statement that honors both perspectives",
      "insight": "Brief explanation of how this is shared"
    }
  ]
}

Important guidelines:
- Look for what unites, not what divides
- Reframe in ways that both partners can recognize themselves
- Identify 2-4 pieces of common ground
- Focus on genuine overlap, not forced connections
- Use language that feels fair to both partners`;
}

// ============================================================================
// AI Service Functions
// ============================================================================

/**
 * Extract needs from a user's conversation history in a session.
 *
 * @param sessionId - The session ID
 * @param userId - The user ID whose needs to extract
 * @returns Array of identified needs saved to database
 */
export async function extractNeedsFromConversation(
  sessionId: string,
  userId: string
): Promise<IdentifiedNeedRecord[]> {
  // Get or create user's vessel for this session
  let userVessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: {
        userId,
        sessionId,
      },
    },
  });

  if (!userVessel) {
    userVessel = await prisma.userVessel.create({
      data: {
        userId,
        sessionId,
      },
    });
  }

  // Get the user's conversation history from stages 1-2 (data isolation)
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      OR: [
        { senderId: userId },
        { role: 'AI', forUserId: userId },
      ],
      stage: { in: [1, 2] },
    },
    orderBy: { timestamp: 'asc' },
  });

  if (messages.length === 0) {
    return [];
  }

  // Format conversation for AI
  const conversationText = messages
    .map((m) => `${m.role === 'USER' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n\n');

  let extractedNeeds: ExtractedNeed[];

  try {
    const response = await getCompletion({
      systemPrompt: buildNeedExtractionPrompt(),
      messages: [
        {
          role: 'user',
          content: `Please analyze this conversation and identify the speaker's underlying needs:\n\n${conversationText}`,
        },
      ],
      maxTokens: MAX_TOKENS,
    });

    if (!response) {
      // Mock response for development without API key
      extractedNeeds = getMockExtractedNeeds();
    } else {
      extractedNeeds = parseNeedsResponse(response);
    }
  } catch (error) {
    console.error('[Needs Service] Error extracting needs:', error);
    extractedNeeds = getMockExtractedNeeds();
  }

  // Save needs to database
  const savedNeeds: IdentifiedNeedRecord[] = [];
  for (const need of extractedNeeds) {
    const saved = await prisma.identifiedNeed.create({
      data: {
        vesselId: userVessel.id,
        need: need.need,
        category: need.category,
        evidence: need.evidence,
        aiConfidence: need.aiConfidence,
        confirmed: false,
      },
    });
    savedNeeds.push(saved as IdentifiedNeedRecord);
  }

  return savedNeeds;
}

/**
 * Find common ground between two partners' needs.
 *
 * @param sessionId - The session ID
 * @param user1Id - First user's ID
 * @param user2Id - Second user's ID
 * @returns Array of common ground records saved to database
 */
export async function findCommonGround(
  sessionId: string,
  user1Id: string,
  user2Id: string
): Promise<CommonGroundRecord[]> {
  // Get or create shared vessel
  let sharedVessel = await prisma.sharedVessel.findUnique({
    where: { sessionId },
  });

  if (!sharedVessel) {
    sharedVessel = await prisma.sharedVessel.create({
      data: { sessionId },
    });
  }

  // Get user vessels
  const [user1Vessel, user2Vessel] = await Promise.all([
    prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId: user1Id, sessionId } },
    }),
    prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId: user2Id, sessionId } },
    }),
  ]);

  if (!user1Vessel || !user2Vessel) {
    return [];
  }

  // Get confirmed needs for both users
  const [user1Needs, user2Needs] = await Promise.all([
    prisma.identifiedNeed.findMany({
      where: { vesselId: user1Vessel.id, confirmed: true },
    }),
    prisma.identifiedNeed.findMany({
      where: { vesselId: user2Vessel.id, confirmed: true },
    }),
  ]);

  if (user1Needs.length === 0 || user2Needs.length === 0) {
    return [];
  }

  // Format needs for AI
  const user1NeedsText = user1Needs
    .map((n) => `- ${n.category}: ${n.need}`)
    .join('\n');
  const user2NeedsText = user2Needs
    .map((n) => `- ${n.category}: ${n.need}`)
    .join('\n');

  let commonGroundItems: Array<{ category: NeedCategory; need: string; insight: string }>;

  try {
    const response = await getCompletion({
      systemPrompt: buildCommonGroundPrompt(),
      messages: [
        {
          role: 'user',
          content: `Partner 1's needs:\n${user1NeedsText}\n\nPartner 2's needs:\n${user2NeedsText}\n\nPlease identify common ground between these partners.`,
        },
      ],
      maxTokens: MAX_TOKENS,
    });

    if (!response) {
      // Mock response for development without API key
      commonGroundItems = getMockCommonGround();
    } else {
      commonGroundItems = parseCommonGroundResponse(response);
    }
  } catch (error) {
    console.error('[Needs Service] Error finding common ground:', error);
    commonGroundItems = getMockCommonGround();
  }

  // Save common ground to database
  const savedCommonGround: CommonGroundRecord[] = [];
  for (const item of commonGroundItems) {
    const saved = await prisma.commonGround.create({
      data: {
        sharedVesselId: sharedVessel.id,
        need: item.need,
        category: item.category,
        confirmedByA: false,
        confirmedByB: false,
      },
    });
    savedCommonGround.push(saved as CommonGroundRecord);
  }

  return savedCommonGround;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the AI response for need extraction.
 */
function parseNeedsResponse(response: string): ExtractedNeed[] {
  try {
    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Needs Service] No JSON found in response');
      return getMockExtractedNeeds();
    }

    const parsed = JSON.parse(jsonMatch[0]) as { needs: ExtractedNeed[] };
    if (!Array.isArray(parsed.needs)) {
      return getMockExtractedNeeds();
    }

    // Validate and normalize needs
    return parsed.needs
      .filter((n) => n.category && n.need)
      .map((n) => ({
        category: validateCategory(n.category),
        need: n.need,
        evidence: Array.isArray(n.evidence) ? n.evidence : [],
        aiConfidence: typeof n.aiConfidence === 'number' ? Math.min(1, Math.max(0, n.aiConfidence)) : 0.7,
      }));
  } catch (error) {
    console.error('[Needs Service] Error parsing needs response:', error);
    return getMockExtractedNeeds();
  }
}

/**
 * Parse the AI response for common ground analysis.
 */
function parseCommonGroundResponse(
  response: string
): Array<{ category: NeedCategory; need: string; insight: string }> {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Needs Service] No JSON found in common ground response');
      return getMockCommonGround();
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      commonGround: Array<{ category: string; need: string; insight?: string }>;
    };
    if (!Array.isArray(parsed.commonGround)) {
      return getMockCommonGround();
    }

    return parsed.commonGround
      .filter((c) => c.category && c.need)
      .map((c) => ({
        category: validateCategory(c.category),
        need: c.need,
        insight: c.insight || '',
      }));
  } catch (error) {
    console.error('[Needs Service] Error parsing common ground response:', error);
    return getMockCommonGround();
  }
}

/**
 * Validate and normalize a need category.
 */
function validateCategory(category: string): NeedCategory {
  const upperCategory = category.toUpperCase();
  if (Object.values(NeedCategory).includes(upperCategory as NeedCategory)) {
    return upperCategory as NeedCategory;
  }
  return NeedCategory.CONNECTION; // Default fallback
}

// ============================================================================
// Mock Responses
// ============================================================================

/**
 * Mock extracted needs for development without API key.
 */
function getMockExtractedNeeds(): ExtractedNeed[] {
  return [
    {
      category: NeedCategory.CONNECTION,
      need: 'To feel emotionally connected and understood by partner',
      evidence: ['I just want to feel like we are on the same team'],
      aiConfidence: 0.85,
    },
    {
      category: NeedCategory.RECOGNITION,
      need: 'To have efforts and contributions acknowledged',
      evidence: ['It feels like nothing I do is ever enough'],
      aiConfidence: 0.78,
    },
    {
      category: NeedCategory.SAFETY,
      need: 'To feel safe expressing feelings without judgment',
      evidence: ['I am afraid to bring things up because it always turns into a fight'],
      aiConfidence: 0.82,
    },
  ];
}

/**
 * Mock common ground for development without API key.
 */
function getMockCommonGround(): Array<{ category: NeedCategory; need: string; insight: string }> {
  return [
    {
      category: NeedCategory.CONNECTION,
      need: 'Both partners deeply value emotional connection and want to feel like a team',
      insight: 'While expressed differently, both partners are seeking the same underlying closeness',
    },
    {
      category: NeedCategory.SAFETY,
      need: 'Both need to feel safe being vulnerable in conversations',
      insight: 'The fear of conflict is shared - both want discussions to feel constructive',
    },
  ];
}
