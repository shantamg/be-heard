import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { appWidthStyle, modalPageStyle, useAppAppearance } from '@/theme';
import { ChatInterface, ChatMessage } from './ChatInterface';

export interface GuidedDraftMessage extends ChatMessage {
  proposedContent?: string | null;
}

export interface GuidedDraftChatModalProps {
  visible: boolean;
  title: string;
  sessionKey: string;
  messages: GuidedDraftMessage[];
  isLoading: boolean;
  isFinalizing: boolean;
  partnerName: string;
  proposalTitle: string;
  proposalSubtitle: string;
  finalActionLabel: string;
  finalActionLatestOnly?: boolean;
  onSendMessage: (content: string) => void;
  onFinalize: (content: string) => void;
  onClose: () => void;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  finalButtonTestID?: string;
  testID?: string;
  /**
   * Optional sticky header rendered below the title and above the chat,
   * for showing the artifact being refined (e.g. a quoted proposal text).
   */
  anchorHeader?: React.ReactNode;
}

export function GuidedDraftChatModal({
  visible,
  title,
  sessionKey,
  messages,
  isLoading,
  isFinalizing,
  partnerName,
  proposalTitle,
  proposalSubtitle,
  finalActionLabel,
  finalActionLatestOnly = false,
  onSendMessage,
  onFinalize,
  onClose,
  emptyStateTitle,
  emptyStateMessage,
  finalButtonTestID,
  testID = 'guided-draft-chat-modal',
  anchorHeader,
}: GuidedDraftChatModalProps) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const latestProposalMessageId = [...messages].reverse().find((message) => message.proposedContent)?.id ?? null;

  const renderMessageExtra = useCallback((message: ChatMessage) => {
    const draftMessage = message as GuidedDraftMessage;
    if (!draftMessage.proposedContent) return null;
    const showFinalAction = !finalActionLatestOnly || draftMessage.id === latestProposalMessageId;

    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftTitle}>{proposalTitle}</Text>
          <Text style={styles.draftSubtitle}>{proposalSubtitle}</Text>
        </View>
        <Text style={styles.draftContent}>"{draftMessage.proposedContent}"</Text>
        {showFinalAction ? (
          <TouchableOpacity
            style={[styles.finalButton, isFinalizing && styles.finalButtonDisabled]}
            onPress={() => onFinalize(draftMessage.proposedContent!)}
            disabled={isFinalizing}
            testID={finalButtonTestID || `${testID}-final-button`}
          >
            {isFinalizing ? (
              <ActivityIndicator size="small" color={palette.bg} />
            ) : (
              <Text style={styles.finalButtonText}>{finalActionLabel}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [
    finalActionLabel,
    finalActionLatestOnly,
    isFinalizing,
    finalButtonTestID,
    latestProposalMessageId,
    onFinalize,
    proposalSubtitle,
    proposalTitle,
    styles.draftCard,
    styles.draftContent,
    styles.draftHeader,
    styles.draftSubtitle,
    styles.draftTitle,
    styles.finalButton,
    styles.finalButtonDisabled,
    styles.finalButtonText,
    palette.bg,
    testID,
  ]);

  if (!visible) return null;

  return (
    <View style={styles.modalPage} testID={testID}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID={`${testID}-close`}
          >
            <X color={palette.text} size={24} />
          </TouchableOpacity>
        </View>

        {anchorHeader ? (
          <View style={styles.anchorHeader} testID={`${testID}-anchor`}>
            {anchorHeader}
          </View>
        ) : null}
        <ChatInterface
          sessionId={sessionKey}
          messages={messages}
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          isInputDisabled={isFinalizing}
          partnerName={partnerName}
          slots={{ messageExtra: renderMessageExtra }}
          emptyStateTitle={emptyStateTitle}
          emptyStateMessage={emptyStateMessage}
        />
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  modalPage: {
    ...StyleSheet.absoluteFillObject,
    ...modalPageStyle,
    backgroundColor: palette.bg,
    zIndex: 100,
    elevation: 100,
  },
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    ...appWidthStyle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  closeButton: {
    padding: 4,
  },
  anchorHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  draftCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  draftHeader: {
    marginBottom: 10,
  },
  draftTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.accent,
    textTransform: 'uppercase',
  },
  draftSubtitle: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  draftContent: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.text,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  finalButton: {
    backgroundColor: palette.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  finalButtonDisabled: {
    opacity: 0.6,
  },
  finalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.bg,
  },
});

export default GuidedDraftChatModal;
