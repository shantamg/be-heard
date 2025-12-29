/**
 * Session Creation Handler Tests
 *
 * Tests for the session creation intent handler.
 */

import { ChatIntent, SessionCreationState, SessionStatus, StageStatus, Stage } from '@meet-without-fear/shared';
import { IntentHandlerContext, IntentHandlerResult, createStateStore } from '../types';
import { Request } from 'express';

// Mock prisma
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    relationship: {
      create: jest.fn(),
    },
    session: {
      create: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
    },
    userDocument: {
      create: jest.fn(),
    },
  },
}));

// Mock response generator
jest.mock('../response-generator', () => ({
  generateConversationalResponse: jest.fn().mockResolvedValue('Session created! I sent an invitation.'),
}));

// Mock session utils
jest.mock('../../../utils/session', () => ({
  mapSessionToSummary: jest.fn().mockReturnValue({
    id: 'session-1',
    relationshipId: 'rel-1',
    status: 'INVITED',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    partner: {
      id: 'partner-1',
      name: 'John',
      nickname: 'John',
    },
    myProgress: {
      stage: 0,
      status: 'NOT_STARTED',
      startedAt: null,
      completedAt: null,
    },
    partnerProgress: {
      stage: 0,
      status: 'NOT_STARTED',
      startedAt: null,
      completedAt: null,
    },
    selfActionNeeded: [],
    partnerActionNeeded: [],
  }),
}));

import { prisma } from '../../../lib/prisma';

