import { useRef, useEffect, useCallback } from 'react';
import { View, Text, Animated, Easing, TouchableOpacity } from 'react-native';
import { MessageRole, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import {
  classifyChatBubble,
  deriveBubbleReveal,
  deriveUserEntranceAnimation,
  getSharedContentStatusText,
  getSharedFrameLabel,
  isSharedFrameKind,
} from '../lib/chat/render/bubble';
import { createStyles } from '../theme/styled';
import { designFonts, useAppAppearance } from '../theme';
import { TypewriterText } from './TypewriterText';
import { SpeakerButton } from './SpeakerButton';

// ============================================================================
// Types
// ============================================================================

export type MessageDeliveryStatus = 'sending' | 'streaming' | 'sent' | 'delivered' | 'read' | 'error';

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  senderId?: string | null;
  isIntervention?: boolean;
  status?: MessageDeliveryStatus;
  /** If true, skip animation (for messages loaded from history) */
  skipTypewriter?: boolean;
  /** Delivery status for shared content messages (EMPATHY_STATEMENT, SHARED_CONTEXT) */
  sharedContentDeliveryStatus?: SharedContentDeliveryStatus;
  sharedContentDirection?: 'sent' | 'received';
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
  /** Enable typewriter effect for AI messages */
  enableTypewriter?: boolean;
  /** Callback when animation starts (to track animation state) */
  onAnimationStart?: () => void;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Callback as typewriter/fade progress changes layout */
  onAnimationProgress?: () => void;
  /** Stable identity for animation state when a temporary message id is reconciled. */
  animationIdentity?: string;
  /** Whether speech is currently playing for this message */
  isSpeaking?: boolean;
  /** Callback when speaker button is pressed */
  onSpeakerPress?: () => void;
  /** Hide speaker button (default: false for AI messages) */
  hideSpeaker?: boolean;
  /** Partner's name for personalized messages (e.g., SHARED_CONTEXT) */
  partnerName?: string;
  /** Tap handler for shared-content frames (opens activity drawer) */
  onPress?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Duration of the fade-in animation for non-typewriter messages (ms) */
const MESSAGE_FADE_DURATION_MS = 400;

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({
  message,
  showTimestamp = false,
  enableTypewriter = true,
  onAnimationStart,
  onAnimationComplete,
  onAnimationProgress,
  animationIdentity,
  isSpeaking = false,
  onSpeakerPress,
  hideSpeaker = false,
  partnerName,
  onPress,
}: ChatBubbleProps) {
  const styles = useStyles();
  const kind = classifyChatBubble(message.role);
  const isUser = kind === 'user';
  const isSystem = kind === 'system';
  const isEmpathyStatement = kind === 'empathy-statement';
  const isShareSuggestion = kind === 'share-suggestion';
  const isAI = kind === 'ai';
  const isIntervention = message.isIntervention ?? false;

  // Track if this specific message instance has completed animation
  const hasAnimatedRef = useRef(false);
  const hasStartedRef = useRef(false);
  const animationIdentityRef = useRef(animationIdentity ?? message.id);
  const userEntrancePlayedRef = useRef(false);

  // Independent of the reveal queue, so it is safe to evaluate before the
  // identity-reset block below.
  const shouldAnimateUserEntrance = deriveUserEntranceAnimation({
    kind,
    enableTypewriter,
    status: message.status,
    id: message.id,
  });

  const userEntranceAnim = useRef(new Animated.Value(shouldAnimateUserEntrance ? 0 : 1)).current;

  // Animated value for fade-in (non-typewriter messages)
  // Always start at 1 (visible) — the fade-in effect sets to 0 and animates when triggered
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Reset animation state if the animation identity changes. The display id
  // can change when a streaming placeholder is reconciled to its persisted id.
  const currentAnimationIdentity = animationIdentity ?? message.id;
  if (animationIdentityRef.current !== currentAnimationIdentity) {
    animationIdentityRef.current = currentAnimationIdentity;
    hasAnimatedRef.current = false;
    hasStartedRef.current = false;
    userEntrancePlayedRef.current = false;
    fadeAnim.setValue(1);
    userEntranceAnim.setValue(shouldAnimateUserEntrance ? 0 : 1);
  }

  // Store callbacks in refs to avoid re-triggering animation
  const onStartRef = useRef(onAnimationStart);
  const onCompleteRef = useRef(onAnimationComplete);
  const onProgressRef = useRef(onAnimationProgress);
  onStartRef.current = onAnimationStart;
  onCompleteRef.current = onAnimationComplete;
  onProgressRef.current = onAnimationProgress;

  // Track whether this message is next to animate (callback is provided).
  // Animatable live messages that are not next stay hidden so they do not pop
  // in fully rendered before their queued animation turn.
  const isNextToAnimate = onAnimationStart !== undefined;

  // Read AFTER the identity-reset block above: a row whose identity just
  // changed must be judged fresh, not on the previous identity's history.
  const {
    useTypewriter: shouldUseTypewriter,
    useFadeIn: shouldUseFadeIn,
    isFadeInActive: isFadeInAnimating,
    isWaitingForTurn: isWaitingForAnimationTurn,
  } = deriveBubbleReveal({
    kind,
    enableTypewriter,
    skipTypewriter: message.skipTypewriter ?? false,
    hasAnimated: hasAnimatedRef.current,
    hasStarted: hasStartedRef.current,
    isNextToAnimate,
  });

  // Handle fade-in animation for non-typewriter messages
  // Only starts when this message is next in the animation queue (onAnimationStart is provided)
  useEffect(() => {
    if (shouldUseFadeIn && !hasStartedRef.current && isNextToAnimate) {
      hasStartedRef.current = true;
      fadeAnim.setValue(0);

      // Notify animation started
      onStartRef.current?.();

      // Run fade-in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: MESSAGE_FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        // Animation complete
        hasAnimatedRef.current = true;
        onCompleteRef.current?.();
      });
    }
  }, [shouldUseFadeIn, isNextToAnimate, fadeAnim]);

  useEffect(() => {
    if (!shouldAnimateUserEntrance || userEntrancePlayedRef.current) {
      return;
    }

    userEntrancePlayedRef.current = true;
    Animated.timing(userEntranceAnim, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shouldAnimateUserEntrance, userEntranceAnim]);

  // Call onStart when typewriter begins - use effect to avoid setState during render
  // Only starts when this message is next in the animation queue (onAnimationStart is provided)
  useEffect(() => {
    if (shouldUseTypewriter && !hasStartedRef.current && isNextToAnimate && onStartRef.current) {
      hasStartedRef.current = true;
      onStartRef.current();
    }
  }, [shouldUseTypewriter, isNextToAnimate]);

  // Mark as animated when typewriter completes
  const handleComplete = useCallback(() => {
    hasAnimatedRef.current = true;
    onCompleteRef.current?.();
  }, []);

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isSendingStatus = (status: SharedContentDeliveryStatus | undefined): boolean => {
    return status === 'sending';
  };

  const isSeenStatus = (status: SharedContentDeliveryStatus | undefined): boolean => {
    return status === 'seen';
  };

  const isSupersededStatus = (status: SharedContentDeliveryStatus | undefined): boolean => {
    return status === 'superseded';
  };

  const isSharedFrame = isSharedFrameKind(kind);
  const sharedFrameDirection: 'sent' | 'received' =
    message.sharedContentDirection === 'sent' ? 'sent' : 'received';

  // Determine container alignment
  const getContainerStyle = () => {
    if (isUser) return styles.userContainer;
    if (isSystem) return styles.systemContainer;
    if (isSharedFrame) return styles.sharedFrameContainer;
    if (isShareSuggestion) return styles.shareSuggestionContainer;
    return styles.aiContainer;
  };

  // Determine bubble style
  const getBubbleStyle = () => {
    if (isIntervention) return styles.interventionBubble;
    if (isUser) return styles.userBubble;
    if (isSystem) return styles.systemBubble;
    if (isSharedFrame) {
      return sharedFrameDirection === 'sent'
        ? styles.sharedFrameBubbleSent
        : styles.sharedFrameBubbleReceived;
    }
    if (isShareSuggestion) return styles.shareSuggestionBubble;
    return styles.aiBubble;
  };

  // Determine text style
  const getTextStyle = () => {
    if (isSystem && !isIntervention) return styles.systemText;
    return styles.text;
  };

  const renderContent = () => {
    if (isWaitingForAnimationTurn) {
      return null;
    }

    // Shared frame (empathy statements, shared context, validation feedback)
    if (isSharedFrame) {
      const deliveryStatus = message.sharedContentDeliveryStatus;
      const showDeliveryStatus =
        !!deliveryStatus && sharedFrameDirection !== 'received';

      // Top-rule label: voice-distinct between content types
      const label = getSharedFrameLabel({ kind, direction: sharedFrameDirection, partnerName });

      const labelStyle =
        sharedFrameDirection === 'sent'
          ? styles.sharedFrameLabelSent
          : styles.sharedFrameLabelReceived;
      const lineStyle =
        sharedFrameDirection === 'sent'
          ? styles.sharedFrameLineSent
          : styles.sharedFrameLineReceived;
      const bodyTextStyle = isEmpathyStatement
        ? styles.sharedFrameBodyEmpathy
        : styles.sharedFrameBody;

      const content = (
        <View style={styles.sharedFrame}>
          <View style={[styles.sharedFrameLine, lineStyle]} />
          <View
            style={[
              styles.sharedFrameInner,
              sharedFrameDirection === 'sent'
                ? styles.sharedFrameInnerSent
                : styles.sharedFrameInnerReceived,
            ]}
          >
            <View style={styles.sharedFrameLabelRow}>
              <Text style={[styles.sharedFrameArrow, labelStyle]}>
                {sharedFrameDirection === 'sent' ? '↑' : '↓'}
              </Text>
              <Text style={[styles.sharedFrameLabel, labelStyle]}>{label}</Text>
            </View>
            <Text style={bodyTextStyle}>{message.content}</Text>
            {showDeliveryStatus && (
              <Text
                style={[
                  styles.sharedFrameDelivery,
                  isSendingStatus(deliveryStatus) && styles.sharedFrameDeliverySending,
                  isSeenStatus(deliveryStatus) && styles.sharedFrameDeliverySeen,
                  isSupersededStatus(deliveryStatus) && styles.sharedFrameDeliverySuperseded,
                ]}
              >
                {getSharedContentStatusText(deliveryStatus)}
              </Text>
            )}
          </View>
          <View style={[styles.sharedFrameLine, lineStyle]} />
        </View>
      );

      if (isFadeInAnimating) {
        return <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>;
      }
      return content;
    }

    // Share suggestion (what user will share) - use fade-in for new messages
    if (isShareSuggestion) {
      const content = (
        <View>
          <Text style={styles.shareSuggestionLabel}>SUGGESTED TO SHARE</Text>
          <Text style={styles.shareSuggestionText}>"{message.content}"</Text>
        </View>
      );
      if (isFadeInAnimating) {
        return <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>;
      }
      return content;
    }

    // System messages - use fade-in for new messages
    if (isSystem) {
      const content = <Text style={getTextStyle()}>{message.content}</Text>;
      if (isFadeInAnimating) {
        return <Animated.View style={{ opacity: fadeAnim }}>{content}</Animated.View>;
      }
      return content;
    }

    // Use typewriter effect for new AI messages - animates word-by-word at consistent pace
    // This normalizes display speed regardless of how fast streaming arrives
    if (shouldUseTypewriter) {
      return (
        <TypewriterText
          text={message.content}
          style={getTextStyle()}
          wordDelay={40}
          fadeDuration={120}
          completeWhenCaughtUp={message.status !== 'streaming'}
          onComplete={handleComplete}
          onProgress={() => onProgressRef.current?.()}
        />
      );
    }

    // Regular text for all other cases (user messages, already animated messages)
    return <Text style={getTextStyle()}>{message.content}</Text>;
  };

  const userEntranceTranslateY = userEntranceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [36, 0],
  });
  const containerAnimationStyle = shouldAnimateUserEntrance
    ? { opacity: userEntranceAnim, transform: [{ translateY: userEntranceTranslateY }] }
    : null;

  return (
    <Animated.View
      style={[styles.container, getContainerStyle(), containerAnimationStyle]}
      testID={`chat-bubble-${message.id}`}
    >
      {isSharedFrame && onPress ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onPress}
          style={[styles.bubble, getBubbleStyle()]}
          testID={`shared-frame-press-${message.id}`}
        >
          {renderContent()}
        </TouchableOpacity>
      ) : (
        <View style={[styles.bubble, isAI && styles.aiBubbleContainer, getBubbleStyle()]}>
          {renderContent()}
        </View>
      )}
      <View style={styles.metaContainer}>
        {/* Speaker button for AI messages */}
        {isAI && !hideSpeaker && onSpeakerPress && (
          <SpeakerButton
            isSpeaking={isSpeaking}
            onPress={onSpeakerPress}
            testID={`speaker-${message.id}`}
          />
        )}
        {showTimestamp && (
          <Text style={[styles.time, isSystem && styles.systemTime]}>
            {formatTime(message.timestamp)}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const useStyles = () => {
  const { palette } = useAppAppearance();
  return createStyles((t) => ({
    container: {
      alignSelf: 'stretch',
      marginVertical: 6,
      paddingHorizontal: 18,
    },
    userContainer: {
      alignItems: 'flex-end',
    },
    aiContainer: {
      alignItems: 'flex-start',
    },
    systemContainer: {
      alignItems: 'center',
    },
    bubble: {
      maxWidth: '85%',
    },
    // AI messages should be full width
    aiBubbleContainer: {
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      flexShrink: 1,
    },
    // User messages: bgSecondary background, 16px border-radius
    userBubble: {
      backgroundColor: palette.chipBg,
      borderWidth: 1,
      borderColor: palette.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
    },
    // AI messages: full-width, no bubble background (like demo)
    aiBubble: {
      backgroundColor: 'transparent',
      paddingVertical: 6,
      paddingHorizontal: 0,
      borderRadius: 0,
    },
    // System messages: bgTertiary background, 12px border-radius, centered
    systemBubble: {
      backgroundColor: palette.bgElev,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
    },
    // Intervention messages: warning background with left border
    interventionBubble: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    },
    // Shared frame: centered "envelope" treatment for content shared between people.
    // The top/bottom rules are continuous with the chat's chapter dividers — the
    // tinted body is the divider extruded into a container. This makes shared
    // moments read as cross-person artifacts, not as private AI-chat bubbles.
    sharedFrameContainer: {
      alignItems: 'center',
      marginVertical: t.spacing.md,
      paddingHorizontal: 0,
    },
    sharedFrameBubbleReceived: {
      width: '92%',
      maxWidth: '92%',
      backgroundColor: 'transparent',
      padding: 0,
    },
    sharedFrameBubbleSent: {
      width: '92%',
      maxWidth: '92%',
      backgroundColor: 'transparent',
      padding: 0,
    },
    sharedFrame: {
      width: '100%',
    },
    sharedFrameLine: {
      width: '100%',
      height: 1,
    },
    sharedFrameLineReceived: {
      backgroundColor: palette.border,
    },
    sharedFrameLineSent: {
      backgroundColor: palette.border,
    },
    sharedFrameLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    sharedFrameArrow: {
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 22,
    },
    sharedFrameLabel: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      fontFamily: designFonts.mono,
      flexShrink: 1,
    },
    sharedFrameLabelReceived: {
      color: palette.accent,
    },
    sharedFrameLabelSent: {
      color: palette.info,
    },
    sharedFrameInner: {
      paddingVertical: 18,
      paddingHorizontal: 18,
    },
    sharedFrameInnerReceived: {
      backgroundColor: palette.accentSoft,
    },
    sharedFrameInnerSent: {
      backgroundColor: palette.infoSoft,
    },
    sharedFrameBody: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: palette.text,
      fontFamily: designFonts.sans,
    },
    sharedFrameBodyEmpathy: {
      fontSize: 17,
      fontStyle: 'italic',
      lineHeight: 26,
      color: palette.text,
      fontFamily: designFonts.serifItalic,
    },
    sharedFrameDelivery: {
      fontSize: 11,
      fontWeight: '500',
      color: palette.warning,
      textAlign: 'right',
      marginTop: t.spacing.sm,
      textTransform: 'capitalize',
    },
    sharedFrameDeliverySending: {
      color: palette.info,
      fontStyle: 'italic',
    },
    sharedFrameDeliverySeen: {
      color: palette.success,
    },
    sharedFrameDeliverySuperseded: {
      color: palette.textFaint,
      fontStyle: 'italic',
    },
    // Share suggestion: what user will share (from reconciler)
    shareSuggestionContainer: {
      alignItems: 'center',
      marginVertical: t.spacing.md,
    },
    shareSuggestionBubble: {
      backgroundColor: palette.bgElev,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      padding: 20,
    },
    shareSuggestionLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: palette.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      fontFamily: designFonts.mono,
    },
    shareSuggestionText: {
      fontSize: 17,
      fontStyle: 'italic',
      lineHeight: 26,
      color: palette.text,
      fontFamily: designFonts.serifItalic,
    },
    text: {
      fontSize: 15,
      lineHeight: 23,
      color: palette.text,
      fontFamily: designFonts.sans,
      flexShrink: 1,
    },
    systemText: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
      textAlign: 'center',
    },
    metaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
    time: {
      fontSize: t.typography.fontSize.sm,
      color: palette.textMuted,
      fontFamily: designFonts.mono,
    },
    systemTime: {
      textAlign: 'center',
    },
  }));
};
