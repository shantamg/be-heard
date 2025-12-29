// Jest setup file
// Add any global test setup here

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Patterns for expected console output that should be silenced
const silencedLogPatterns = [
  /^\[Realtime\]/,  // Realtime service logs
  /^\[Push\]/,       // Push notification logs
  /^\[sendMessage\]/, // Stage1 controller debug logs
];

const silencedWarnPatterns = [
  /^\[Bedrock\] AWS credentials not configured/, // Expected when testing without AWS creds
  /^\[Push\]/,  // Push service warnings
];

const silencedErrorPatterns = [
  /^Error recording emotion:/, // Expected in error handling tests
  /^Error getting emotions:/,  // Expected in error handling tests
  /^Error completing exercise:/, // Expected in error handling tests
];

beforeAll(() => {
  // Override console.log to silence expected patterns
  console.log = (...args) => {
    const message = args[0]?.toString() || '';
    const shouldSilence = silencedLogPatterns.some(pattern => pattern.test(message));
    if (!shouldSilence) {
      originalConsoleLog.apply(console, args);
    }
  };

  // Override console.warn to silence expected patterns
  console.warn = (...args) => {
    const message = args[0]?.toString() || '';
    const shouldSilence = silencedWarnPatterns.some(pattern => pattern.test(message));
    if (!shouldSilence) {
      originalConsoleWarn.apply(console, args);
    }
  };

  // Override console.error to silence expected patterns
  console.error = (...args) => {
    const message = args[0]?.toString() || '';
    const shouldSilence = silencedErrorPatterns.some(pattern => pattern.test(message));
    if (!shouldSilence) {
      originalConsoleError.apply(console, args);
    }
  };
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});
