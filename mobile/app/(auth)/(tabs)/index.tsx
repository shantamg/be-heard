/**
 * Home Screen
 *
 * Main dashboard showing sessions with smart hero card for urgent sessions.
 * Features:
 * - Hero card for most urgent session (action needed first)
 * - Session list sorted by priority
 * - Empty state with new session CTA
 * - Pull to refresh
 */

import { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/hooks/useAuth';
import { useSessions } from '../../../src/hooks/useSessions';
import { SessionCard } from '../../../src/components/SessionCard';
import type { SessionSummaryDTO } from '@be-heard/shared';

// ============================================================================
// Component
// ============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useSessions();

  // Sort sessions: action needed first, then by last updated
  const sortedSessions = useMemo(() => {
    const sessions = data?.items || [];
    return [...sessions].sort((a, b) => {
      // Sessions with selfActionNeeded come first
      const aHasAction = a.selfActionNeeded.length > 0;
      const bHasAction = b.selfActionNeeded.length > 0;

      if (aHasAction && !bHasAction) return -1;
      if (bHasAction && !aHasAction) return 1;

      // Then sort by most recently updated
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [data?.items]);

  const heroSession = sortedSessions[0];
  const otherSessions = sortedSessions.slice(1);

  const handleNewSession = () => {
    router.push('/session/new');
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (!sortedSessions.length) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          {/* Welcome header */}
          <View style={styles.welcomeSection}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
          </View>

          <View style={styles.emptyContent}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>&#128172;</Text>
            </View>
            <Text style={styles.emptyTitle}>No active sessions</Text>
            <Text style={styles.emptySubtitle}>
              Start a new conversation to work through something together
            </Text>
            <TouchableOpacity
              style={styles.newSessionButton}
              onPress={handleNewSession}
              accessibilityRole="button"
              accessibilityLabel="Create new session"
            >
              <Plus color="#FFFFFF" size={20} />
              <Text style={styles.newSessionButtonText}>New Session</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Render session list item
  const renderSession = ({ item }: { item: SessionSummaryDTO }) => (
    <SessionCard session={item} />
  );

  // Key extractor for FlatList
  const keyExtractor = (item: SessionSummaryDTO) => item.id;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={otherSessions}
        keyExtractor={keyExtractor}
        renderItem={renderSession}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#4F46E5"
            colors={['#4F46E5']}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Welcome section */}
            <View style={styles.welcomeSection}>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.userName}>{user?.name || 'User'}</Text>
            </View>

            {/* Header with new session button */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Your Sessions</Text>
              <TouchableOpacity
                style={styles.headerNewButton}
                onPress={handleNewSession}
                accessibilityRole="button"
                accessibilityLabel="Create new session"
              >
                <Plus color="#4F46E5" size={24} />
              </TouchableOpacity>
            </View>

            {/* Hero card for most urgent session */}
            {heroSession && (
              <SessionCard session={heroSession} isHero />
            )}

            {/* Section header for other sessions */}
            {otherSessions.length > 0 && (
              <Text style={styles.sectionTitle}>Other Sessions</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          heroSession ? null : (
            <Text style={styles.noMoreSessions}>No other sessions</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Layout containers
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyContainer: {
    flex: 1,
    padding: 16,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 280,
    alignSelf: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },

  // Welcome section
  welcomeSection: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 16,
    color: '#6B7280',
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  headerNewButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },

  // Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
    marginBottom: 16,
  },

  // Loading state
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },

  // Empty state
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },

  // New session button
  newSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  newSessionButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 8,
  },

  // No more sessions text
  noMoreSessions: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 24,
  },
});
