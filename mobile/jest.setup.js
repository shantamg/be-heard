/* eslint-env jest, node */
// Jest setup file for React Native / Expo
// Add mocks as needed

// Mock the native module bridge before anything else
jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => ({
  getEnforcing: jest.fn((name) => {
    // Return mock implementations for known modules
    if (name === 'DeviceInfo' || name === 'NativeDeviceInfo') {
      return {
        getConstants: () => ({
          Dimensions: {
            window: { width: 375, height: 812, scale: 2, fontScale: 1 },
            screen: { width: 375, height: 812, scale: 2, fontScale: 1 },
          },
        }),
      };
    }
    if (name === 'PlatformConstants') {
      return {
        getConstants: () => ({
          isTesting: true,
          reactNativeVersion: { major: 0, minor: 79, patch: 2 },
        }),
      };
    }
    return {};
  }),
  get: jest.fn(() => null),
}));

// Mock NativeDeviceInfo specifically
jest.mock('react-native/src/private/specs_DEPRECATED/modules/NativeDeviceInfo', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({
      Dimensions: {
        window: { width: 375, height: 812, scale: 2, fontScale: 1 },
        screen: { width: 375, height: 812, scale: 2, fontScale: 1 },
      },
    }),
  },
}));

// Mock NativeEventEmitter
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

// Mock UIManager for React Native 0.79+
jest.mock('react-native/Libraries/ReactNative/UIManager', () => ({
  ...jest.requireActual('react-native/Libraries/ReactNative/UIManager'),
  hasViewManagerConfig: jest.fn(() => true),
  getViewManagerConfig: jest.fn(() => ({
    Commands: {},
    NativeProps: {},
    validAttributes: {},
  })),
  setLayoutAnimationEnabledExperimental: jest.fn(),
  configureNextLayoutAnimation: jest.fn(),
  createView: jest.fn(),
  updateView: jest.fn(),
  manageChildren: jest.fn(),
  setChildren: jest.fn(),
  removeRootView: jest.fn(),
  removeSubviewsFromContainerWithID: jest.fn(),
  replaceExistingNonRootView: jest.fn(),
  measure: jest.fn(),
  measureInWindow: jest.fn(),
  measureLayout: jest.fn(),
  measureLayoutRelativeToParent: jest.fn(),
  dispatchViewManagerCommand: jest.fn(),
  focus: jest.fn(),
  blur: jest.fn(),
  findSubviewIn: jest.fn(),
  getConstants: () => ({
    customBubblingEventTypes: {},
    customDirectEventTypes: {},
  }),
}));

// Mock NativeUIManager
jest.mock('react-native/Libraries/ReactNative/NativeUIManager', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({
      customBubblingEventTypes: {},
      customDirectEventTypes: {},
    }),
    hasViewManagerConfig: jest.fn(() => true),
    getViewManagerConfig: jest.fn(() => ({
      Commands: {},
      NativeProps: {},
      validAttributes: {},
    })),
    getConstantsForViewManager: jest.fn(),
    getDefaultEventTypes: jest.fn(() => []),
    setLayoutAnimationEnabledExperimental: jest.fn(),
    configureNextLayoutAnimation: jest.fn(),
    createView: jest.fn(),
    updateView: jest.fn(),
    manageChildren: jest.fn(),
    setChildren: jest.fn(),
    removeRootView: jest.fn(),
    removeSubviewsFromContainerWithID: jest.fn(),
    replaceExistingNonRootView: jest.fn(),
    measure: jest.fn(),
    measureInWindow: jest.fn(),
    measureLayout: jest.fn(),
    measureLayoutRelativeToParent: jest.fn(),
    dispatchViewManagerCommand: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
    findSubviewIn: jest.fn(),
  },
}));

