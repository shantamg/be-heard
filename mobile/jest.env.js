// Set environment variables before any imports
// Skip peer deps check for @testing-library/react-native
process.env.RNTL_SKIP_DEPS_CHECK = 'true';

// Set up the React Native bridge config for testing
// This is required for native module access in tests
global.__fbBatchedBridgeConfig = {
  remoteModuleConfig: [],
  localModulesConfig: [],
};
