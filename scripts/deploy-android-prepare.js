#!/usr/bin/env node

/**
 * Prepares Android build for deployment
 * Run: npm run deploy:android:prepare
 */

const { execSync } = require('child_process');

console.log('Preparing Android build...');

try {
  // Update build number
  execSync('node scripts/update-build-number.js', { stdio: 'inherit' });

  // Build APK for Android
  execSync('cd mobile && eas build --platform android --profile android-apk', {
    stdio: 'inherit',
  });

  // Refresh the stable website download URL after a successful APK build.
  execSync('node scripts/publish-android-github-release.js', { stdio: 'inherit' });

  console.log('Android build prepared successfully!');
  console.log('Run "npm run deploy:android:release" to submit to Play Store');
} catch (error) {
  console.error('Error preparing Android build:', error.message);
  process.exit(1);
}