// Mock PaperUIManager
jest.mock('react-native/Libraries/ReactNative/PaperUIManager', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({
      customBubblingEventTypes: {},
      customDirectEventTypes: {},
    }),
    getConstantsForViewManager: jest.fn(),
    getDefaultEventTypes: jest.fn(() => []),
  },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Modal component for React Native 0.79+ using inline view component
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  // Create a simple View-like component to avoid circular deps
  const MockView = React.forwardRef((props, ref) => {
    return React.createElement('View', { ...props, ref });
  });
  MockView.displayName = 'MockView';

  const MockModal = ({ visible, testID, children }) => {
    if (!visible) return null;
    return React.createElement(MockView, { testID }, children);
  };
  MockModal.displayName = 'Modal';
  return {
    __esModule: true,
    default: MockModal,
  };
});

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
}));

// Mock react-native-reanimated with inline mock (avoid loading the actual module)
jest.mock('react-native-reanimated', () => {
  const React = require('react');

  // Create animated component wrappers without importing react-native to avoid circular deps
  const AnimatedView = React.forwardRef((props, ref) =>
    React.createElement('View', { ...props, ref })
  );
  AnimatedView.displayName = 'Animated.View';

  const AnimatedText = React.forwardRef((props, ref) =>
    React.createElement('Text', { ...props, ref })
  );
  AnimatedText.displayName = 'Animated.Text';

  const AnimatedImage = React.forwardRef((props, ref) =>
    React.createElement('Image', { ...props, ref })
  );
  AnimatedImage.displayName = 'Animated.Image';

  const AnimatedScrollView = React.forwardRef((props, ref) =>
    React.createElement('ScrollView', { ...props, ref })
  );
  AnimatedScrollView.displayName = 'Animated.ScrollView';

  // Default export with View, Text, etc. as properties
  const Animated = {
    addWhitelistedNativeProps: jest.fn(),
    addWhitelistedUIProps: jest.fn(),
    createAnimatedComponent: (component) => component,
    call: jest.fn(),
    View: AnimatedView,
    Text: AnimatedText,
    Image: AnimatedImage,
    ScrollView: AnimatedScrollView,
  };

  return {
    __esModule: true,
    default: Animated,
    useSharedValue: jest.fn((initialValue) => ({ value: initialValue })),
    useAnimatedStyle: jest.fn(() => ({})),
    useDerivedValue: jest.fn((fn) => ({ value: fn() })),
    useAnimatedGestureHandler: jest.fn(),
    withTiming: jest.fn((value) => value),
    withSpring: jest.fn((value) => value),
    withDecay: jest.fn((value) => value),
    withDelay: jest.fn((_, value) => value),
    withSequence: jest.fn((...args) => args[args.length - 1]),
    withRepeat: jest.fn((value) => value),
    cancelAnimation: jest.fn(),
    Easing: {
      linear: jest.fn((v) => v),
      ease: jest.fn((v) => v),
      bezier: jest.fn(() => (v) => v),
      in: jest.fn((fn) => fn),
      out: jest.fn((fn) => fn),
      inOut: jest.fn((fn) => fn),
    },
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
    interpolate: jest.fn(),
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend' },
    FadeIn: { duration: jest.fn().mockReturnThis() },
    FadeOut: { duration: jest.fn().mockReturnThis() },
    SlideInRight: { duration: jest.fn().mockReturnThis() },
    SlideOutLeft: { duration: jest.fn().mockReturnThis() },
    Layout: { duration: jest.fn().mockReturnThis() },
    // Also export as named exports for destructuring import
    View: AnimatedView,
    Text: AnimatedText,
    Image: AnimatedImage,
    ScrollView: AnimatedScrollView,
  };
});

// Mock @react-native-community/slider
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props) => React.createElement('Slider', props),
  };
});

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const mockIcon = (props) => React.createElement('Icon', props);
  return new Proxy({}, {
    get: () => mockIcon,
  });
});

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[mock]' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  getBadgeCountAsync: jest.fn(() => Promise.resolve(0)),
  AndroidImportance: {
    MAX: 5,
    HIGH: 4,
    DEFAULT: 3,
    LOW: 2,
    MIN: 1,
  },
}));

// Mock expo-web-browser used by Clerk/AuthSession
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: 'success' })),
  dismissAuthSession: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

