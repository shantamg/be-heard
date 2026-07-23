import { MessageRole } from '@meet-without-fear/shared';
import {
  BubbleRevealInput,
  ChatBubbleKind,
  classifyChatBubble,
  deriveBubbleReveal,
  deriveUserEntranceAnimation,
  getSharedContentStatusText,
  getSharedFrameLabel,
  isSharedFrameKind,
  UserEntranceInput,
} from '../bubble';

function revealInput(overrides: Partial<BubbleRevealInput> = {}): BubbleRevealInput {
  return {
    kind: 'ai',
    enableTypewriter: true,
    skipTypewriter: false,
    hasAnimated: false,
    hasStarted: false,
    isNextToAnimate: true,
    ...overrides,
  };
}

function entranceInput(overrides: Partial<UserEntranceInput> = {}): UserEntranceInput {
  return { kind: 'user', enableTypewriter: true, id: 'msg-1', ...overrides };
}

describe('classifyChatBubble', () => {
  it.each([
    [MessageRole.USER, 'user'],
    [MessageRole.SYSTEM, 'system'],
    [MessageRole.EMPATHY_STATEMENT, 'empathy-statement'],
    ['SHARED_CONTEXT', 'shared-context'],
    ['VALIDATION_FEEDBACK', 'validation-feedback'],
    ['SHARE_SUGGESTION', 'share-suggestion'],
    [MessageRole.AI, 'ai'],
  ])('classifies %s as %s', (role, expected) => {
    expect(classifyChatBubble(role)).toBe(expected);
  });

  it('falls back to assistant prose for an unrecognised role', () => {
    // Only assistant prose uses the typewriter, so an unknown role must not
    // silently land in a branch that hides it.
    expect(classifyChatBubble('SOMETHING_NEW')).toBe('ai');
  });
});

describe('isSharedFrameKind', () => {
  it.each<[ChatBubbleKind, boolean]>([
    ['empathy-statement', true],
    ['shared-context', true],
    ['validation-feedback', true],
    ['user', false],
    ['system', false],
    ['share-suggestion', false],
    ['ai', false],
  ])('reports %s as %s', (kind, expected) => {
    expect(isSharedFrameKind(kind)).toBe(expected);
  });
});

describe('deriveBubbleReveal', () => {
  it('types out a live assistant message whose turn it is', () => {
    const state = deriveBubbleReveal(revealInput());

    expect(state.useTypewriter).toBe(true);
    expect(state.useFadeIn).toBe(false);
    expect(state.isWaitingForTurn).toBe(false);
  });

  it('never types out a user turn', () => {
    expect(deriveBubbleReveal(revealInput({ kind: 'user' })).useTypewriter).toBe(false);
  });

  it('renders history instantly', () => {
    const state = deriveBubbleReveal(revealInput({ skipTypewriter: true }));

    expect(state.useTypewriter).toBe(false);
    expect(state.useFadeIn).toBe(false);
    expect(state.isWaitingForTurn).toBe(false);
  });

  it('renders instantly when animation is disabled outright', () => {
    const state = deriveBubbleReveal(revealInput({ enableTypewriter: false }));

    expect(state.useTypewriter).toBe(false);
    expect(state.isWaitingForTurn).toBe(false);
  });

  it('does not replay a message that already finished animating', () => {
    const state = deriveBubbleReveal(revealInput({ hasAnimated: true }));

    expect(state.useTypewriter).toBe(false);
    expect(state.useFadeIn).toBe(false);
    expect(state.isFadeInActive).toBe(false);
    expect(state.isWaitingForTurn).toBe(false);
  });

  describe('fade-in kinds', () => {
    it.each<ChatBubbleKind>([
      'system',
      'empathy-statement',
      'shared-context',
      'validation-feedback',
      'share-suggestion',
    ])('fades in %s rather than typing it', (kind) => {
      const state = deriveBubbleReveal(revealInput({ kind }));

      expect(state.useTypewriter).toBe(false);
      expect(state.useFadeIn).toBe(true);
      expect(state.isFadeInActive).toBe(true);
    });

    it('is eligible to fade but not yet running while waiting its turn', () => {
      const state = deriveBubbleReveal(
        revealInput({ kind: 'system', isNextToAnimate: false })
      );

      expect(state.useFadeIn).toBe(true);
      expect(state.isFadeInActive).toBe(false);
    });
  });

  describe('waiting for a turn', () => {
    it('hides an animatable message that is not next', () => {
      const state = deriveBubbleReveal(revealInput({ isNextToAnimate: false }));

      expect(state.isWaitingForTurn).toBe(true);
    });

    it('stops hiding it once it has begun animating', () => {
      const state = deriveBubbleReveal(
        revealInput({ isNextToAnimate: false, hasStarted: true })
      );

      expect(state.isWaitingForTurn).toBe(false);
    });

    it('never hides a user turn', () => {
      const state = deriveBubbleReveal(
        revealInput({ kind: 'user', isNextToAnimate: false })
      );

      expect(state.isWaitingForTurn).toBe(false);
    });

    it('never hides history', () => {
      const state = deriveBubbleReveal(
        revealInput({ isNextToAnimate: false, skipTypewriter: true })
      );

      expect(state.isWaitingForTurn).toBe(false);
    });
  });

  it('judges a row afresh once its per-mount bookkeeping is reset', () => {
    // The caller clears hasAnimated/hasStarted when a row's animation identity
    // changes, so the two inputs must produce different reveals. That the
    // component reads them *after* the reset is guarded separately, by
    // "re-enters animation when its animation identity changes" in
    // components/__tests__/ChatInterface.test.tsx.
    const settled = deriveBubbleReveal(revealInput({ hasAnimated: true, hasStarted: true }));
    const afterReset = deriveBubbleReveal(revealInput({ hasAnimated: false, hasStarted: false }));

    expect(settled.useTypewriter).toBe(false);
    expect(afterReset.useTypewriter).toBe(true);
  });
});

