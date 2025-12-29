/**
 * StrategicRepairScreen Component
 *
 * Stage 4 - Strategic Repair
 * Implements the strategy pool, ranking, overlap reveal, and agreement flow.
 * Strategies are shown without attribution to focus on the ideas themselves.
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
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
  useProposeStrategy,
  useMarkReadyToRank,
  useSubmitRankings,
  useStrategiesReveal,
  useAgreements,
  useConfirmAgreement,
  useResolveSession,
  useCommonGround,
  useCreateAgreement,
} from '../hooks/useStages';
import { useSession } from '../hooks/useSessions';
import { StrategyPhase, AgreementType } from '@meet-without-fear/shared';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface Strategy {
  id: string;
  description: string;
  duration?: string;
  isUserContributed?: boolean;
}

interface CommonGroundItem {
  id: string;
  need: string;
  category: string;
  description: string;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Common Ground Foundation Card
 * Displays shared needs from Stage 3 to provide context for strategy selection.
 */
function CommonGroundFoundation({
  commonGround,
}: {
  commonGround: CommonGroundItem[];
}) {
  if (commonGround.length === 0) return null;

  return (
    <View style={subStyles.commonGroundContainer}>
      <Text style={subStyles.commonGroundTitle}>Common Ground Foundation</Text>
      <Text style={subStyles.commonGroundSubtitle}>
        These shared needs guide our strategy search
      </Text>
      <View style={subStyles.commonGroundList}>
        {commonGround.map((item) => (
          <View key={item.id} style={subStyles.commonGroundItem}>
            <Text style={subStyles.commonGroundNeed}>{item.need}</Text>
            <Text style={subStyles.commonGroundDescription}>
              {item.description}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * User Strategy Input Component
 * Allows users to propose their own strategies.
 */
function UserStrategyInput({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (description: string) => void;
  isSubmitting: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (description.trim()) {
      onSubmit(description.trim());
      setDescription('');
      setIsExpanded(false);
    }
  };

  if (!isExpanded) {
    return (
      <TouchableOpacity
        style={subStyles.addIdeaButton}
        onPress={() => setIsExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel="Add your own idea"
      >
        <Text style={subStyles.addIdeaButtonText}>+ Add your own idea</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={subStyles.inputContainer}>
      <Text style={subStyles.inputLabel}>Your Strategy Idea</Text>
      <TextInput
        style={subStyles.textInput}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe your strategy idea..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
        accessibilityLabel="Strategy description input"
      />
      <View style={subStyles.inputActions}>
        <TouchableOpacity
          style={subStyles.cancelButton}
          onPress={() => {
            setIsExpanded(false);
            setDescription('');
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={subStyles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            subStyles.submitButton,
            (!description.trim() || isSubmitting) &&
              subStyles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!description.trim() || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Submit your idea"
        >
          <Text
            style={[
              subStyles.submitButtonText,
              (!description.trim() || isSubmitting) &&
                subStyles.submitButtonTextDisabled,
            ]}
          >
            {isSubmitting ? 'Adding...' : 'Add Idea'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * No Overlap Actions Component
 * Shows helpful options when rankings do not overlap.
 */
function NoOverlapActions({
  onGenerateMore,
  onCreateHybrid,
  isGenerating,
  strategies,
}: {
  onGenerateMore: () => void;
  onCreateHybrid: (description: string) => void;
  isGenerating: boolean;
  strategies: Strategy[];
}) {
  const [showHybridInput, setShowHybridInput] = useState(false);
  const [hybridDescription, setHybridDescription] = useState('');

  const handleCreateHybrid = () => {
    if (hybridDescription.trim()) {
      onCreateHybrid(hybridDescription.trim());
      setHybridDescription('');
      setShowHybridInput(false);
    }
  };

  return (
    <View style={subStyles.noOverlapActionsContainer}>
      <Text style={subStyles.noOverlapTitle}>Different Priorities</Text>
      <Text style={subStyles.noOverlapMessage}>
        Your rankings did not overlap, but that is valuable information. Here
        are some ways to move forward:
      </Text>

      <View style={subStyles.actionButtons}>
        <TouchableOpacity
          style={[
            subStyles.actionButton,
            isGenerating && subStyles.actionButtonDisabled,
          ]}
          onPress={onGenerateMore}
          disabled={isGenerating}
          accessibilityRole="button"
          accessibilityLabel="Generate more ideas"
        >
          <Text style={subStyles.actionButtonText}>
            {isGenerating ? 'Generating...' : 'Generate More Ideas'}
          </Text>
          <Text style={subStyles.actionButtonHint}>
            Get fresh AI-generated strategies
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={subStyles.actionButton}
          onPress={() => setShowHybridInput(!showHybridInput)}
          accessibilityRole="button"
          accessibilityLabel="Create hybrid strategy"
        >
          <Text style={subStyles.actionButtonText}>Create Hybrid</Text>
          <Text style={subStyles.actionButtonHint}>
            Combine elements from different strategies
          </Text>
        </TouchableOpacity>
      </View>

      {showHybridInput && (
        <View style={subStyles.hybridInputContainer}>
          <Text style={subStyles.hybridInputLabel}>
            Create a new strategy by combining ideas:
          </Text>
          <View style={subStyles.hybridStrategiesList}>
            {strategies.slice(0, 4).map((s) => (
              <Text key={s.id} style={subStyles.hybridStrategyItem}>
                - {s.description.substring(0, 50)}...
              </Text>
            ))}
          </View>
          <TextInput
            style={subStyles.textInput}
            value={hybridDescription}
            onChangeText={setHybridDescription}
            placeholder="Describe your hybrid strategy..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity
            style={[
              subStyles.submitButton,
              !hybridDescription.trim() && subStyles.submitButtonDisabled,
            ]}
            onPress={handleCreateHybrid}
            disabled={!hybridDescription.trim()}
            accessibilityRole="button"
            accessibilityLabel="Submit hybrid strategy"
          >
            <Text
              style={[
                subStyles.submitButtonText,
                !hybridDescription.trim() && subStyles.submitButtonTextDisabled,
              ]}
            >
              Create Hybrid Strategy
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={subStyles.discussSection}>
        <Text style={subStyles.discussTitle}>Discuss Together</Text>
        <Text style={subStyles.discussText}>
          Take a moment to talk about why certain strategies appealed to each of
          you. Understanding each other's perspective can help find common
          ground.
        </Text>
      </View>
    </View>
  );
}

/**
 * Follow-up Scheduler Component
 * Allows scheduling a check-in date after agreement.
 */
function FollowUpScheduler({
  onSchedule,
  initialDate,
}: {
  onSchedule: (date: Date | null) => void;
  initialDate?: Date;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    initialDate || null
  );
  const [reminderEnabled, setReminderEnabled] = useState(false);

  const handleDateChange = (
    event: DateTimePickerEvent,
    date: Date | undefined
  ) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (date) {
      setSelectedDate(date);
      onSchedule(date);
    }
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);

  return (
    <View style={subStyles.followUpContainer}>
      <Text style={subStyles.followUpTitle}>Schedule Follow-up Check-in</Text>
      <Text style={subStyles.followUpSubtitle}>
        Set a date to review how the experiment is going
      </Text>

      <TouchableOpacity
        style={subStyles.dateButton}
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel="Select follow-up date"
      >
        <Text style={subStyles.dateButtonText}>
          {selectedDate
            ? selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : 'Select a date'}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={selectedDate || minDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={minDate}
          themeVariant="dark"
        />
      )}

      {selectedDate && (
        <TouchableOpacity
          style={subStyles.reminderToggle}
          onPress={() => setReminderEnabled(!reminderEnabled)}
          accessibilityRole="switch"
          accessibilityState={{ checked: reminderEnabled }}
          accessibilityLabel="Enable reminder notification"
        >
          <View
            style={[
              subStyles.reminderCheckbox,
              reminderEnabled && subStyles.reminderCheckboxChecked,
            ]}
          >
            {reminderEnabled && <Text style={subStyles.checkmark}>✓</Text>}
          </View>
          <Text style={subStyles.reminderText}>
            Remind me on this date
          </Text>
        </TouchableOpacity>
      )}

      {selectedDate && (
        <TouchableOpacity
          style={subStyles.clearDateButton}
          onPress={() => {
            setSelectedDate(null);
            onSchedule(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear date"
        >
          <Text style={subStyles.clearDateText}>Clear date</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function StrategicRepairScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Local state for follow-up scheduling
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);

  // Session data
  const { data: sessionData } = useSession(sessionId);
  const session = sessionData?.session;

  // Common ground data from Stage 3
  const { data: commonGroundData } = useCommonGround(sessionId);

  // Strategy data and mutations
  const { data: strategyData, isLoading: isLoadingStrategies } =
    useStrategies(sessionId);

  const { mutate: requestSuggestions, isPending: isGenerating } =
    useRequestStrategySuggestions();

  const { mutate: proposeStrategy, isPending: isProposing } =
    useProposeStrategy();

  const { mutate: markReady } = useMarkReadyToRank();
  const { mutate: submitRankings } = useSubmitRankings();
  const { data: revealData } = useStrategiesReveal(sessionId);
  const { data: agreementsData } = useAgreements(sessionId);
  const { mutate: confirmAgreement } = useConfirmAgreement();
  const { mutate: resolveSession } = useResolveSession();
  const { mutate: createAgreement } = useCreateAgreement();

  // Determine current phase
  const phase = strategyData?.phase || StrategyPhase.COLLECTING;

  // Transform strategies for components
  // Note: source is intentionally not exposed in StrategyDTO to keep strategies unlabeled
  const strategies: Strategy[] = (strategyData?.strategies || []).map((s) => ({
    id: s.id,
    description: s.description,
    duration: s.duration || undefined,
  }));

  // Transform common ground for display
  const commonGround: CommonGroundItem[] = (
    commonGroundData?.commonGround || []
  ).map((cg) => ({
    id: cg.id,
    need: cg.need,
    category: cg.category,
    description: cg.description,
  }));

  // Handle loading state
  if (isLoadingStrategies) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
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

  // Handle user strategy proposal
  const handleProposeStrategy = (description: string) => {
    if (sessionId) {
      proposeStrategy({
        sessionId,
        description,
      });
    }
  };

  // Handle creating hybrid strategy (as agreement)
  const handleCreateHybrid = (description: string) => {
    if (sessionId) {
      createAgreement({
        sessionId,
        description,
        type: AgreementType.HYBRID,
        followUpDate: followUpDate?.toISOString(),
      });
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
        <ScrollView style={styles.scrollContainer}>
          {/* Common Ground Foundation */}
          <CommonGroundFoundation commonGround={commonGround} />

          {/* User Strategy Input */}
          <View style={styles.userInputSection}>
            <UserStrategyInput
              onSubmit={handleProposeStrategy}
              isSubmitting={isProposing}
            />
          </View>
        </ScrollView>

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

    const hasOverlap = overlappingStrategies.length > 0;

    // For now, we don't have the unique strategies in the API response
    // This would need to be added to the backend

    if (!hasOverlap) {
      // Show enhanced no-overlap UI
      return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <ScrollView style={styles.scrollContainer}>
            <NoOverlapActions
              onGenerateMore={handleRequestMore}
              onCreateHybrid={handleCreateHybrid}
              isGenerating={isGenerating}
              strategies={strategies}
            />
          </ScrollView>
        </SafeAreaView>
      );
    }

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
          <ScrollView style={styles.scrollContainer}>
            <AgreementCard
              agreement={{
                experiment: agreement.description,
                duration: agreement.duration || 'To be determined',
                successMeasure:
                  agreement.measureOfSuccess || 'To be defined together',
                checkInDate: agreement.followUpDate || followUpDate?.toISOString() || undefined,
              }}
              onConfirm={handleConfirmAgreement}
            />

            {/* Follow-up Scheduler */}
            {!agreement.followUpDate && (
              <FollowUpScheduler
                onSchedule={setFollowUpDate}
                initialDate={followUpDate || undefined}
              />
            )}
          </ScrollView>
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
// Main Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scrollContainer: {
    flex: 1,
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
    color: colors.textSecondary,
    textAlign: 'center',
  },
  userInputSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});

// ============================================================================
// Sub-Component Styles
// ============================================================================

const subStyles = StyleSheet.create({
  // Common Ground Foundation
  commonGroundContainer: {
    padding: 16,
    backgroundColor: 'rgba(16, 163, 127, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  commonGroundTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  commonGroundSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  commonGroundList: {
    gap: 8,
  },
  commonGroundItem: {
    padding: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  commonGroundNeed: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  commonGroundDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // User Strategy Input
  addIdeaButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addIdeaButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  cancelButton: {
    padding: 10,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  submitButton: {
    padding: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
    borderRadius: 6,
  },
  submitButtonDisabled: {
    backgroundColor: colors.bgTertiary,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  submitButtonTextDisabled: {
    color: colors.textMuted,
  },

  // No Overlap Actions
  noOverlapActionsContainer: {
    padding: 20,
  },
  noOverlapTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  noOverlapMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  actionButtons: {
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  actionButtonHint: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  hybridInputContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  hybridInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  hybridStrategiesList: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
  },
  hybridStrategyItem: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  discussSection: {
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  discussTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  discussText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Follow-up Scheduler
  followUpContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
  },
  followUpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  followUpSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  dateButton: {
    padding: 14,
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  reminderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  reminderCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderCheckboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  reminderText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  clearDateButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  clearDateText: {
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});

export default StrategicRepairScreen;
