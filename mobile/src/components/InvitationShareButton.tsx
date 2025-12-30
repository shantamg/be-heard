/**
 * InvitationShareButton Component
 *
 * A compact share button that appears above the chat input when
 * the user has confirmed an invitation message. Displays the
 * invitation message and triggers the share sheet on tap.
 */

import { View, Text, TouchableOpacity, Share, StyleSheet } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { colors } from '../theme';

interface InvitationShareButtonProps {
  /** The invitation message to share */
  invitationMessage: string;
  /** The invitation URL to share */
  invitationUrl: string;
  /** Partner's name for the share dialog */
  partnerName?: string;
  /** The sender's name (user inviting) */
  senderName?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Callback when share is successful */
  onShareSuccess?: () => void;
  /** Test ID for testing */
  testID?: string;
}

export function InvitationShareButton({
  invitationMessage,
  invitationUrl,
  partnerName,
  senderName,
  disabled = false,
  onShareSuccess,
  testID,
}: InvitationShareButtonProps) {
  const handleShare = async () => {
    if (disabled) return;

    try {
      // Format: "(user) would like to invite you to Meet Without Fear"
      // Then the link, then the invitation message
      const senderDisplay = senderName || 'Someone';
      const shareMessage = `${senderDisplay} would like to invite you to Meet Without Fear\n\n${invitationUrl}\n\n${invitationMessage}`;

      const result = await Share.share({
        message: shareMessage,
        title: partnerName ? `Invitation for ${partnerName}` : 'Join me on Meet Without Fear',
        url: invitationUrl,
      });

      if (result.action === Share.sharedAction) {
        onShareSuccess?.();
      }
    } catch (error) {
      console.error('[InvitationShareButton] Share error:', error);
    }
  };

  const buttonText = partnerName ? `Invite ${partnerName}` : 'Share Invitation';

  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.containerDisabled]}
      onPress={handleShare}
      disabled={disabled}
      activeOpacity={0.8}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={buttonText}
      accessibilityHint="Opens share sheet to send invitation"
    >
      <View style={styles.content}>
        <Share2 color="#FFFFFF" size={18} />
        <Text style={styles.buttonText}>{buttonText}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.accent,
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  containerDisabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
