/**
 * Session Review Screen
 *
 * Read-only view of a completed session showing the journey timeline and outcomes.
 */

import { View, ScrollView, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { CheckCircle } from 'lucide-react-native';

import { useSession } from '../../../../src/hooks/useSessions';
import { STAGE_NAMES, Stage, SessionStatus } from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

interface StageReviewData {
  stage: Stage;
  name: string;
  summary: string;
  completedAt: string | null;
}

interface AgreementData {
  type: string;
  experiment: string;
  confirmedAt: string;
}

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

  // Get topic from session context (if available) or use a default
  const topic = 'Session with ' + (session.partner.name || 'Partner');

  // Build stage timeline from progress data
  const stageTimeline: StageReviewData[] = [
    {
      stage: Stage.ONBOARDING,
      name: STAGE_NAMES[Stage.ONBOARDING],
      summary: 'Both partners signed the Curiosity Compact',
      completedAt: null,
    },
    {
      stage: Stage.WITNESS,
      name: STAGE_NAMES[Stage.WITNESS],
      summary: 'Each shared their perspective and felt heard',
      completedAt: null,
    },
    {
      stage: Stage.PERSPECTIVE_STRETCH,
      name: STAGE_NAMES[Stage.PERSPECTIVE_STRETCH],
      summary: 'Practiced empathy by understanding each other\'s view',
      completedAt: null,
    },
    {
      stage: Stage.NEED_MAPPING,
      name: STAGE_NAMES[Stage.NEED_MAPPING],
      summary: 'Identified underlying needs and found common ground',
      completedAt: null,
    },
    {
      stage: Stage.STRATEGIC_REPAIR,
      name: STAGE_NAMES[Stage.STRATEGIC_REPAIR],
      summary: 'Created actionable agreements together',
      completedAt: null,
    },
  ];

  // Filter to only completed stages based on progress
  const completedStages = stageTimeline.filter(
    (s) => s.stage <= session.myProgress.stage
  );

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

          {completedStages.map((stage, index) => (
            <View key={stage.stage} style={styles.stageCard}>
              <View style={styles.stageHeader}>
                <View style={styles.stageNumber}>
                  <Text style={styles.stageNumberText}>{stage.stage}</Text>
                </View>
                <Text style={styles.stageName}>{stage.name}</Text>
              </View>
              <Text style={styles.stageSummary}>{stage.summary}</Text>
            </View>
          ))}
        </View>

        {/* Outcome Card (if resolved) */}
        {isResolved && (
          <View style={styles.outcomeCard}>
            <Text style={styles.outcomeTitle}>Agreed Actions</Text>
            <Text style={styles.outcomeText}>
              Review your agreements in the session details
            </Text>
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
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  stageNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  stageName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  stageSummary: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 32,
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
