/**
 * RefineInvitationDrawer Component
 *
 * A full-screen drawer that allows users to refine and resend their
 * invitation message after they've already shared it once. Appears
 * when tapping the "invited" status indicator.
 */

import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, RefreshCw } from 'lucide-react-native';
import { colors } from '@/theme';
import { InvitationShareButton } from './InvitationShareButton';

export interface RefineInvitationDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** The current invitation message */
  invitationMessage: string;
  /** The invitation URL */
  invitationUrl: string;
  /** Partner's name */
  partnerName?: string;
  /** Sender's name (current user) */
  senderName?: string;
  /** Callback when "Refine invitation" is tapped */
  onRefine: () => void;
  /** Callback when share is successful */
  onShareSuccess?: () => void;
  /** Callback when drawer is closed */
  onClose: () => void;
}

export function RefineInvitationDrawer({
  visible,
  invitationMessage,
  invitationUrl,
  partnerName,
  senderName,
  onRefine,
  onShareSuccess,
  onClose,
}: RefineInvitationDrawerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      testID="refine-invitation-drawer"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header with close button */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID="refine-invitation-close"
            accessibilityLabel="Close"
          >
            <X color={colors.textSecondary} size={24} />
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.title}>Would you like to resend the invitation?</Text>
          <Text style={styles.subtitle}>
            I can help you refine the message now that we've had more time to
            process what you're feeling.
          </Text>

          {/* Current invitation message */}
          <View style={styles.messageContainer}>
            <Text style={styles.messageLabel}>Current invitation:</Text>
            <Text style={styles.messageText}>"{invitationMessage}"</Text>
          </View>

          {/* Refine button */}
          <TouchableOpacity
            style={styles.refineButton}
            onPress={onRefine}
            testID="refine-invitation-button"
            activeOpacity={0.8}
          >
            <RefreshCw color={colors.accent} size={20} />
            <Text style={styles.refineButtonText}>Refine invitation</Text>
          </TouchableOpacity>
        </View>

        {/* Share button at bottom */}
        <View style={styles.footer}>
          <InvitationShareButton
            invitationMessage={invitationMessage}
            invitationUrl={invitationUrl}
            partnerName={partnerName}
            senderName={senderName}
            onShareSuccess={onShareSuccess}
            testID="refine-invitation-share"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  messageContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  messageLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 18,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 26,
  },
  refineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
  },
  refineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
  footer: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
});
