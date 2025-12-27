/**
 * SessionCard Component
 *
 * Displays a session summary with partner info, current stage, and action status.
 * Supports both regular and hero card variants for visual hierarchy.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { SessionSummaryDTO } from '@be-heard/shared';
import { STAGE_NAMES, SessionStatus, StageStatus } from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

interface SessionCardProps {
  /** The session data to display */
  session: SessionSummaryDTO;
  /** Whether to display as a hero card (larger, more prominent) */
  isHero?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format relative time from a date string.
 * Returns strings like "2h ago", "3d ago", "1w ago"
 */
function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
}

/**
 * Get display text for session status badges
 */
function getStatusBadgeText(status: SessionStatus): string | null {
  switch (status) {
    case SessionStatus.INVITED:
    case SessionStatus.CREATED:
      return 'Pending';
    case SessionStatus.PAUSED:
      return 'Paused';
    case SessionStatus.RESOLVED:
      return 'Resolved';
    default:
      return null;
  }
}

/**
 * Get the appropriate hero card title based on session state
 */
function getHeroTitle(session: SessionSummaryDTO): string {
  const partnerName = session.partner.name || 'Partner';
  const actionNeeded = session.selfActionNeeded.length > 0;
  const waitingForPartner = session.partnerActionNeeded.length > 0;
  const partnerCompleted = session.partnerProgress.status === StageStatus.GATE_PENDING ||
                           session.partnerProgress.status === StageStatus.COMPLETED;

  if (actionNeeded && partnerCompleted) {
    return `${partnerName} is waiting for you`;
  }
  if (actionNeeded) {
    return `Ready to continue with ${partnerName}`;
  }
  if (waitingForPartner) {
    return `Waiting for ${partnerName}`;
  }
  return partnerName;
}

// ============================================================================
// Component
// ============================================================================

/**
 * SessionCard displays a summary of a session.
 *
 * Features:
 * - Partner name display
 * - Current stage indicator
 * - Action needed badge and text
 * - Status indicators (Pending, Paused, Resolved)
 * - Time since last update
 * - Hero variant for most urgent session with contextual messaging
 * - Navigates to session detail on press
 */
export function SessionCard({ session, isHero = false }: SessionCardProps) {
  const router = useRouter();

  const currentStage = session.myProgress.stage;
  const actionNeeded = session.selfActionNeeded.length > 0;
  const waitingForPartner = session.partnerActionNeeded.length > 0;
  const statusBadge = getStatusBadgeText(session.status);
  const timeAgo = formatRelativeTime(session.updatedAt);

  const handlePress = () => {
    router.push(`/session/${session.id}`);
  };

  // For hero cards, use contextual title
  const heroTitle = isHero ? getHeroTitle(session) : null;

  return (
    <TouchableOpacity
      testID={isHero ? 'hero-card' : 'session-card'}
      style={[
        styles.card,
        isHero && styles.heroCard,
        actionNeeded && !isHero && styles.actionCard,
        statusBadge === 'Paused' && styles.pausedCard,
        statusBadge === 'Resolved' && styles.resolvedCard,
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Session with ${session.partner.name || 'Partner'}`}
      accessibilityHint="Tap to view session details"
    >
      <View style={styles.header}>
        {isHero ? (
          <Text
            style={styles.heroPartnerName}
            numberOfLines={2}
          >
            {heroTitle}
          </Text>
        ) : (
          <Text
            style={styles.partnerName}
            numberOfLines={1}
          >
            {session.partner.name || 'Partner'}
          </Text>
        )}
        {actionNeeded && (
          <View
            testID="action-badge"
            style={[
              styles.badge,
              isHero && styles.heroBadge,
            ]}
            accessibilityLabel="Action needed"
          />
        )}
      </View>

      {/* Stage and time row */}
      <View style={styles.metaRow}>
        <Text
          style={[
            styles.stage,
            isHero && styles.heroStage,
          ]}
        >
          {STAGE_NAMES[currentStage]}
        </Text>
        {!isHero && (
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        )}
      </View>

      {/* Status badge for non-active states */}
      {statusBadge && !isHero && (
        <View style={[
          styles.statusBadge,
          statusBadge === 'Pending' && styles.statusBadgePending,
          statusBadge === 'Paused' && styles.statusBadgePaused,
          statusBadge === 'Resolved' && styles.statusBadgeResolved,
        ]}>
          <Text style={[
            styles.statusBadgeText,
            statusBadge === 'Resolved' && styles.statusBadgeTextResolved,
          ]}>
            {statusBadge}
          </Text>
        </View>
      )}

      {/* Action/waiting text (only for active sessions without status badge) */}
      {!statusBadge && actionNeeded && (
        <Text
          style={[
            styles.actionText,
            isHero && styles.heroActionText,
          ]}
        >
          Your turn
        </Text>
      )}

      {!statusBadge && !actionNeeded && waitingForPartner && (
        <Text
          style={[
            styles.waitingText,
            isHero && styles.heroWaitingText,
          ]}
        >
          Waiting for partner
        </Text>
      )}

      {isHero && (
        <View style={styles.heroFooter}>
          <Text style={styles.heroHint}>Tap to continue</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Base card styles
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  // Action needed card (subtle highlight)
  actionCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#4F46E5',
  },

  // Paused card (muted)
  pausedCard: {
    opacity: 0.7,
  },

  // Resolved card (subtle success)
  resolvedCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },

  // Hero card variant
  heroCard: {
    backgroundColor: '#4F46E5',
    padding: 24,
    marginBottom: 20,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 0,
  },

  // Header with name and badge
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },

  // Partner name
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  heroPartnerName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },

  // Action badge
  badge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  heroBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FCD34D',
  },

  // Meta row (stage + time)
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },

  // Stage name
  stage: {
    fontSize: 14,
    color: '#6B7280',
  },
  heroStage: {
    color: '#E0E7FF',
    fontSize: 16,
    marginTop: 4,
  },

  // Time ago text
  timeAgo: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Status badge
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 12,
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgePaused: {
    backgroundColor: '#F3F4F6',
  },
  statusBadgeResolved: {
    backgroundColor: '#D1FAE5',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#92400E',
  },
  statusBadgeTextResolved: {
    color: '#065F46',
  },

  // Action text
  actionText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 12,
  },
  heroActionText: {
    color: '#FCD34D',
    fontSize: 16,
    marginTop: 16,
  },

  // Waiting text
  waitingText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },
  heroWaitingText: {
    color: '#A5B4FC',
    fontSize: 16,
    marginTop: 16,
  },

  // Hero footer
  heroFooter: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroHint: {
    fontSize: 14,
    color: '#C7D2FE',
    textAlign: 'center',
  },
});

export default SessionCard;
