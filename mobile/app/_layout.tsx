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

import { AuthContext, useAuthProvider, registerAuthAdapter } from '@/src/hooks/useAuth';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { setTokenProvider } from '@/src/lib/api';
import { ToastProvider } from '@/src/contexts/ToastContext';
import { useNotifications } from '@/src/hooks/useNotifications';
import { configureNotificationHandler } from '@/src/services/notifications';

// Configure notification handler at module load (before app renders)
configureNotificationHandler();

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Clerk publishable key
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

/**
 * Notification initializer component
 * Must be inside QueryProvider to use React Query hooks
 */
function NotificationInitializer() {
  useNotifications();
  return null;
}

/**
 * Clerk auth adapter setup
 * Registers Clerk's getToken with the auth system and API client
 */
function ClerkAuthSetup() {
  const { getToken, signOut } = useClerkAuth();

  useEffect(() => {
    // Register Clerk as the auth adapter
    registerAuthAdapter({
      getToken: async (options) => getToken({ skipCache: options?.forceRefresh }),
      signOut: async () => {
        await signOut();
      },
    });

    // Also set token provider for API client
    // When forceRefresh is true, use skipCache to bypass Clerk's token cache
    setTokenProvider({
      getToken: async (options) => getToken({ skipCache: options?.forceRefresh }),
    });
  }, [getToken, signOut]);

  return null;
}

/**
 * Root layout component
 * Provides authentication context and global providers
 */
export default function RootLayout() {
  const auth = useAuthProvider();

  const [fontsLoaded, fontError] = useFonts({
    // Add custom fonts here if needed
  });

  useEffect(() => {
    if ((fontsLoaded || fontError) && !auth.isLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, auth.isLoading]);

  // Show nothing while loading fonts or auth
  if ((!fontsLoaded && !fontError) || auth.isLoading) {
    return null;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        {/* Setup Clerk auth adapter - must be inside ClerkLoaded */}
        <ClerkAuthSetup />
        <GestureHandlerRootView style={styles.container}>
          <SafeAreaProvider>
            <AuthContext.Provider value={auth}>
              <QueryProvider>
                <ToastProvider>
                  {/* Initialize notifications - must be inside QueryProvider */}
                  <NotificationInitializer />

                  <Stack screenOptions={{ headerShown: false }}>
                    {/* Public routes - no auth required */}
                    <Stack.Screen name="(public)" />

                    {/* Auth-required routes */}
                    <Stack.Screen name="(auth)" />

                    {/* 404 handler */}
                    <Stack.Screen name="+not-found" options={{ headerShown: true }} />
                  </Stack>
                  <StatusBar style="light" />
                </ToastProvider>
              </QueryProvider>
            </AuthContext.Provider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
