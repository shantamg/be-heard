/**
 * Session Review Screen
 *
 * Read-only view of a completed session showing the journey timeline and outcomes.
 */

import { View, ScrollView, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { CheckCircle, Clock } from 'lucide-react-native';

import { useSession } from '../../../../src/hooks/useSessions';
import { STAGE_NAMES, Stage, SessionStatus, StageStatus, StageProgressDTO } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

interface StageReviewData {
  stage: Stage;
  name: string;
  summary: string;
  completedAt: string | null;
  isCompleted: boolean;
}

// Default stage descriptions for fallback
const DEFAULT_STAGE_SUMMARIES: Record<Stage, string> = {
  [Stage.ONBOARDING]: 'Both partners signed the Curiosity Compact',
  [Stage.WITNESS]: 'Each shared their perspective and felt heard',
  [Stage.PERSPECTIVE_STRETCH]: 'Practiced empathy by understanding each other\'s view',
  [Stage.NEED_MAPPING]: 'Identified underlying needs and found common ground',
  [Stage.STRATEGIC_REPAIR]: 'Created actionable agreements together',
};

// ============================================================================
// Component
// ============================================================================

export default function SessionReviewScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = useSession(sessionId);

  const session = data?.session;

  // Loading state
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Session Review' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      </>
    );
  }

  // Error state
  if (error || !session) {
    return (
      <>
        <Stack.Screen options={{ title: 'Session Review' }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Unable to load session review</Text>
        </View>
      </>
    );
  }

  // Determine if session is resolved
  const isResolved = session.status === SessionStatus.RESOLVED;
  const completedAt = session.resolvedAt
    ? formatDate(session.resolvedAt)
    : 'In progress';

  // Get topic from session - check for context or description fields, otherwise use partner name
  const topic = getSessionTopic(session);

  // Build stage timeline from actual session progress data
  const stageTimeline = buildStageTimeline(session.myProgress, session.partnerProgress);

  // Filter to only completed or in-progress stages
  const visibleStages = stageTimeline.filter(
    (s) => s.stage <= session.myProgress.stage
  );

  // Get agreement information if available
  const agreement = getAgreementFromSession(session);

  return (
    <>
      <Stack.Screen options={{ title: 'Session Review' }} />

      <ScrollView style={styles.container} testID="session-review-screen">
        {/* Header with resolved status */}
        <View style={styles.header}>
          <CheckCircle color="#10B981" size={32} />
          <Text style={styles.resolvedText}>
            {isResolved ? `Resolved ${completedAt}` : 'In Progress'}
          </Text>
          <Text style={styles.topic}>{topic}</Text>
        </View>

        {/* Journey Timeline */}
        <View style={styles.timeline}>
          <Text style={styles.timelineTitle}>Journey Timeline</Text>

          {visibleStages.map((stage) => (
            <View key={stage.stage} style={styles.stageCard}>
              <View style={styles.stageHeader}>
                <View style={[
                  styles.stageNumber,
                  stage.isCompleted ? styles.stageNumberCompleted : styles.stageNumberInProgress
                ]}>
                  {stage.isCompleted ? (
                    <CheckCircle color="white" size={14} />
                  ) : (
                    <Clock color="white" size={14} />
                  )}
                </View>
                <View style={styles.stageInfo}>
                  <Text style={styles.stageName}>{stage.name}</Text>
                  {stage.completedAt && (
                    <Text style={styles.stageDate}>{formatDate(stage.completedAt)}</Text>
                  )}
                </View>
              </View>
              <Text style={styles.stageSummary}>{stage.summary}</Text>
            </View>
          ))}
        </View>

        {/* Outcome Card (if resolved) */}
        {isResolved && (
          <View style={styles.outcomeCard}>
            <Text style={styles.outcomeTitle}>Agreed Actions</Text>
            {agreement ? (
              <Text style={styles.outcomeText}>{agreement}</Text>
            ) : (
              <Text style={styles.outcomeTextMuted}>
                No specific agreements recorded for this session
              </Text>
            )}
          </View>
        )}

        {/* Partner Info */}
        <View style={styles.partnerSection}>
          <Text style={styles.partnerLabel}>Session Partner</Text>
          <Text style={styles.partnerName}>{session.partner.name || 'Partner'}</Text>
        </View>
      </ScrollView>
    </>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Extract session topic from available session data.
 * Falls back to partner name if no explicit topic is set.
 */
function getSessionTopic(session: {
  partner: { name: string | null };
  // Extended fields that may or may not exist
  context?: string;
  topic?: string;
  description?: string;
}): string {
  // Check for explicit topic/description fields (if they exist in extended data)
  if ('topic' in session && session.topic) {
    return session.topic;
  }
  if ('description' in session && session.description) {
    return session.description;
  }
  if ('context' in session && session.context) {
    return session.context;
  }

  // Fall back to partner-based description
  return `Session with ${session.partner.name || 'Partner'}`;
}

/**
 * Build stage timeline from user and partner progress data.
 */
function buildStageTimeline(
  myProgress: StageProgressDTO,
  partnerProgress: StageProgressDTO
): StageReviewData[] {
  const allStages: Stage[] = [
    Stage.ONBOARDING,
    Stage.WITNESS,
    Stage.PERSPECTIVE_STRETCH,
    Stage.NEED_MAPPING,
    Stage.STRATEGIC_REPAIR,
  ];

  return allStages.map((stage) => {
    // A stage is completed if user has progressed past it
    const isCompleted = myProgress.stage > stage ||
      (myProgress.stage === stage && myProgress.status === StageStatus.COMPLETED);

    // Use completion time from progress if this is the current completed stage
    let completedAt: string | null = null;
    if (myProgress.stage === stage && myProgress.completedAt) {
      completedAt = myProgress.completedAt;
    }

    // Use stage-specific summary or fall back to default
    const summary = DEFAULT_STAGE_SUMMARIES[stage];

    return {
      stage,
      name: STAGE_NAMES[stage],
      summary,
      completedAt,
      isCompleted,
    };
  });
}

/**
 * Extract agreement/experiment text from session if available.
 */
function getAgreementFromSession(session: {
  // Extended fields that may exist
  agreement?: { experiment?: string; actions?: string[] };
  experiment?: string;
  resolvedAt: string | null;
}): string | null {
  // Check for agreement object with experiment
  if ('agreement' in session && session.agreement?.experiment) {
    return session.agreement.experiment;
  }

  // Check for agreement actions
  if ('agreement' in session && session.agreement?.actions?.length) {
    return session.agreement.actions.join('\n');
  }

  // Check for direct experiment field
  if ('experiment' in session && session.experiment) {
    return session.experiment;
  }

  return null;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  resolvedText: {
    fontSize: 14,
    color: '#10B981',
    marginTop: 8,
  },
  topic: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    color: '#1F2937',
  },
  timeline: {
    padding: 16,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: '#374151',
  },
  stageCard: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stageNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stageNumberCompleted: {
    backgroundColor: '#10B981',
  },
  stageNumberInProgress: {
    backgroundColor: '#4F46E5',
  },
  stageInfo: {
    flex: 1,
  },
  stageName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  stageDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  stageSummary: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 36,
    marginTop: 4,
  },
  outcomeCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  outcomeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 8,
  },
  outcomeText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  outcomeTextMuted: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  partnerSection: {
    padding: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  partnerLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
});