describe('deriveUserEntranceAnimation', () => {
  it('animates a turn still marked sending', () => {
    expect(deriveUserEntranceAnimation(entranceInput({ status: 'sending' }))).toBe(true);
  });

  it('animates a turn still carrying an optimistic id', () => {
    expect(deriveUserEntranceAnimation(entranceInput({ id: 'optimistic-user-1' }))).toBe(true);
  });

  it('does not animate a persisted turn', () => {
    expect(
      deriveUserEntranceAnimation(entranceInput({ id: 'server-uuid', status: 'sent' }))
    ).toBe(false);
  });

  it('does not animate a non-user turn even when it is sending', () => {
    expect(
      deriveUserEntranceAnimation(entranceInput({ kind: 'ai', status: 'sending' }))
    ).toBe(false);
  });

  it('is suppressed when animation is disabled', () => {
    expect(
      deriveUserEntranceAnimation(
        entranceInput({ status: 'sending', enableTypewriter: false })
      )
    ).toBe(false);
  });

});

describe('getSharedFrameLabel', () => {
  it.each([
    ['empathy-statement', 'received', 'Sam', 'Empathy from Sam'],
    ['empathy-statement', 'received', undefined, 'Empathy from your partner'],
    ['empathy-statement', 'sent', 'Sam', 'Empathy shared with Sam'],
    ['empathy-statement', 'sent', undefined, 'Empathy shared'],
    ['validation-feedback', 'received', 'Sam', 'Feedback from Sam'],
    ['validation-feedback', 'sent', undefined, 'Feedback from your partner'],
    ['shared-context', 'sent', 'Sam', 'Context shared with Sam'],
    ['shared-context', 'sent', undefined, 'Context shared'],
    ['shared-context', 'received', 'Sam', 'Context from Sam'],
    ['shared-context', 'received', undefined, 'Context from your partner'],
  ] as const)('labels %s/%s with partner %s', (kind, direction, partnerName, expected) => {
    expect(getSharedFrameLabel({ kind, direction, partnerName })).toBe(expected);
  });

  it('ignores direction for validation feedback, which is always inbound', () => {
    expect(getSharedFrameLabel({ kind: 'validation-feedback', direction: 'sent' })).toBe(
      getSharedFrameLabel({ kind: 'validation-feedback', direction: 'received' })
    );
  });

  it('treats an empty partner name as unknown', () => {
    expect(getSharedFrameLabel({ kind: 'shared-context', direction: 'sent', partnerName: '' }))
      .toBe('Context shared');
  });
});

describe('getSharedContentStatusText', () => {
  it.each([
    ['sending', 'Sending...'],
    ['pending', 'Submitted for review'],
    ['delivered', 'Delivered'],
    ['seen', '✓ Seen'],
    ['superseded', 'Updated version below'],
  ] as const)('renders %s as "%s"', (status, expected) => {
    expect(getSharedContentStatusText(status)).toBe(expected);
  });

  it('falls back to the review copy for an unknown status', () => {
    expect(getSharedContentStatusText(undefined)).toBe('Submitted for review');
  });
});
