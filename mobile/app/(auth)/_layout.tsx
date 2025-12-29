import { Stack, Redirect } from 'expo-router';
import { useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { colors } from '@/theme';

/**
 * Auth group layout
 * Uses Clerk as the single source of truth for authentication.
 * If Clerk says signed in, we're in. No double-checking with backend.
 */
export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useClerkAuth();

  // Wait for Clerk to initialize
  if (!isLoaded) {
    return null;
  }

  // If Clerk says not signed in, redirect to public
  if (!isSignedIn) {
    return <Redirect href="/(public)" />;
  }

  // Render the app - backend profile sync happens in useAuth hook
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: colors.bgPrimary,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          color: colors.textPrimary,
        },
        contentStyle: {
          backgroundColor: colors.bgPrimary,
        },
      }}
    >
      {/* Tabs are the main navigation */}
      <Stack.Screen name="(tabs)" />

      {/* Session flow screens */}
      <Stack.Screen
        name="session/new"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'New Session',
        }}
      />
      <Stack.Screen name="session/[id]" />

      {/* Person detail */}
      <Stack.Screen
        name="person/[id]"
        options={{
          headerShown: true,
          title: 'Person',
        }}
      />

      {/* Notifications */}
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: true,
          title: 'Notifications',
        }}
      />
    </Stack>
  );
}
