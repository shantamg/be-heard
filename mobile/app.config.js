const { withPlugins } = require('@expo/config-plugins');

module.exports = ({ config }) => {
  // Set default API URL if not provided (production URL)
  if (!process.env.EXPO_PUBLIC_API_URL) {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.meetwithoutfear.com';
  }

  // Override bundle identifier for development builds
  if (process.env.EXPO_PUBLIC_BUNDLE_ID) {
    config.ios.bundleIdentifier = process.env.EXPO_PUBLIC_BUNDLE_ID;
    config.android.package = process.env.EXPO_PUBLIC_BUNDLE_ID;
  }

  if (config.android?.package === 'com.meetwithoutfear.app') {
    config.android = {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
    };
  }

  // Add apiUrl and websiteUrl to extra for access via Constants.expoConfig
  // websiteUrl is only set if explicitly provided via EXPO_PUBLIC_WEBSITE_URL
  // Otherwise, the runtime code will use __DEV__ to determine the URL
  config.extra = {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    ...(process.env.EXPO_PUBLIC_WEBSITE_URL && {
      websiteUrl: process.env.EXPO_PUBLIC_WEBSITE_URL,
    }),
  };

  return withPlugins(config, [
    'expo-secure-store',
    'expo-audio',
    [
      '@sentry/react-native/expo',
      {
        organization: 'meet-without-fear',
        project: 'mwf-mobile',
      },
    ],
  ]);
};
