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

// Mock NativeUIManager
jest.mock('react-native/Libraries/ReactNative/NativeUIManager', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({
      customBubblingEventTypes: {},
      customDirectEventTypes: {},
    }),
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
  return {
    __esModule: true,
    default: {
      addWhitelistedNativeProps: jest.fn(),
      addWhitelistedUIProps: jest.fn(),
      createAnimatedComponent: (component) => component,
      call: jest.fn(),
    },
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
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      bezier: jest.fn(),
      in: jest.fn(),
      out: jest.fn(),
      inOut: jest.fn(),
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
    View: (props) => React.createElement('View', props),
    Text: (props) => React.createElement('Text', props),
    Image: (props) => React.createElement('Image', props),
    ScrollView: (props) => React.createElement('ScrollView', props),
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

// Silence the warning: Animated: `useNativeDriver` is not supported
try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
} catch {
  // Module path may differ in newer RN versions
}
