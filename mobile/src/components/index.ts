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
export { SimpleChatHeader } from './SimpleChatHeader';
export { EmotionSlider } from './EmotionSlider';
export { InlineCompact } from './InlineCompact';
export { UniversalChat } from './UniversalChat';
export type {
  UniversalChatMessage,
  InlineTrigger,
  TriggerType,
  TriggerState,
  TriggerAction,
  TriggerActionPayload,
  StageContext,
} from './UniversalChat';

// Session components
export { SessionCard } from './SessionCard';

// Emotional regulation components
export { EmotionalBarometer } from './EmotionalBarometer';
export { BreathingExercise } from './BreathingExercise';
export { GroundingExercise } from './GroundingExercise';
export { BodyScanExercise } from './BodyScanExercise';
export { IntensityCheck } from './IntensityCheck';
export { SupportOptionsModal } from './SupportOptionsModal';
export type { SupportOption } from './SupportOptionsModal';

// Stage 0 components
export { CompactTerms } from './CompactTerms';
export { CuriosityCompact } from './CuriosityCompact';
export { CuriosityCompactOverlay } from './CuriosityCompactOverlay';
export { WaitingRoom } from './WaitingRoom';
export { InvitationShareButton } from './InvitationShareButton';

// Stage 1 components
export { FeelHeardConfirmation } from './FeelHeardConfirmation';

// Stage 2 components - Perspective Stretch
export { ConsentPrompt } from './ConsentPrompt';
export { AccuracyFeedback } from './AccuracyFeedback';
export { ReadyToShareConfirmation } from './ReadyToShareConfirmation';
export { ViewEmpathyStatementDrawer } from './ViewEmpathyStatementDrawer';

// Stage 3 components - Need Mapping
export { NeedCard } from './NeedCard';
export { NeedsSection } from './NeedsSection';

// Stage 4 components - Strategic Repair
export { AgreementCard } from './AgreementCard';
export { Stage4RedesignPanel } from './Stage4RedesignPanel';
export { TendingPanel } from './TendingPanel';

// Person/Relationship components
export { PersonProfile } from './PersonProfile';
export { CurrentSessionCard } from './CurrentSessionCard';
export { PastSessionCard } from './PastSessionCard';

// Realtime/Status components
export { PartnerStatus, PartnerStatusBadge, InlineTypingIndicator } from './PartnerStatus';
export type { PartnerStatusProps } from './PartnerStatus';

// Toast component
export { Toast } from './Toast';
export type { ToastProps, ToastAction } from './Toast';

// Biometric authentication components
export { BiometricPrompt } from './BiometricPrompt';

// Branding
export { Logo } from './Logo';

// Screen layout
export { ScreenHeader } from './ScreenHeader';

// Memory components
export { MemorySuggestionCard } from './MemorySuggestionCard';

// Inner Work components
export { SuggestedActionButtons } from './SuggestedActionButtons';

// Navigation components
export { SessionDrawer } from './SessionDrawer';
