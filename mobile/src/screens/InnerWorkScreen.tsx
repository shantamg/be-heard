/**
 * InnerWorkScreen Component
 *
 * A chat-centric interface for inner work (solo self-reflection) sessions.
 * Reuses the ChatInterface component for consistency with partner sessions.
 */

import { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Heart } from 'lucide-react-native';
import { MessageRole } from '@meet-without-fear/shared';

import { ChatInterface, ChatMessage } from '../components/ChatInterface';
import { useInnerWorkSession, useSendInnerWorkMessage } from '../hooks';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface InnerWorkScreenProps {
  sessionId: string;
  onNavigateBack?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function InnerWorkScreen({
  sessionId,
  onNavigateBack,
}: InnerWorkScreenProps) {
  const styles = useStyles();

  const { data, isLoading, error } = useInnerWorkSession(sessionId);
  const sendMessage = useSendInnerWorkMessage(sessionId);

  const session = data?.session;

  // Convert inner work messages to ChatMessage format
  const messages: ChatMessage[] = useMemo(() => {
    if (!session?.messages) return [];

    return session.messages.map((msg) => ({
      id: msg.id,
      sessionId: sessionId,
      senderId: msg.role === 'USER' ? 'user' : null,
      role: msg.role === 'USER' ? MessageRole.USER : MessageRole.AI,
      content: msg.content,
      stage: 1, // Inner work doesn't use stages, but ChatMessage requires it
      timestamp: msg.timestamp,
    }));
  }, [session?.messages, sessionId]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      try {
        await sendMessage.mutateAsync({ content });
      } catch (err) {
        console.error('Failed to send inner work message:', err);
      }
    },
    [sendMessage]
  );

  const handleBack = useCallback(() => {
    onNavigateBack?.();
  }, [onNavigateBack]);

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10a37f" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !session) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Failed to load session</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const title = session.title || session.theme || 'Inner Work';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header - styled like the rest of the app */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color="#ececec" size={24} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Heart color="#10a37f" size={16} />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {session.theme && session.title && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {session.theme}
            </Text>
          )}
        </View>

        {/* Spacer to balance the back button */}
        <View style={{ width: 48 }} />
      </View>

      {/* Chat Interface */}
      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={sendMessage.isPending}
        disabled={sendMessage.isPending}
        emptyStateTitle="Inner Work"
        emptyStateMessage="A space for self-reflection. Share what's on your mind."
      />
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    errorText: {
      fontSize: 16,
      color: t.colors.error,
      marginBottom: 16,
    },
    backButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.lg,
    },
    backButtonText: {
      fontSize: 16,
      color: t.colors.textPrimary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    headerBackButton: {
      padding: t.spacing.sm,
    },
    headerContent: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: 12,
      color: t.colors.textMuted,
      marginTop: 2,
    },
  }));
