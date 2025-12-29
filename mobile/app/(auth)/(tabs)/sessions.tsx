import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionCard } from '@/src/components/SessionCard';
import { useSessions } from '@/src/hooks/useSessions';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { createStyles } from '@/src/theme/styled';

/**
 * Sessions tab screen
 * Lists all user's sessions
 */
export default function SessionsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useSessions();
  const sessions = data?.items ?? [];

  const handleNewSession = () => {
    router.push('/session/new');
  };

  const handleSessionPress = (sessionId: string) => {
    router.push(`/session/${sessionId}`);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>💬</Text>
        <Text style={styles.emptyTitle}>No Sessions Yet</Text>
        <Text style={styles.emptyDescription}>
          Start your first session to begin expressing yourself and being heard
        </Text>
        <TouchableOpacity style={styles.newSessionButton} onPress={handleNewSession}>
          <Plus color="#FFFFFF" size={20} />
          <Text style={styles.newSessionButtonText}>New Session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10a37f" />
          <Text style={styles.loadingText}>Loading your sessions…</Text>
        </View>
      ) : sessions.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={sessions}
          renderItem={({ item }: { item: SessionSummaryDTO }) => (
            <TouchableOpacity onPress={() => handleSessionPress(item.id)}>
              <SessionCard session={item} />
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Floating action button for new session */}
      {sessions.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={handleNewSession}>
          <Plus color="#FFFFFF" size={28} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    listContent: {
      padding: t.spacing.lg,
    },
    separator: {
      height: t.spacing.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      padding: t.spacing['3xl'],
    },
    emptyState: {
      alignItems: 'center',
      gap: t.spacing.lg,
    },
    emptyIcon: {
      fontSize: 48,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: t.colors.textPrimary,
    },
    emptyDescription: {
      fontSize: 16,
      color: t.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    newSessionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.accent,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.lg,
      borderRadius: 12,
      gap: t.spacing.sm,
      marginTop: t.spacing.sm,
    },
    newSessionButtonText: {
      fontSize: 17,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      ...{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
      },
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: t.spacing.md,
    },
    loadingText: {
      color: t.colors.textSecondary,
      fontSize: 16,
    },
  }));
