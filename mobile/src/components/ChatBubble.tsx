import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text } from 'react-native';
import { MessageRole } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  isIntervention?: boolean;
  status?: MessageDeliveryStatus;
  /** If true, skip typewriter effect (for messages loaded from history) */
  skipTypewriter?: boolean;
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
  /** Enable typewriter effect for AI messages */
  enableTypewriter?: boolean;
  /** Callback when typewriter effect completes */
  onTypewriterComplete?: () => void;
  /** Callback during typewriter animation (for scrolling) */
  onTypewriterProgress?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Typewriter speed in ms per character (faster = smaller number) */
const TYPEWRITER_SPEED_MS = 8; // 8ms per character = ~125 chars/sec (quite fast)

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({
  message,
  showTimestamp = false,
  enableTypewriter = true,
  onTypewriterComplete,
  onTypewriterProgress,
}: ChatBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === MessageRole.USER;
  const isSystem = message.role === MessageRole.SYSTEM;
  const isAI = !isUser && !isSystem;
  const isIntervention = message.isIntervention ?? false;

  // Typewriter state
  const [displayedText, setDisplayedText] = useState('');
  const hasCompletedRef = useRef(false);
  const messageIdRef = useRef(message.id);

  // Store callbacks in refs to avoid restarting animation when they change
  const onCompleteRef = useRef(onTypewriterComplete);
  const onProgressRef = useRef(onTypewriterProgress);
  onCompleteRef.current = onTypewriterComplete;
  onProgressRef.current = onTypewriterProgress;

  // Determine if we should use typewriter effect
  const shouldUseTypewriter = isAI && enableTypewriter && !message.skipTypewriter;

  // Typewriter effect for AI messages
  useEffect(() => {
    // Reset if message ID changes (new message)
    if (messageIdRef.current !== message.id) {
      messageIdRef.current = message.id;
      hasCompletedRef.current = false;
      setDisplayedText('');
    }

    // Skip typewriter for non-AI messages or if disabled
    if (!shouldUseTypewriter) {
      setDisplayedText(message.content);
      return;
    }

    // If already completed, show full text
    if (hasCompletedRef.current) {
      setDisplayedText(message.content);
      return;
    }

    // Start typewriter animation
    let currentIndex = 0;

    const interval = setInterval(() => {
      if (currentIndex <= message.content.length) {
        setDisplayedText(message.content.slice(0, currentIndex));
        // Call progress callback every ~15 characters to trigger scroll
        if (currentIndex % 15 === 0) {
          onProgressRef.current?.();
        }
        currentIndex++;
      } else {
        clearInterval(interval);
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
    }, TYPEWRITER_SPEED_MS);

    return () => {
      clearInterval(interval);
    };
  }, [message.id, message.content, shouldUseTypewriter]);

  // For non-typewriter messages, always show full content
  const textToDisplay = shouldUseTypewriter ? displayedText : message.content;

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusText = (status: MessageDeliveryStatus): string => {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'read':
        return 'Read';
      case 'error':
        return 'Failed to send';
    }
  };

  // Determine container alignment
  const getContainerStyle = () => {
    if (isUser) return styles.userContainer;
    if (isSystem) return styles.systemContainer;
    return styles.aiContainer;
  };

  // Determine bubble style
  const getBubbleStyle = () => {
    if (isIntervention) return styles.interventionBubble;
    if (isUser) return styles.userBubble;
    if (isSystem) return styles.systemBubble;
    return styles.aiBubble;
  };

  // Determine text style
  const getTextStyle = () => {
    if (isSystem && !isIntervention) return styles.systemText;
    return styles.text;
  };

  return (
    <View
      style={[styles.container, getContainerStyle()]}
      testID={`chat-bubble-${message.id}`}
    >
      <View style={[styles.bubble, isAI && styles.aiBubbleContainer, getBubbleStyle()]}>
        <Text style={getTextStyle()}>{textToDisplay}</Text>
      </View>
      <View style={styles.metaContainer}>
        {showTimestamp && (
          <Text style={[styles.time, isSystem && styles.systemTime]}>
            {formatTime(message.timestamp)}
          </Text>
        )}
        {isUser && message.status && (
          <Text
            style={[
              styles.statusText,
              message.status === 'sending' && styles.statusSending,
              message.status === 'read' && styles.statusRead,
              message.status === 'error' && styles.statusError,
            ]}
          >
            {getStatusText(message.status)}
          </Text>
        )}
      </View>
    </View>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
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
      maxWidth: '100%',
    },
    // User messages: bgSecondary background, 16px border-radius
    userBubble: {
      backgroundColor: colors.bgSecondary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 16,
    },
    // AI messages: full-width, no bubble background (like demo)
    aiBubble: {
      backgroundColor: 'transparent',
      paddingVertical: t.spacing.sm,
      paddingHorizontal: 0,
      borderRadius: 0,
    },
    // System messages: bgTertiary background, 12px border-radius, centered
    systemBubble: {
      backgroundColor: colors.bgTertiary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
    },
    // Intervention messages: warning background with left border
    interventionBubble: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    systemText: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: colors.textSecondary,
      fontFamily: t.typography.fontFamily.regular,
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
      color: colors.textSecondary,
    },
    systemTime: {
      textAlign: 'center',
    },
    statusText: {
      fontSize: t.typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: t.typography.fontFamily.regular,
    },
    statusSending: {
      fontStyle: 'italic',
    },
    statusRead: {
      color: colors.accent,
    },
    statusError: {
      color: colors.error,
    },
  }));
