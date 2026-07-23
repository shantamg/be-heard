/**
 * InnerThoughtsScreen Component
 *
 * A chat-centric interface for Inner Thoughts (solo self-reflection) sessions.
 * Can be linked to a partner session for context-aware private reflection.
 * Reuses the ChatInterface component for consistency with partner sessions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowUpRight, Layers, MoreVertical, Lock, Sparkles } from 'lucide-react-native';
import { MessageRole, MemorySuggestion, SuggestedAction } from '@meet-without-fear/shared';

import { ChatInterface, ChatCustomCardItem, ChatMessage } from '../components/ChatInterface';
import { MemorySuggestionCard } from '../components/MemorySuggestionCard';
import { SuggestedActionButtons } from '../components/SuggestedActionButtons';
import { TakeawayReviewSheet } from '../components/TakeawayReviewSheet';
import { TranscriptionDrawer } from '../components/TranscriptionDrawer';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { useInnerThoughtsSession, useSendInnerThoughtsMessage } from '../hooks';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { createStyles } from '../theme/styled';
import { colors, useAppAppearance } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface InnerThoughtsScreenProps {
  sessionId: string;
  /** If linked to a partner session, show context about it */
  linkedPartnerName?: string;
  onNavigateBack?: () => void;
  /** Navigate back to the linked partner session */
  onNavigateToPartnerSession?: () => void;
  /** Whether a new session is being created (shows typing indicator) */
  isCreating?: boolean;
  /** Initial message to show optimistically while creating session */
  initialMessage?: string;
  /** Initial suggested actions from session creation (when user sent first message) */
  initialSuggestedActions?: SuggestedAction[];
  /** AI message that produced the initial suggested actions */
  initialSuggestedActionMessageId?: string;
  /** Hide chat content until transition completes (for fade-in effect) */
  hideContentUntilReady?: boolean;
  /** Narrow URL-controlled fixture for visual audit surfaces. */
  auditFixture?: string | null;
  /** Temporary home-composer destination while standalone inner work is disabled. */
  comingSoonMode?: boolean;
}

const INNER_WORK_COMING_SOON_MESSAGE = 'Doing inner work by yourself is a feature coming soon.';

// ============================================================================
// Component
// ============================================================================

