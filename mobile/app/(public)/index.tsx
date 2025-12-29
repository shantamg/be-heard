import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme';

/**
 * Welcome screen - the first screen users see
 * Shows branding, tagline, and CTAs to get started or sign in
 */
export default function WelcomeScreen() {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push('/(public)/auth-options');
  };

  const handleSignIn = () => {
    router.push('/(public)/auth-options');
  };

  const handleTerms = () => {
    // Placeholder URL - replace with actual terms page
    Linking.openURL('https://meetwithoutfear.app/terms');
  };

  const handlePrivacy = () => {
    // Placeholder URL - replace with actual privacy page
    Linking.openURL('https://meetwithoutfear.app/privacy');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Branding Section */}
        <View style={styles.brandingSection}>
          <Text style={styles.logo}>Meet Without Fear</Text>
          <Text style={styles.tagline}>Work through conflict together</Text>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGetStarted}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryLink} onPress={handleSignIn}>
            <Text style={styles.secondaryLinkText}>
              Already have an account? <Text style={styles.signInText}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Legal Links */}
        <View style={styles.legalSection}>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={handleTerms}>
              <Text style={styles.legalText}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.legalDivider}>|</Text>
            <TouchableOpacity onPress={handlePrivacy}>
              <Text style={styles.legalText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  brandingSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  ctaSection: {
    paddingBottom: 24,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryLinkText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  signInText: {
    color: colors.accent,
    fontWeight: '600',
  },
  legalSection: {
    paddingBottom: 24,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  legalDivider: {
    color: colors.textMuted,
    fontSize: 14,
    marginHorizontal: 12,
  },
});
