/**
 * Intent Detector Tests
 *
 * Tests for the chat router intent detection system.
 */

import { ChatIntent } from '@meet-without-fear/shared';

// Mock the bedrock module before imports
jest.mock('../../../lib/bedrock', () => ({
  getHaikuJson: jest.fn(),
}));

// Mock the registry to avoid interference
jest.mock('../registry', () => ({
  handlerRegistry: {
    getDetectionHints: jest.fn().mockReturnValue([]),
    getPlugins: jest.fn().mockReturnValue([]),
  },
}));

import { detectIntent, DetectionInput } from '../intent-detector';
import { getHaikuJson } from '../../../lib/bedrock';
import { handlerRegistry } from '../registry';

const mockGetHaikuJson = getHaikuJson as jest.Mock;

describe('Intent Detector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset plugins to empty for each test
    (handlerRegistry.getPlugins as jest.Mock).mockReturnValue([]);
  });

  describe('detectIntent', () => {
    const baseInput: DetectionInput = {
      message: 'Test message',
      hasActiveSession: false,
    };

    it('detects CREATE_SESSION intent with person info', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'CREATE_SESSION',
        confidence: 'high',
        person: {
          firstName: 'John',
          lastName: 'Doe',
          contactInfo: { type: 'email', value: 'john@example.com' },
        },
        sessionContext: {
          topic: 'budget discussion',
          emotionalTone: 'anxious',
        },
      });

      const result = await detectIntent({
        ...baseInput,
        message: 'I need to talk to John Doe about our budget, his email is john@example.com',
      });

      expect(result.intent).toBe(ChatIntent.CREATE_SESSION);
      expect(result.confidence).toBe('high');
      expect(result.person).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        contactInfo: { type: 'email', value: 'john@example.com' },
      });
      expect(result.sessionContext?.topic).toBe('budget discussion');
    });

    it('detects CREATE_SESSION with missing contact info', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'CREATE_SESSION',
        confidence: 'high',
        person: {
          firstName: 'Sarah',
          lastName: null,
          contactInfo: null,
        },
        missingInfo: [
          {
            field: 'email',
            required: true,
            promptText: "What's Sarah's email address?",
          },
        ],
        followUpQuestion: "What's Sarah's email so I can send her an invitation?",
      });

      const result = await detectIntent({
        ...baseInput,
        message: 'I want to start a session with Sarah',
      });

      expect(result.intent).toBe(ChatIntent.CREATE_SESSION);
      expect(result.person?.firstName).toBe('Sarah');
      expect(result.missingInfo).toHaveLength(1);
      expect(result.missingInfo![0].field).toBe('email');
      expect(result.followUpQuestion).toContain("Sarah's email");
    });

    it('detects CONTINUE_CONVERSATION when in active session', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'CONTINUE_CONVERSATION',
        confidence: 'high',
        sessionContext: {
          emotionalTone: 'upset',
        },
      });

      const result = await detectIntent({
        message: 'I feel really hurt when he ignores me',
        hasActiveSession: true,
        activeSessionPartnerName: 'John',
      });

      expect(result.intent).toBe(ChatIntent.CONTINUE_CONVERSATION);
    });

    it('detects LIST_SESSIONS intent', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'LIST_SESSIONS',
        confidence: 'high',
      });

      const result = await detectIntent({
        ...baseInput,
        message: 'Show me my sessions',
      });

      expect(result.intent).toBe(ChatIntent.LIST_SESSIONS);
    });

    it('detects HELP intent', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'HELP',
        confidence: 'high',
      });

      const result = await detectIntent({
        ...baseInput,
        message: 'How does this work?',
      });

      expect(result.intent).toBe(ChatIntent.HELP);
    });

    it('detects SWITCH_SESSION intent', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'SWITCH_SESSION',
        confidence: 'medium',
        person: {
          firstName: 'Sarah',
        },
      });

      const result = await detectIntent({
        message: 'Let me switch to my session with Sarah',
        hasActiveSession: true,
        activeSessionPartnerName: 'John',
      });

      expect(result.intent).toBe(ChatIntent.SWITCH_SESSION);
    });

    it('returns UNKNOWN for ambiguous messages', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'UNKNOWN',
        confidence: 'low',
        followUpQuestion: "I'm not sure what you mean. Can you tell me more?",
      });

      const result = await detectIntent({
        ...baseInput,
        message: 'hmm okay',
      });

      expect(result.intent).toBe(ChatIntent.UNKNOWN);
      expect(result.confidence).toBe('low');
    });

    it('includes context info in the prompt', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'CONTINUE_CONVERSATION',
        confidence: 'high',
      });

      await detectIntent({
        message: 'Yes, I want to talk about that',
        hasActiveSession: true,
        activeSessionPartnerName: 'Alice',
        recentMessages: [
          { role: 'assistant', content: 'How did that make you feel?' },
          { role: 'user', content: 'I felt ignored' },
        ],
      });

      // Verify context was included in the call
      expect(mockGetHaikuJson).toHaveBeenCalled();
      const callArgs = mockGetHaikuJson.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('Alice');
    });

    it('includes pending state context', async () => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'CREATE_SESSION',
        confidence: 'high',
        person: {
          firstName: 'John',
          contactInfo: { type: 'email', value: 'john@test.com' },
        },
      });

      await detectIntent({
        message: 'john@test.com',
        hasActiveSession: false,
        pendingState: {
          type: 'session_creation',
          data: {
            step: 'GATHERING_CONTACT',
            person: { firstName: 'John' },
          },
        },
      });

      // Verify pending state was included
      const callArgs = mockGetHaikuJson.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('session_creation');
    });
  });

  describe('fallback behavior', () => {
    it('returns fallback result when AI unavailable', async () => {
      mockGetHaikuJson.mockResolvedValue(null);

      const result = await detectIntent({
        message: 'Test message',
        hasActiveSession: false,
      });

      expect(result.intent).toBe(ChatIntent.UNKNOWN);
      expect(result.confidence).toBe('low');
      expect(result.followUpQuestion).toBeDefined();
    });

    it('fallback detects help keywords', async () => {
      mockGetHaikuJson.mockResolvedValue(null);

      const result = await detectIntent({
        message: 'How do I use this app?',
        hasActiveSession: false,
      });

      expect(result.intent).toBe(ChatIntent.HELP);
    });

    it('fallback detects list sessions keywords', async () => {
      mockGetHaikuJson.mockResolvedValue(null);

      const result = await detectIntent({
        message: 'show me my sessions',
        hasActiveSession: false,
      });

      expect(result.intent).toBe(ChatIntent.LIST_SESSIONS);
    });

    it('fallback continues conversation when in session', async () => {
      mockGetHaikuJson.mockResolvedValue(null);

      const result = await detectIntent({
        message: 'I understand what you mean',
        hasActiveSession: true,
        activeSessionPartnerName: 'John',
      });

      expect(result.intent).toBe(ChatIntent.CONTINUE_CONVERSATION);
    });
  });

  describe('plugin integration', () => {
    it('runs postProcess on all plugins', async () => {
      const mockPostProcess = jest.fn((result) => ({
        ...result,
        confidence: 'high' as const,
      }));

      (handlerRegistry.getPlugins as jest.Mock).mockReturnValue([
        {
          id: 'test-plugin',
          detectableIntents: ['CUSTOM'],
          getDetectionHints: () => [],
          postProcess: mockPostProcess,
        },
      ]);

      mockGetHaikuJson.mockResolvedValue({
        intent: 'CREATE_SESSION',
        confidence: 'medium',
        person: { firstName: 'Test' },
      });

      const result = await detectIntent({
        message: 'Test',
        hasActiveSession: false,
      });

      expect(mockPostProcess).toHaveBeenCalled();
      expect(result.confidence).toBe('high');
    });
  });

  describe('emotional tone mapping', () => {
    it.each([
      ['neutral', 'neutral'],
      ['upset', 'upset'],
      ['hopeful', 'hopeful'],
      ['anxious', 'anxious'],
      ['invalid', 'neutral'], // fallback to neutral for invalid
    ])('maps %s tone to %s', async (input, expected) => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'CONTINUE_CONVERSATION',
        confidence: 'high',
        sessionContext: {
          emotionalTone: input,
        },
      });

      const result = await detectIntent({
        message: 'Test',
        hasActiveSession: true,
      });

      expect(result.sessionContext?.emotionalTone).toBe(expected);
    });
  });

  describe('confidence mapping', () => {
    it.each([
      ['high', 'high'],
      ['medium', 'medium'],
      ['low', 'low'],
      ['invalid', 'low'], // fallback to low for invalid
    ])('maps %s confidence to %s', async (input, expected) => {
      mockGetHaikuJson.mockResolvedValue({
        intent: 'HELP',
        confidence: input,
      });

      const result = await detectIntent({
        message: 'Help me',
        hasActiveSession: false,
      });

      expect(result.confidence).toBe(expected);
    });
  });
});
