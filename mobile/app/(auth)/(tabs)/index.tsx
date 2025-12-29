/**
 * Home Screen
 *
 * Simplified landing page with:
 * - Big greeting: "Hi [username]"
 * - Main question: "What can I help you work through today?"
 * - Low-profile quick actions: Continue with [nickname], New Session, Inner Work
 */

import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Plus, Heart } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/hooks/useAuth';
import { useBiometricAuth } from '@/src/hooks';
import { useSessions } from '../../../src/hooks/useSessions';
import { BiometricPrompt } from '../../../src/components/BiometricPrompt';
import { createStyles } from '@/src/theme/styled';

// ============================================================================
// Component
// ============================================================================

export default function HomeScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data, isLoading: isSessionsLoading } = useSessions();
  const { isAvailable, isEnrolled, hasPrompted, isLoading: biometricLoading } = useBiometricAuth();

  // Wait for both auth and sessions to load
  const isLoading = isAuthLoading || isSessionsLoading;

  // Biometric prompt state
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  // Show biometric prompt when conditions are met
  useEffect(() => {
    if (!biometricLoading && isAvailable && isEnrolled && !hasPrompted) {
      const timer = setTimeout(() => {
        setShowBiometricPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [biometricLoading, isAvailable, isEnrolled, hasPrompted]);

  // Find the most recent session with a partner nickname
  const mostRecentSession = useMemo(() => {
    const sessions = data?.items || [];
    if (sessions.length === 0) return null;

    // Sort by most recently updated
    const sorted = [...sessions].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return sorted[0];
  }, [data?.items]);

  // Get the partner's nickname or name for the continue button
  const partnerDisplayName = mostRecentSession?.partner?.nickname || mostRecentSession?.partner?.name;

  const handleNewSession = () => {
    router.push('/session/new');
  };

  const handleContinueSession = () => {
    if (mostRecentSession) {
      router.push(`/session/${mostRecentSession.id}`);
    }
  };

  const handleInnerWork = () => {
    // Navigate to inner work / self-session flow
    router.push('/session/new?mode=inner');
  };

  // Get the user's display name
  const userName = user?.firstName || user?.name?.split(' ')[0] || 'there';

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10a37f" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        {/* Main greeting section - centered */}
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>Hi {userName}</Text>
          <Text style={styles.question}>
            What can I help you work through today?
          </Text>
        </View>

        {/* Low-profile action buttons at bottom */}
        <View style={styles.actionsSection}>
          {/* Continue with partner - only show if there's a recent session */}
          {mostRecentSession && partnerDisplayName && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleContinueSession}
              accessibilityRole="button"
              accessibilityLabel={`Continue with ${partnerDisplayName}`}
            >
              <ArrowRight color="#888" size={18} />
              <Text style={styles.actionText}>
                Continue with {partnerDisplayName}
              </Text>
            </TouchableOpacity>
          )}

          {/* New Session */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleNewSession}
            accessibilityRole="button"
            accessibilityLabel="Start new session"
          >
            <Plus color="#888" size={18} />
            <Text style={styles.actionText}>New Session</Text>
          </TouchableOpacity>

          {/* Inner Work */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleInnerWork}
            accessibilityRole="button"
            accessibilityLabel="Inner work"
          >
            <Heart color="#888" size={18} />
            <Text style={styles.actionText}>Inner Work</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Biometric opt-in prompt */}
      <BiometricPrompt
        visible={showBiometricPrompt}
        onDismiss={() => setShowBiometricPrompt(false)}
        testID="biometric-prompt"
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
    content: {
      flex: 1,
      paddingHorizontal: t.spacing.xl,
    },
    greetingSection: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 60, // Offset slightly above center
    },
    greeting: {
      fontSize: 36,
      fontWeight: '700',
      color: t.colors.textPrimary,
      marginBottom: t.spacing.lg,
      textAlign: 'center',
    },
    question: {
      fontSize: 20,
      color: t.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 28,
      maxWidth: 280,
    },
    actionsSection: {
      paddingBottom: t.spacing['3xl'],
      gap: t.spacing.sm,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      gap: t.spacing.sm,
    },
    actionText: {
      fontSize: 15,
      color: t.colors.textMuted,
    },
  }));