// Mock expo-auth-session (required by Clerk)
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'https://redirect.test'),
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
  AuthRequest: jest.fn(),
  ResponseType: { Code: 'code', Token: 'token' },
  CodeChallengeMethod: { S256: 'S256', Plain: 'plain' },
  AuthError: class AuthError extends Error {},
  TokenError: class TokenError extends Error {},
}));

// Mock @clerk/clerk-expo
jest.mock('@clerk/clerk-expo', () => {
  const React = require('react');
  return {
    ClerkProvider: ({ children }) => children,
    ClerkLoaded: ({ children }) => children,
    useAuth: () => ({
      isSignedIn: true,
      isLoaded: true,
      signOut: jest.fn().mockResolvedValue(undefined),
      getToken: jest.fn().mockResolvedValue('mock-token'),
    }),
    useUser: () => ({
      user: {
        id: 'test-user-id',
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        fullName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
      },
    }),
    useOAuth: () => ({
      startOAuthFlow: jest.fn().mockResolvedValue({
        createdSessionId: 'test-session',
        setActive: jest.fn(),
      }),
    }),
    useSignIn: () => ({
      signIn: { create: jest.fn(), prepareFirstFactor: jest.fn(), attemptFirstFactor: jest.fn() },
      setActive: jest.fn(),
      isLoaded: true,
    }),
    useSignUp: () => ({
      signUp: { create: jest.fn() },
      setActive: jest.fn(),
      isLoaded: true,
    }),
  };
});

// Mock @clerk/clerk-expo/token-cache
jest.mock('@clerk/clerk-expo/token-cache', () => ({
  tokenCache: {},
}));

// Mock expo-modules-core
jest.mock('expo-modules-core', () => ({
  EventSubscription: class {},
}));

// Mock expo-device
jest.mock('expo-device', () => ({
  isDevice: true,
  brand: 'Apple',
  modelName: 'iPhone 14',
  osName: 'iOS',
  osVersion: '17.0',
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'test-project-id',
        },
      },
    },
  },
}));

// Mock NativeAnimatedHelper for React Native 0.79+
jest.mock('react-native/src/private/animated/NativeAnimatedHelper', () => ({
  __esModule: true,
  default: {
    API: {
      setWaitingForIdentifier: jest.fn(),
      createAnimatedNode: jest.fn(),
      startListeningToAnimatedNodeValue: jest.fn(),
      stopListeningToAnimatedNodeValue: jest.fn(),
      connectAnimatedNodes: jest.fn(),
      disconnectAnimatedNodes: jest.fn(),
      startAnimatingNode: jest.fn(),
      stopAnimation: jest.fn(),
      setAnimatedNodeValue: jest.fn(),
      setAnimatedNodeOffset: jest.fn(),
      flattenAnimatedNodeOffset: jest.fn(),
      extractAnimatedNodeOffset: jest.fn(),
      connectAnimatedNodeToView: jest.fn(),
      disconnectAnimatedNodeFromView: jest.fn(),
      restoreDefaultValues: jest.fn(),
      dropAnimatedNode: jest.fn(),
      addAnimatedEventToView: jest.fn(),
      removeAnimatedEventFromView: jest.fn(),
      getValue: jest.fn(),
      flushQueue: jest.fn(),
      unsetWaitingForIdentifier: jest.fn(),
    },
    addWhitelistedNativeProps: jest.fn(),
    addWhitelistedUIProps: jest.fn(),
    validateProps: jest.fn(),
    assertNativeAnimatedModule: jest.fn(),
    shouldUseNativeDriver: jest.fn(() => false),
  },
  API: {
    setWaitingForIdentifier: jest.fn(),
    createAnimatedNode: jest.fn(),
    startListeningToAnimatedNodeValue: jest.fn(),
    stopListeningToAnimatedNodeValue: jest.fn(),
    connectAnimatedNodes: jest.fn(),
    disconnectAnimatedNodes: jest.fn(),
    startAnimatingNode: jest.fn(),
    stopAnimation: jest.fn(),
    setAnimatedNodeValue: jest.fn(),
    setAnimatedNodeOffset: jest.fn(),
    flattenAnimatedNodeOffset: jest.fn(),
    extractAnimatedNodeOffset: jest.fn(),
    connectAnimatedNodeToView: jest.fn(),
    disconnectAnimatedNodeFromView: jest.fn(),
    restoreDefaultValues: jest.fn(),
    dropAnimatedNode: jest.fn(),
    addAnimatedEventToView: jest.fn(),
    removeAnimatedEventFromView: jest.fn(),
    getValue: jest.fn(),
    flushQueue: jest.fn(),
    unsetWaitingForIdentifier: jest.fn(),
  },
  addWhitelistedNativeProps: jest.fn(),
  addWhitelistedUIProps: jest.fn(),
  validateProps: jest.fn(),
  assertNativeAnimatedModule: jest.fn(),
  shouldUseNativeDriver: jest.fn(() => false),
}));

