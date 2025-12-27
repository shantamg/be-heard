const { withPlugins } = require('@expo/config-plugins');

module.exports = ({ config }) => {
  // Set default API URL if not provided (production URL when we have one)
  if (!process.env.EXPO_PUBLIC_API_URL) {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
  }

  // Override bundle identifier for development builds
  if (process.env.EXPO_PUBLIC_BUNDLE_ID) {
    config.ios.bundleIdentifier = process.env.EXPO_PUBLIC_BUNDLE_ID;
    config.android.package = process.env.EXPO_PUBLIC_BUNDLE_ID;
  }

  // Add apiUrl to extra for access via Constants.expoConfig
  config.extra = {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  };

  return withPlugins(config, ['expo-secure-store']);
};
