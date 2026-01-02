/**
 * Inner Work List Screen
 *
 * Lists all inner work sessions with:
 * - Summary/theme for each session
 * - Timestamp of last update
 * - Ability to continue or start new
 */

import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Plus, Heart, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInnerWorkSessions, useCreateInnerWorkSession } from '@/src/hooks';
import { createStyles } from '@/src/theme/styled';
import { InnerWorkSessionSummaryDTO } from '@meet-without-fear/shared';

// Simple time ago formatter
function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ============================================================================
// Component
// ============================================================================

export default function InnerWorkListScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useInnerWorkSessions();
  const createSession = useCreateInnerWorkSession();

  const handleStartNew = async () => {
    try {
      const result = await createSession.mutateAsync({});
      router.push(`/inner-work/${result.session.id}`);
    } catch (err) {
      console.error('Failed to create inner work session:', err);
    }
  };

  const handleOpenSession = (sessionId: string) => {
    router.push(`/inner-work/${sessionId}`);
  };

  const renderSession = ({ item }: { item: InnerWorkSessionSummaryDTO }) => {
    const timeAgo = formatTimeAgo(item.updatedAt);
    const displayTitle = item.title || item.theme || 'Untitled session';
    const displaySummary = item.summary || 'Tap to continue...';

    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() => handleOpenSession(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${displayTitle}`}
      >
        <View style={styles.sessionContent}>
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
          <Text style={styles.sessionSummary} numberOfLines={2}>
            {displaySummary}
          </Text>
          <Text style={styles.sessionTime}>{timeAgo}</Text>
        </View>
        <ChevronRight color="#666" size={20} />
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Inner Work' }} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10a37f" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sessions = data?.sessions || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Inner Work' }} />

      {/* New session button at top */}
      <TouchableOpacity
        style={styles.newButton}
        onPress={handleStartNew}
        disabled={createSession.isPending}
        accessibilityRole="button"
        accessibilityLabel="Start new inner work session"
      >
        {createSession.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Plus color="#fff" size={20} />
            <Text style={styles.newButtonText}>New Session</Text>
          </>
        )}
      </TouchableOpacity>

      {sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Heart color="#666" size={48} />
          <Text style={styles.emptyTitle}>No inner work sessions yet</Text>
          <Text style={styles.emptySubtitle}>
            Start a session to explore what's on your mind
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}
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
    newButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.accent,
      marginHorizontal: t.spacing.lg,
      marginVertical: t.spacing.md,
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.lg,
      gap: t.spacing.sm,
    },
    newButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    listContent: {
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.xl,
    },
    sessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.lg,
      padding: t.spacing.lg,
    },
    sessionContent: {
      flex: 1,
    },
    sessionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: 4,
    },
    sessionSummary: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginBottom: 8,
      lineHeight: 20,
    },
    sessionTime: {
      fontSize: 12,
      color: t.colors.textMuted,
    },
    separator: {
      height: t.spacing.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.spacing.xl,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginTop: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    emptySubtitle: {
      fontSize: 16,
      color: t.colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
    },
  }));