// Also mock the legacy path
try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({
    __esModule: true,
    default: {
      addWhitelistedNativeProps: jest.fn(),
      addWhitelistedUIProps: jest.fn(),
      validateProps: jest.fn(),
      assertNativeAnimatedModule: jest.fn(),
      shouldUseNativeDriver: jest.fn(() => false),
    },
    shouldUseNativeDriver: jest.fn(() => false),
  }));
} catch {
  // Module path may differ in newer RN versions
}

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// Mock expo-local-authentication (virtual mock - module may not be installed yet)
jest.mock(
  'expo-local-authentication',
  () => ({
    hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
    isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
    supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1])), // FINGERPRINT = 1
    authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
    AuthenticationType: {
      FINGERPRINT: 1,
      FACIAL_RECOGNITION: 2,
      IRIS: 3,
    },
  }),
  { virtual: true }
);

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `meetwithoutfear://${path}`),
  parse: jest.fn((url) => {
    try {
      const parsed = new URL(url.replace('meetwithoutfear://', 'https://meetwithoutfear.com/'));
      return {
        path: parsed.pathname.slice(1),
        queryParams: Object.fromEntries(parsed.searchParams),
      };
    } catch {
      return { path: '', queryParams: {} };
    }
  }),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Ensure Keyboard listeners always provide a removable subscription
try {
  const { Keyboard } = require('react-native');
  Keyboard.addListener = jest.fn(() => ({ remove: jest.fn() }));
} catch {
  // If react-native isn't available for some reason, ignore
}

// Suppress expected console output during tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Patterns for expected console.log output that should be silenced
const silencedLogPatterns = [
  /^\[Mock Ably\]/, // Mock Ably presence logs from useRealtime tests
  /^\[Invitation\]/, // Invitation processing logs
  /^\[Auth\]/, // Authentication flow logs
];

// Patterns for expected console.warn output that should be silenced
const silencedWarnPatterns = [
  /^Failed to sync biometric preference/, // Expected in error handling tests
  /^Unauthorized - session may have expired/, // Expected when testing auth expiry handling
];

// Patterns for expected console.error output that should be silenced
const silencedErrorPatterns = [
  /not wrapped in act\(\.\.\.\)/, // React Query async updates
  /^\[useInvitationDetails\] Error fetching invitation/, // Expected in error handling tests
];

console.log = (...args) => {
  const message = args[0]?.toString() || '';
  const shouldSilence = silencedLogPatterns.some(pattern => pattern.test(message));
  if (!shouldSilence) {
    originalConsoleLog.apply(console, args);
  }
};

console.warn = (...args) => {
  const message = args[0]?.toString() || '';
  const shouldSilence = silencedWarnPatterns.some(pattern => pattern.test(message));
  if (!shouldSilence) {
    originalConsoleWarn.apply(console, args);
  }
};

console.error = (...args) => {
  const message = args[0]?.toString() || '';
  const shouldSilence = silencedErrorPatterns.some(pattern => pattern.test(message));
  if (!shouldSilence) {
    originalConsoleError.apply(console, args);
  }
};
