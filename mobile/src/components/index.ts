/**
 * Components barrel export
 *
 * Re-exports all components for convenient importing.
 */

// Chat components
export { ChatBubble } from './ChatBubble';
export type { ChatBubbleMessage } from './ChatBubble';
export { ChatInput } from './ChatInput';
export { ChatInterface } from './ChatInterface';
export { TypingIndicator } from './TypingIndicator';

// Session components
export { SessionCard } from './SessionCard';

// Emotional regulation components
export { EmotionalBarometer } from './EmotionalBarometer';
export { BreathingExercise } from './BreathingExercise';

// Stage 0 components
export { CompactTerms } from './CompactTerms';
export { CuriosityCompact } from './CuriosityCompact';
export { WaitingRoom } from './WaitingRoom';
export { WaitingStatusMessage } from './WaitingStatusMessage';
export type { WaitingStatusType, WaitingStatusMessageProps } from './WaitingStatusMessage';

// Stage 1 components
export { FeelHeardConfirmation } from './FeelHeardConfirmation';

// Stage 2 components - Perspective Stretch
export { EmpathyAttemptCard } from './EmpathyAttemptCard';
export { ConsentPrompt } from './ConsentPrompt';
export { AccuracyFeedback } from './AccuracyFeedback';

// Stage 3 components - Need Mapping
export { NeedCard } from './NeedCard';
export { NeedsSection } from './NeedsSection';
export { CommonGroundCard } from './CommonGroundCard';

// Stage 4 components - Strategic Repair
export { StrategyCard } from './StrategyCard';
export { StrategyPool } from './StrategyPool';
export { StrategyRanking } from './StrategyRanking';
export { OverlapReveal } from './OverlapReveal';
export { AgreementCard } from './AgreementCard';

// Person/Relationship components
export { PersonProfile } from './PersonProfile';
export { CurrentSessionCard } from './CurrentSessionCard';
export { PastSessionCard } from './PastSessionCard';

// Realtime/Status components
export { PartnerStatus, PartnerStatusBadge, InlineTypingIndicator } from './PartnerStatus';
export type { PartnerStatusProps } from './PartnerStatus';

// Notification components
export { Toast } from './Toast';
export type { ToastProps, ToastAction } from './Toast';
export { NotificationBanner, PermissionBanner } from './NotificationBanner';
export type { NotificationBannerProps, PermissionBannerProps } from './NotificationBanner';
export { NotificationInbox } from './NotificationInbox';
export type {
  NotificationInboxProps,
  NotificationItem,
  NotificationType,
} from './NotificationInbox';

// Biometric authentication components
export { BiometricPrompt } from './BiometricPrompt';
