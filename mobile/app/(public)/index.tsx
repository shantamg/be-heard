import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme';

/**
 * Welcome screen - the first screen users see
 * Centered branding with single "Get Started" CTA
 */
export default function WelcomeScreen() {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push('/(public)/auth-options');
  };

  const handleTerms = () => {
    Linking.openURL('https://meetwithoutfear.app/terms');
  };

  const handlePrivacy = () => {
    Linking.openURL('https://meetwithoutfear.app/privacy');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Centered Branding Section */}
        <View style={styles.brandingSection}>
          <Text style={styles.logo}>Meet Without Fear</Text>
          <Text style={styles.tagline}>Work through conflict together</Text>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGetStarted}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
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
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
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
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 18,
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
