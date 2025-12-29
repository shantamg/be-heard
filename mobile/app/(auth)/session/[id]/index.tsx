import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { UnifiedSessionScreen } from '@/src/screens/UnifiedSessionScreen';
import { Stage } from '@meet-without-fear/shared';

/**
 * Unified Session Screen
 *
 * Single chat-centric interface that handles all session stages.
 * No more separate screens per stage - everything flows through the chat.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const handleNavigateBack = () => {
    router.back();
  };

  const handleStageComplete = (stage: Stage) => {
    // Optionally refresh or show a transition animation
    // The UnifiedSessionScreen handles stage progression internally
    console.log(`Stage ${stage} completed`);
  };

  if (!id) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // UnifiedSessionScreen has its own header
        }}
      />
      <UnifiedSessionScreen
        sessionId={id}
        onNavigateBack={handleNavigateBack}
        onStageComplete={handleStageComplete}
      />
    </>
  );
}
