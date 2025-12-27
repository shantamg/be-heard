/**
 * StrategicRepairScreen Component
 *
 * Stage 4 - Strategic Repair
 * Implements the strategy pool, ranking, overlap reveal, and agreement flow.
 * Strategies are shown without attribution to focus on the ideas themselves.
 */

import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StrategyPool,
  StrategyRanking,
  OverlapReveal,
  AgreementCard,
  WaitingRoom,
} from '../components';
import {
  useStrategies,
  useRequestStrategySuggestions,
  useMarkReadyToRank,
  useSubmitRankings,
  useStrategiesReveal,
  useAgreements,
  useConfirmAgreement,
  useResolveSession,
} from '../hooks/useStages';
import { useSession } from '../hooks/useSessions';
import { StrategyPhase } from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

// ============================================================================
// Component
// ============================================================================

export function StrategicRepairScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Session data
  const { data: sessionData } = useSession(sessionId);
  const session = sessionData?.session;

  // Strategy data and mutations
  const { data: strategyData, isLoading: isLoadingStrategies } =
    useStrategies(sessionId);

  const { mutate: requestSuggestions, isPending: isGenerating } =
    useRequestStrategySuggestions();

  const { mutate: markReady } = useMarkReadyToRank();
  const { mutate: submitRankings } = useSubmitRankings();
  const { data: revealData } = useStrategiesReveal(sessionId);
  const { data: agreementsData } = useAgreements(sessionId);
  const { mutate: confirmAgreement } = useConfirmAgreement();
  const { mutate: resolveSession } = useResolveSession();

  // Determine current phase
  const phase = strategyData?.phase || StrategyPhase.COLLECTING;

  // Transform strategies for components
  const strategies: Strategy[] = (strategyData?.strategies || []).map((s) => ({
    id: s.id,
    description: s.description,
    duration: s.duration || undefined,
  }));

  // Handle loading state
  if (isLoadingStrategies) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading strategies...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Handle request more suggestions
  const handleRequestMore = () => {
    if (sessionId) {
      requestSuggestions({ sessionId, count: 3 });
    }
  };

  // Handle ready to rank
  const handleReady = () => {
    if (sessionId) {
      markReady({ sessionId });
    }
  };

  // Handle submit rankings
  const handleSubmitRankings = (rankedIds: string[]) => {
    if (sessionId) {
      submitRankings({ sessionId, rankedIds });
    }
  };

  // Handle confirm agreement
  const handleConfirmAgreement = () => {
    const agreement = agreementsData?.agreements?.[0];
    if (sessionId && agreement) {
      confirmAgreement(
        { sessionId, agreementId: agreement.id, confirmed: true },
        {
          onSuccess: (response) => {
            if (response.sessionCanResolve) {
              resolveSession(
                { sessionId },
                {
                  onSuccess: () => {
                    router.replace(`/session/${sessionId}`);
                  },
                }
              );
            }
          },
        }
      );
    }
  };

  // Phase: Collecting strategies
  if (phase === StrategyPhase.COLLECTING) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <StrategyPool
          strategies={strategies}
          onRequestMore={handleRequestMore}
          onReady={handleReady}
          isGenerating={isGenerating}
        />
      </SafeAreaView>
    );
  }

  // Phase: Private ranking
  if (phase === StrategyPhase.RANKING) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <StrategyRanking
          strategies={strategies}
          onSubmit={handleSubmitRankings}
        />
      </SafeAreaView>
    );
  }

  // Phase: Waiting for partner to rank
  // Note: This is typically handled by polling the phase, but we can show
  // a waiting state if we detect the user has submitted but phase hasn't changed
  if (phase === StrategyPhase.REVEALING && !revealData) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <WaitingRoom
          message="Waiting for your partner to submit their ranking"
          partnerName={session?.partner?.name || undefined}
        />
      </SafeAreaView>
    );
  }

  // Phase: Reveal overlap
  if (phase === StrategyPhase.REVEALING && revealData) {
    const overlappingStrategies = revealData.overlap.map((s) => ({
      id: s.id,
      description: s.description,
      duration: s.duration || undefined,
    }));

    // For now, we don't have the unique strategies in the API response
    // This would need to be added to the backend
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <OverlapReveal
          overlapping={overlappingStrategies}
          uniqueToMe={[]}
          uniqueToPartner={[]}
        />
      </SafeAreaView>
    );
  }

  // Phase: Negotiating / Agreement
  if (
    phase === StrategyPhase.NEGOTIATING ||
    phase === StrategyPhase.AGREED
  ) {
    const agreement = agreementsData?.agreements?.[0];

    if (agreement) {
      return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <AgreementCard
            agreement={{
              experiment: agreement.description,
              duration: agreement.duration || 'To be determined',
              successMeasure:
                agreement.measureOfSuccess || 'To be defined together',
              checkInDate: agreement.followUpDate || undefined,
            }}
            onConfirm={handleConfirmAgreement}
          />
        </SafeAreaView>
      );
    }

    // Waiting for agreement to be created
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <WaitingRoom
          message="Creating your agreement based on shared priorities..."
          partnerName={session?.partner?.name || undefined}
        />
      </SafeAreaView>
    );
  }

  // Fallback
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Setting up strategic repair...</Text>
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default StrategicRepairScreen;