export function InnerThoughtsScreen({
  sessionId,
  linkedPartnerName,
  onNavigateBack,
  onNavigateToPartnerSession,
  isCreating = false,
  initialMessage,
  initialSuggestedActions,
  initialSuggestedActionMessageId,
  hideContentUntilReady = false,
  auditFixture = null,
  comingSoonMode = false,
}: InnerThoughtsScreenProps) {
  const styles = useStyles();
  const { palette } = useAppAppearance();
  const router = useRouter();

  // Takeaways review sheet state
  const [showTakeaways, setShowTakeaways] = useState(false);

  // Voice input state
  const voice = useVoiceInput();
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);

  // Memory suggestion state
  const [memorySuggestion, setMemorySuggestion] = useState<MemorySuggestion | null>(null);
  // Suggested actions state - initialize with any actions from session creation
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>(
    initialSuggestedActions || []
  );
  const [suggestedActionMessageId, setSuggestedActionMessageId] = useState<string | undefined>(
    initialSuggestedActionMessageId
  );

  // Update suggested actions when they arrive from session creation
  // (useState default only applies on initial mount, so we need this effect)
  useEffect(() => {
    if (initialSuggestedActions && initialSuggestedActions.length > 0) {
      setSuggestedActions(initialSuggestedActions);
      setSuggestedActionMessageId(initialSuggestedActionMessageId);
    }
  }, [initialSuggestedActions, initialSuggestedActionMessageId]);

  // Only fetch session if we have a valid sessionId (not creating)
  const { data, isLoading, error } = useInnerThoughtsSession(
    isCreating || comingSoonMode ? undefined : sessionId
  );
  const sendMessage = useSendInnerThoughtsMessage(sessionId);

  const session = data?.session;

  useEffect(() => {
    if (auditFixture === 'takeaway-review' && session?.distilledAt) {
      setShowTakeaways(true);
    }
  }, [auditFixture, session?.distilledAt]);

  // Convert inner thoughts messages to ChatMessage format
  // When creating with an initial message, show it optimistically
  const messages: ChatMessage[] = useMemo(() => {
    if (comingSoonMode) {
      return [{
        id: 'inner-work-coming-soon',
        sessionId: sessionId || 'inner-work-coming-soon',
        senderId: null,
        role: MessageRole.AI,
        content: INNER_WORK_COMING_SOON_MESSAGE,
        stage: 1,
        timestamp: new Date().toISOString(),
      }];
    }

    // If creating with initial message, show it optimistically
    if (isCreating && initialMessage) {
      return [{
        id: 'optimistic-initial',
        sessionId: sessionId || 'pending',
        senderId: 'user',
        role: MessageRole.USER,
        content: initialMessage,
        stage: 1,
        timestamp: new Date().toISOString(),
      }];
    }

    if (!session?.messages) return [];

    return session.messages.map((msg) => ({
      id: msg.id,
      sessionId: sessionId,
      senderId: msg.role === 'USER' ? 'user' : null,
      role: msg.role === 'USER' ? MessageRole.USER : MessageRole.AI,
      content: msg.content,
      stage: 1, // Inner thoughts doesn't use stages, but ChatMessage requires it
      timestamp: msg.timestamp,
    }));
  }, [session?.messages, sessionId, isCreating, initialMessage, comingSoonMode]);

  const linkedAtMessage = useMemo(
    () => messages.find((message) => message.id === session?.linkedAtMessageId),
    [messages, session?.linkedAtMessageId]
  );

  const branchPointCards: ChatCustomCardItem[] = useMemo(() => {
    if (!session?.linkedPartnerSessionId || !linkedAtMessage) {
      return [];
    }

    const partnerLabel = linkedPartnerName || 'partner session';

    return [{
      id: `inner-thoughts-branch-${session.linkedPartnerSessionId}`,
      type: 'custom-card',
      timestamp: linkedAtMessage.timestamp,
      animate: false,
      render: () => (
        <TouchableOpacity
          style={[styles.branchMarker, { borderColor: palette.border, backgroundColor: palette.chipBg }]}
          onPress={onNavigateToPartnerSession || (() => router.push(`/session/${session.linkedPartnerSessionId}`))}
          accessibilityRole="button"
          accessibilityLabel={`Open session with ${partnerLabel}`}
        >
          <ArrowUpRight color={palette.accent} size={16} />
          <Text style={[styles.branchMarkerText, { color: palette.text }]} numberOfLines={2}>
            Started a session with {partnerLabel}
          </Text>
        </TouchableOpacity>
      ),
    }];
  }, [
    linkedAtMessage,
    linkedPartnerName,
    onNavigateToPartnerSession,
    palette.accent,
    palette.border,
    palette.chipBg,
    palette.text,
    router,
    session?.linkedPartnerSessionId,
    styles.branchMarker,
    styles.branchMarkerText,
  ]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      try {
        const result = await sendMessage.mutateAsync({ content });
        // Check for memory suggestion in response
        if (result.memorySuggestion) {
          setMemorySuggestion(result.memorySuggestion);
        }
        // Check for suggested actions in response
        if (result.suggestedActions && result.suggestedActions.length > 0) {
          setSuggestedActions(result.suggestedActions);
          setSuggestedActionMessageId(result.aiMessage.id);
        } else {
          // Clear previous suggestions when no new ones
          setSuggestedActions([]);
          setSuggestedActionMessageId(undefined);
        }
      } catch (err) {
        console.error('Failed to send inner thoughts message:', err);
      }
    },
    [sendMessage]
  );

  const handleDismissMemorySuggestion = useCallback(() => {
    setMemorySuggestion(null);
  }, []);

  const handleDismissSuggestedActions = useCallback(() => {
    setSuggestedActions([]);
    setSuggestedActionMessageId(undefined);
  }, []);

  const handleActionPress = useCallback((action: SuggestedAction) => {
    // Clear the actions immediately
    setSuggestedActions([]);

    // Navigate based on action type
    switch (action.type) {
      case 'start_partner_session':
        // Navigate to new session flow, optionally with person name pre-filled
        router.push({
          pathname: '/session/new',
          params: {
            ...(action.personName ? { partnerName: action.personName } : {}),
            innerThoughtsId: sessionId,
            ...(suggestedActionMessageId ? { linkedAtMessageId: suggestedActionMessageId } : {}),
          },
        });
        break;
      case 'start_meditation':
        router.push('/inner-work/meditation');
        break;
      case 'add_gratitude':
        router.push('/inner-work/gratitude');
        break;
      case 'check_need':
        router.push('/inner-work/needs');
        break;
    }
  }, [router, sessionId, suggestedActionMessageId]);

  const handleBack = useCallback(() => {
    onNavigateBack?.();
  }, [onNavigateBack]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      'Done for now?',
      'Your reflections have been saved.',
      [
        { text: 'Continue', style: 'cancel' },
        {
          text: 'Done',
          style: 'destructive',
          onPress: () => {
            onNavigateBack?.();
          },
        },
      ]
    );
  }, [onNavigateBack]);

  // ---- Voice input handlers ------------------------------------------------

  const handleVoicePress = useCallback(async () => {
    setShowVoiceDrawer(true);
    await voice.start();
  }, [voice]);

  const handleVoiceStopAndSend = useCallback(async () => {
    const transcript = await voice.stopAndGetTranscript();
    setShowVoiceDrawer(false);
    if (transcript.trim()) {
      handleSendMessage(transcript.trim());
    }
  }, [voice, handleSendMessage]);

  const handleVoiceCancel = useCallback(() => {
    voice.cancel();
    setShowVoiceDrawer(false);
  }, [voice]);

  // Loading state - but NOT when creating (we show typing indicator instead)
  if (isLoading && !isCreating && !comingSoonMode) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state - but NOT when creating
  if (!isCreating && !comingSoonMode && (error || !session)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>We couldn't load your reflection right now</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const title = comingSoonMode
    ? 'Inner Work'
    : isCreating ? 'Inner Thoughts' : (session?.title || session?.theme || 'Inner Thoughts');
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top', 'bottom']}>
      {/* Header - styled like the rest of the app */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: palette.bg,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <HeaderBackButton onPress={handleBack} />

        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Layers color={palette.accent} size={16} />
            <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Lock size={12} color={palette.textMuted} />
          </View>
          {!isCreating && session?.theme && session?.title ? (
            <Text style={[styles.headerSubtitle, { color: palette.textMuted }]} numberOfLines={1}>
              {session.theme}
            </Text>
          ) : null}
        </View>

        {/* Takeaways review button — only when distillation has run */}
        {!isCreating && session?.distilledAt && (
          <TouchableOpacity
            style={styles.headerMenuButton}
            onPress={() => setShowTakeaways(true)}
            accessibilityRole="button"
            accessibilityLabel="View takeaways"
          >
            <Sparkles color={palette.accent} size={20} />
          </TouchableOpacity>
        )}

        {/* End Session button */}
        {!isCreating && (
          <TouchableOpacity
            style={styles.headerMenuButton}
            onPress={handleEndSession}
            accessibilityRole="button"
            accessibilityLabel="End session"
          >
            <MoreVertical color={palette.textMuted} size={20} />
          </TouchableOpacity>
        )}
        {isCreating && <View style={{ width: 48 }} />}
      </View>

      {/* Chat Interface - hide content during fade transition */}
      <ChatInterface
        messages={hideContentUntilReady ? [] : messages}
        onSendMessage={handleSendMessage}
        isLoading={hideContentUntilReady ? false : (isCreating || sendMessage.isPending)}
        disabled={isCreating || sendMessage.isPending}
        hideInput={comingSoonMode}
        emptyStateTitle={comingSoonMode ? 'Inner Work' : 'Inner Thoughts'}
        emptyStateMessage={comingSoonMode ? '' : "A private space for reflection. Share what's on your mind."}
        customEmptyState={hideContentUntilReady ? <View /> : undefined}
        composer={{ onVoicePress: Platform.OS !== 'web' ? handleVoicePress : undefined }}
        skipInitialHistory={comingSoonMode}
        customCards={branchPointCards}
      />

      {/* Suggested Action Buttons - shown when AI suggests next steps */}
      {suggestedActions.length > 0 && (
        <SuggestedActionButtons
          actions={suggestedActions}
          onActionPress={handleActionPress}
          onDismiss={handleDismissSuggestedActions}
        />
      )}

      {/* Memory Suggestion Card - shown when AI detects a memory intent */}
      {memorySuggestion && (
        <View style={styles.memorySuggestionContainer}>
          <MemorySuggestionCard
            suggestion={memorySuggestion}
            onDismiss={handleDismissMemorySuggestion}
            onApproved={handleDismissMemorySuggestion}
          />
        </View>
      )}

      {/* Takeaway review sheet — conditionally mounted when a session has been distilled */}
      {session?.distilledAt && (
        <TakeawayReviewSheet
          sessionId={sessionId}
          visible={showTakeaways}
          onClose={() => setShowTakeaways(false)}
        />
      )}

      {/* Voice transcription drawer */}
      <TranscriptionDrawer
        visible={showVoiceDrawer}
        displayTranscript={voice.displayTranscript}
        phase={voice.phase}
        elapsedSeconds={voice.elapsedSeconds}
        error={voice.error}
        onStopAndSend={handleVoiceStopAndSend}
        onCancel={handleVoiceCancel}
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
    headerMenuButton: {
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
    branchMarker: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: '86%',
      marginVertical: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1,
    },
    branchMarkerText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    memorySuggestionContainer: {
      position: 'absolute',
      bottom: 80,  // Above the chat input
      left: t.spacing.md,
      right: t.spacing.md,
      zIndex: 100,
    },
  }));
