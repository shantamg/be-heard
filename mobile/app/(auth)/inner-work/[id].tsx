/**
 * Inner Work Chat Screen Route
 *
 * Expo Router wrapper for the InnerWorkScreen component.
 */

import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

import { InnerWorkScreen } from '@/src/screens/InnerWorkScreen';

export default function InnerWorkChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <InnerWorkScreen
        sessionId={id || ''}
        onNavigateBack={() => router.back()}
      />
    </>
  );
}
