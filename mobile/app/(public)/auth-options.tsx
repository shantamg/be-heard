import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn, useOAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '@/theme';

WebBrowser.maybeCompleteAuthSession();

/**
 * Auth options screen
 * Shows OAuth buttons and email sign-in options
 */
export default function AuthOptionsScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startAppleOAuth } = useOAuth({ strategy: 'oauth_apple' });
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer for resend button
  const startResendCountdown = useCallback(() => {
    setResendCountdown(30);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Start countdown when verification begins
  useEffect(() => {
    if (pendingVerification) {
      startResendCountdown();
    }
  }, [pendingVerification, startResendCountdown]);

  const handleOAuthSignIn = async (startOAuthFlow: any, provider: string) => {
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
    } catch (err) {
      console.error(`OAuth error (${provider}):`, err);
      setError(`Failed to continue with ${provider}`);
    }
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email');
      return;
    }

    if (!isLoaded) {
      setError('Authentication not ready');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      if (!signIn) {
        throw new Error('Sign in not initialized');
      }

      const signInAttempt = await signIn.create({
        identifier: email.trim().toLowerCase(),
      });

      const emailCodeFactor = signInAttempt.supportedFirstFactors?.find(
        (f) => f.strategy === 'email_code' && 'emailAddressId' in f
      );

      if (!emailCodeFactor || !('emailAddressId' in emailCodeFactor)) {
        throw new Error('Email code verification not available');
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailCodeFactor.emailAddressId,
      });

      setPendingVerification(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send code';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0 || isResending) {
      return;
    }

    if (!isLoaded || !signIn) {
      setError('Authentication not ready');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsResending(true);

    try {
      // Re-create sign-in attempt and prepare first factor to resend code
      const signInAttempt = await signIn.create({
        identifier: email.trim().toLowerCase(),
      });

      const emailCodeFactor = signInAttempt.supportedFirstFactors?.find(
        (f) => f.strategy === 'email_code' && 'emailAddressId' in f
      );

      if (!emailCodeFactor || !('emailAddressId' in emailCodeFactor)) {
        throw new Error('Email code verification not available');
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailCodeFactor.emailAddressId,
      });

      setSuccessMessage('Code sent!');
      startResendCountdown();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resend code';
      setError(message);
      // Allow retry after 5 seconds on error
      setTimeout(() => {
        setResendCountdown(0);
      }, 5000);
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }

    if (code.length !== 6) {
      setError('Code must be 6 digits');
      return;
    }

    if (!isLoaded) {
      setError('Authentication not ready');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      if (!signIn || !setActive) {
        throw new Error('Sign in not initialized');
      }

      const signInAttempt = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/(auth)/(tabs)');
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid code';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (pendingVerification) {
      setCode('');
      setError(null);
      setPendingVerification(false);
    } else {
      router.back();
    }
  };

  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <AntDesign name="left" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>Enter verification code</Text>
            <Text style={styles.subtitle}>We sent a code to {email}</Text>

            {error && <Text style={styles.error}>{error}</Text>}
            {successMessage && <Text style={styles.success}>{successMessage}</Text>}

            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              textAlign="center"
            />

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleVerifyCode}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            {/* Resend Code Button */}
            <TouchableOpacity
              style={[
                styles.resendButton,
                (resendCountdown > 0 || isResending) && styles.resendButtonDisabled,
              ]}
              onPress={handleResendCode}
              disabled={resendCountdown > 0 || isResending}
            >
              {isResending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text
                  style={[
                    styles.resendButtonText,
                    resendCountdown > 0 && styles.resendButtonTextDisabled,
                  ]}
                >
                  {resendCountdown > 0
                    ? `Resend code in ${resendCountdown}s`
                    : 'Resend code'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton} onPress={handleBack}>
              <Text style={styles.linkText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <AntDesign name="left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Sign in or create an account to continue</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          {/* OAuth Buttons */}
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

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with email</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null);
            }}
            placeholder="Email address"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSendCode}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Continue with email</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  keyboardView: {
    flex: 1,
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
  success: {
    fontSize: 14,
    color: colors.success,
    marginBottom: 16,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 24,
    letterSpacing: 8,
    marginBottom: 16,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: colors.accentHover,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: colors.textSecondary,
    fontSize: 14,
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  resendButtonDisabled: {
    opacity: 0.7,
  },
  resendButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  resendButtonTextDisabled: {
    color: colors.textSecondary,
  },
});
