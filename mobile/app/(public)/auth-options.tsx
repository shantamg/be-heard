import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useOAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '@/theme';

WebBrowser.maybeCompleteAuthSession();

/**
 * Auth options screen
 * Shows OAuth buttons for sign in
 */
export default function AuthOptionsScreen() {
  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startAppleOAuth } = useOAuth({ strategy: 'oauth_apple' });
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleOAuthSignIn = async (startOAuthFlow: typeof startGoogleOAuth, provider: string) => {
    try {
      console.log(`Starting OAuth flow for ${provider}...`);
      const result = await startOAuthFlow();
      console.log('OAuth result:', result);

      // Check if we have a valid session
      if (result.createdSessionId && result.setActive) {
        console.log('Session created:', result.createdSessionId);
        await result.setActive({ session: result.createdSessionId });
        console.log('Session activated, redirecting...');
        router.replace('/(auth)/(tabs)');
      } else if (result.signUp?.createdSessionId && result.setActive) {
        // Sometimes session is in signUp object
        console.log('Session from signUp:', result.signUp.createdSessionId);
        await result.setActive({ session: result.signUp.createdSessionId });
        router.replace('/(auth)/(tabs)');
      } else if (result.signIn?.createdSessionId && result.setActive) {
        // Or in signIn object
        console.log('Session from signIn:', result.signIn.createdSessionId);
        await result.setActive({ session: result.signIn.createdSessionId });
        router.replace('/(auth)/(tabs)');
      } else {
        console.log('No session created. SignUp status:', result.signUp?.status);
        console.log('Missing fields:', result.signUp?.missingFields);
        setError('Please complete your profile in Clerk dashboard or make phone number optional');
      }
    } catch (err: any) {
      console.error(`OAuth error (${provider}):`, err);
      const errorMessage = err?.errors?.[0]?.message || err?.message || `Failed to continue with ${provider}`;
      setError(errorMessage);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <AntDesign name="left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Sign in or create an account to continue</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={styles.oauthButton}
          onPress={() => handleOAuthSignIn(startGoogleOAuth, 'Google')}
        >
          <AntDesign name="google" size={20} color={colors.textPrimary} style={styles.buttonIcon} />
          <Text style={styles.oauthButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.oauthButton}
          onPress={() => handleOAuthSignIn(startAppleOAuth, 'Apple')}
        >
          <AntDesign name={'apple1' as any} size={20} color={colors.textPrimary} style={styles.buttonIcon} />
          <Text style={styles.oauthButtonText}>Continue with Apple</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 16,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  oauthButton: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  oauthButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  buttonIcon: {
    marginRight: 8,
  },
});
