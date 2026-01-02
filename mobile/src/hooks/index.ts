/**
 * Hooks Index
 *
 * Central export point for all React Query hooks and custom hooks.
 */

// ============================================================================
// Authentication
// ============================================================================

export { useAuth, useAuthProvider, AuthContext, useUpdateMood, authKeys } from './useAuth';
export type { User, AuthContextValue } from './useAuth';

// ============================================================================
// Invitation Deep Links
// ============================================================================

export {
  useInvitationLink,
  usePendingInvitation,
  getPendingInvitation,
  clearPendingInvitation,
  createInvitationLink,
  useInvitationDetails,
  type InvitationStatus,
  type InvitationDetails,
  type InvitationErrorType,
  type UseInvitationDetailsState,
} from './useInvitation';

// ============================================================================
// Sessions
// ============================================================================

export {
  // Query keys
  sessionKeys,
  // Types
  type ListSessionsParams,
  // Hooks
  useSessions,
  useInfiniteSessions,
  useSession,
  useCreateSession,
  usePauseSession,
  useResumeSession,
  useArchiveSession,
  // Invitation hooks
  useInvitation,
  useAcceptInvitation,
  useDeclineInvitation,
  useResendInvitation,
} from './useSessions';

// ============================================================================
// Messages
// ============================================================================

export {
  // Query keys
  messageKeys,
  // Types
  type GetMessagesParams,
  type SendMessageParams,
  // Hooks
  useMessages,
  useInfiniteMessages,
  useSendMessage,
  // Emotional barometer
  useEmotionalHistory,
  useRecordEmotion,
  useCompleteExercise,
  // Optimistic updates
  useOptimisticMessage,
} from './useMessages';

// ============================================================================
// Profile
// ============================================================================

export {
  // Query keys
  profileKeys,
  // Hooks
  useProfile,
  useUpdateProfile,
  useUpdatePushToken,
  useUnregisterPushToken,
  useAblyToken,
  useDeleteAccount,
  useExportData,
} from './useProfile';

// ============================================================================
// Stages
// ============================================================================

export {
  // Query keys
  stageKeys,
  // Progress
  useProgress,
  // Stage 0: Compact
  useCompactStatus,
  useSignCompact,
  // Stage 1: Feel Heard
  useConfirmFeelHeard,
  // Stage 2: Empathy
  useEmpathyDraft,
  useSaveEmpathyDraft,
  useConsentToShareEmpathy,
  usePartnerEmpathy,
  useValidateEmpathy,
  // Stage 3: Needs
  useNeeds,
  useConfirmNeeds,
  useAddNeed,
  useConsentShareNeeds,
  useCommonGround,
  useConfirmCommonGround,
  // Stage 4: Strategies
  useStrategies,
  useProposeStrategy,
  useRequestStrategySuggestions,
  useMarkReadyToRank,
  useSubmitRankings,
  useStrategiesReveal,
  // Agreements
  useAgreements,
  useCreateAgreement,
  useConfirmAgreement,
  useResolveSession,
} from './useStages';

// ============================================================================
// Emotions (legacy - uses stub API, prefer useMessages emotion hooks)
// ============================================================================

export {
  useEmotions,
  type EmotionRecord,
  type ExerciseRecord,
  type RecordEmotionInput,
  type CompleteExerciseInput,
} from './useEmotions';

// ============================================================================
// People/Relationships
// ============================================================================

export {
  // Query keys
  personKeys,
  // Types
  type SessionStatus as PersonSessionStatus,
  type ActiveSessionInfo,
  type PersonDTO,
  type PastSessionDTO,
  type GetPersonResponse,
  type GetPastSessionsResponse,
  // Hooks
  usePerson,
  usePastSessions,
  usePeople,
} from './usePerson';

// ============================================================================
// Realtime (WebSocket)
// ============================================================================

export {
  // Types
  type RealtimeConfig,
  type RealtimeState,
  type RealtimeActions,
  // Main hook
  useRealtime,
  // Convenience hooks
  usePartnerTyping,
  usePartnerPresence,
  useSessionEvents,
} from './useRealtime';

// ============================================================================
// Notifications
// ============================================================================

export {
  useNotifications,
  type NotificationData,
  type NotificationPermissionStatus,
  type UseNotificationsReturn,
} from './useNotifications';

// ============================================================================
// Unread Notification Count
// ============================================================================

export {
  useUnreadCount,
  useUnreadCountContext,
  UnreadCountProvider,
  notificationCountKey,
  type UseUnreadCountReturn,
} from './useUnreadCount';

// ============================================================================
// Notification Preferences
// ============================================================================

export {
  notificationPreferencesKeys,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferencesDTO,
  type UpdateNotificationPreferencesRequest,
} from './useNotificationPreferences';

// ============================================================================
// Biometric Authentication
// ============================================================================

export {
  useBiometricAuth,
  type BiometricAuthState,
  type BiometricAuthActions,
  type UseBiometricAuthReturn,
} from './useBiometricAuth';

// ============================================================================
// Unified Session (Chat-Centric Interface)
// ============================================================================

export {
  useUnifiedSession,
  type OverlayType,
  type InlineCardType,
  type InlineChatCard,
} from './useUnifiedSession';

// ============================================================================
// Router Chat (Chat-First Session Creation)
// ============================================================================

export {
  useRouterChat,
  type UseRouterChatOptions,
  type UseRouterChatReturn,
} from './useRouterChat';

// ============================================================================
// Inner Work (Solo Self-Reflection)
// ============================================================================

export {
  // Query keys
  innerWorkKeys,
  // Types
  type ListInnerWorkParams,
  // Hooks
  useInnerWorkSessions,
  useInnerWorkSession,
  useCreateInnerWorkSession,
  useSendInnerWorkMessage,
  useUpdateInnerWorkSession,
  useArchiveInnerWorkSession,
} from './useInnerWork';
