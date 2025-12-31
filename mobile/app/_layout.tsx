import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { ClerkProvider, ClerkLoaded, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';

import { AuthContext, useAuthProvider } from '@/src/hooks/useAuth';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { setTokenProvider } from '@/src/lib/api';
import { ToastProvider } from '@/src/contexts/ToastContext';
import { useNotifications } from '@/src/hooks/useNotifications';
import { configureNotificationHandler } from '@/src/services/notifications';

// Configure notification handler at module load
configureNotificationHandler();

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Clerk publishable key
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

// Log Clerk key status for debugging (first 10 chars only for security)
if (__DEV__) {
  console.log('[Clerk] Key present:', !!CLERK_PUBLISHABLE_KEY);
  console.log('[Clerk] Key prefix:', CLERK_PUBLISHABLE_KEY.substring(0, 10));
} else if (!CLERK_PUBLISHABLE_KEY) {
  console.error('[Clerk] CRITICAL: No publishable key in production build!');
}

/**
 * Component to hide splash screen once Clerk is loaded
 */
function HideSplashOnReady() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

/**
 * Notification initializer component
 */
function NotificationInitializer() {
  useNotifications();
  return null;
}

/**
 * Clerk auth setup - just configures API client token provider
 */
function ClerkAuthSetup() {
  const { getToken, signOut } = useClerkAuth();

  useEffect(() => {
    // Tell the API client how to get tokens from Clerk
    setTokenProvider({
      getToken: async (options) => getToken({ skipCache: options?.forceRefresh }),
      signOut,
    });
  }, [getToken, signOut]);

  return null;
}

/**
 * Root layout component
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({});

  // Keep showing splash screen until fonts are loaded
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        <HideSplashOnReady />
        <ClerkAuthSetup />
        <AuthProviderWrapper />
      </ClerkLoaded>
    </ClerkProvider>
  );
}

/**
 * Auth provider wrapper - must be inside ClerkLoaded so useAuthProvider can use Clerk hooks
 */
function AuthProviderWrapper() {
  const auth = useAuthProvider();

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthContext.Provider value={auth}>
          <QueryProvider>
            <ToastProvider>
              <NotificationInitializer />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(public)" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="+not-found" options={{ headerShown: true }} />
              </Stack>
              <StatusBar style="light" />
            </ToastProvider>
          </QueryProvider>
        </AuthContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