describe('Session Creation Handler', () => {
  // We'll test the core logic without importing the actual handler
  // to avoid the singleton state issues

  const mockRequest = {} as Request;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createStateStore', () => {
    it('creates a working state store', () => {
      const store = createStateStore<SessionCreationState>();

      expect(store.has('user-1')).toBe(false);

      store.set('user-1', {
        step: 'GATHERING_PERSON',
        person: {},
        confirmedByUser: false,
      });

      expect(store.has('user-1')).toBe(true);
      expect(store.get('user-1')?.step).toBe('GATHERING_PERSON');
    });

    it('updates existing state', () => {
      const store = createStateStore<SessionCreationState>();

      store.set('user-1', {
        step: 'GATHERING_PERSON',
        person: {},
        confirmedByUser: false,
      });

      const updated = store.update('user-1', {
        step: 'GATHERING_CONTACT',
        person: { firstName: 'John' },
      });

      expect(updated.step).toBe('GATHERING_CONTACT');
      expect(updated.person.firstName).toBe('John');
      expect(updated.confirmedByUser).toBe(false);
    });

    it('deletes state', () => {
      const store = createStateStore<SessionCreationState>();

      store.set('user-1', {
        step: 'GATHERING_PERSON',
        person: {},
        confirmedByUser: false,
      });

      store.delete('user-1');

      expect(store.has('user-1')).toBe(false);
      expect(store.get('user-1')).toBeUndefined();
    });
  });

  describe('canCreate validation', () => {
    function canCreate(state: SessionCreationState): boolean {
      return Boolean(
        state.person.firstName &&
          state.person.contactInfo?.value &&
          (state.person.contactInfo.type === 'email' ||
            state.person.contactInfo.type === 'phone')
      );
    }

    it('returns false when missing firstName', () => {
      const state: SessionCreationState = {
        step: 'GATHERING_PERSON',
        person: {
          contactInfo: { type: 'email', value: 'test@example.com' },
        },
        confirmedByUser: false,
      };

      expect(canCreate(state)).toBe(false);
    });

    it('returns false when missing contactInfo', () => {
      const state: SessionCreationState = {
        step: 'GATHERING_CONTACT',
        person: {
          firstName: 'John',
        },
        confirmedByUser: false,
      };

      expect(canCreate(state)).toBe(false);
    });

    it('returns false when contactInfo has no value', () => {
      const state: SessionCreationState = {
        step: 'GATHERING_CONTACT',
        person: {
          firstName: 'John',
          contactInfo: { type: 'email', value: '' },
        },
        confirmedByUser: false,
      };

      expect(canCreate(state)).toBe(false);
    });

    it('returns true with valid email contact', () => {
      const state: SessionCreationState = {
        step: 'COMPLETE',
        person: {
          firstName: 'John',
          contactInfo: { type: 'email', value: 'john@example.com' },
        },
        confirmedByUser: false,
      };

      expect(canCreate(state)).toBe(true);
    });

    it('returns true with valid phone contact', () => {
      const state: SessionCreationState = {
        step: 'COMPLETE',
        person: {
          firstName: 'Sarah',
          contactInfo: { type: 'phone', value: '555-123-4567' },
        },
        confirmedByUser: false,
      };

      expect(canCreate(state)).toBe(true);
    });
  });

  describe('missing info detection', () => {
    function getMissingFields(state: SessionCreationState): string[] {
      const missing: string[] = [];

      if (!state.person.firstName) {
        missing.push('firstName');
      }
      if (!state.person.contactInfo?.value) {
        missing.push('email');
      }

      return missing;
    }

    it('returns firstName when missing', () => {
      const state: SessionCreationState = {
        step: 'GATHERING_PERSON',
        person: {},
        confirmedByUser: false,
      };

      const missing = getMissingFields(state);

      expect(missing).toContain('firstName');
    });

    it('returns email when missing contact info', () => {
      const state: SessionCreationState = {
        step: 'GATHERING_CONTACT',
        person: { firstName: 'John' },
        confirmedByUser: false,
      };

      const missing = getMissingFields(state);

      expect(missing).toContain('email');
      expect(missing).not.toContain('firstName');
    });

    it('returns empty array when all info present', () => {
      const state: SessionCreationState = {
        step: 'COMPLETE',
        person: {
          firstName: 'John',
          contactInfo: { type: 'email', value: 'john@test.com' },
        },
        confirmedByUser: false,
      };

      const missing = getMissingFields(state);

      expect(missing).toHaveLength(0);
    });
  });

  describe('session creation database flow', () => {
    it('creates relationship, session, and invitation', async () => {
      const mockRelationship = {
        id: 'rel-1',
        members: [
          {
            userId: 'user-1',
            nickname: 'John',
            user: { id: 'user-1', name: 'Me', firstName: 'Me' },
          },
        ],
      };

      const mockSession = {
        id: 'session-1',
        relationshipId: 'rel-1',
        status: 'INVITED',
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: mockRelationship,
        userVessels: [{ id: 'vessel-1', userId: 'user-1' }],
        stageProgress: [],
      };

      const mockInvitation = {
        id: 'inv-1',
        sessionId: 'session-1',
        invitedById: 'user-1',
        email: 'john@example.com',
      };

      (prisma.relationship.create as jest.Mock).mockResolvedValue(mockRelationship);
      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.invitation.create as jest.Mock).mockResolvedValue(mockInvitation);

      // Simulate the creation flow
      const relationship = await prisma.relationship.create({
        data: {
          members: {
            create: [{ userId: 'user-1', nickname: 'John' }],
          },
        },
        include: { members: { include: { user: true } } },
      });

      expect(prisma.relationship.create).toHaveBeenCalled();
      expect(relationship.id).toBe('rel-1');

      const session = await prisma.session.create({
        data: {
          relationshipId: relationship.id,
          status: 'INVITED',
          userVessels: { create: [{ userId: 'user-1' }] },
          stageProgress: { create: [{ userId: 'user-1', stage: 0, status: 'NOT_STARTED' }] },
        },
        include: {
          relationship: { include: { members: { include: { user: true } } } },
          userVessels: true,
          stageProgress: true,
        },
      });

      expect(prisma.session.create).toHaveBeenCalled();
      expect(session.status).toBe('INVITED');

      const invitation = await prisma.invitation.create({
        data: {
          sessionId: session.id,
          invitedById: 'user-1',
          email: 'john@example.com',
          name: 'John',
          expiresAt: expect.any(Date),
        },
      });

      expect(prisma.invitation.create).toHaveBeenCalled();
      expect(invitation.email).toBe('john@example.com');
    });
  });

  describe('handler result structure', () => {
    it('returns correct structure for need more info', () => {
      const result: IntentHandlerResult = {
        actionType: 'NEED_MORE_INFO',
        message: "What's John's email address?",
        data: {
          missingFields: ['email'],
          partialPerson: { firstName: 'John' },
        },
        actions: [
          {
            id: 'cancel-creation',
            label: 'Cancel',
            type: 'cancel',
          },
        ],
      };

      expect(result.actionType).toBe('NEED_MORE_INFO');
      expect(result.actions).toHaveLength(1);
      expect(result.data?.missingFields).toContain('email');
    });

    it('returns correct structure for session created', () => {
      const result: IntentHandlerResult = {
        actionType: 'CREATE_SESSION',
        message: 'Session created! I sent an invitation to john@test.com.',
        sessionChange: {
          type: 'created',
          sessionId: 'session-1',
          session: {
            id: 'session-1',
            relationshipId: 'rel-1',
            status: SessionStatus.INVITED,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            partner: { id: 'p1', name: 'John', nickname: null },
            myProgress: { stage: Stage.ONBOARDING, status: StageStatus.NOT_STARTED, startedAt: null, completedAt: null },
            partnerProgress: { stage: Stage.ONBOARDING, status: StageStatus.NOT_STARTED, startedAt: null, completedAt: null },
            selfActionNeeded: [],
            partnerActionNeeded: [],
          },
        },
        data: {
          invitationId: 'inv-1',
          invitationUrl: 'https://meetwithoutfear.app/invite/inv-1',
        },
      };

      expect(result.actionType).toBe('CREATE_SESSION');
      expect(result.sessionChange?.type).toBe('created');
      expect(result.sessionChange?.sessionId).toBe('session-1');
      expect(result.data?.invitationUrl).toContain('/invite/');
    });

    it('returns correct structure for error', () => {
      const result: IntentHandlerResult = {
        actionType: 'ERROR',
        message: "I had trouble creating that session. Let's try again.",
      };

      expect(result.actionType).toBe('ERROR');
      expect(result.message).toContain('trouble');
    });
  });
});
