/**
 * Navigation Structure Tests
 *
 * Tests for the app navigation structure and auth gating.
 * Verifies that routes exist and that exports are properly defined.
 */

// Mock expo-font before any imports
// Import modules for testing - these will use the mocks above
import * as RootLayout from '../../app/_layout';
import * as AuthLayout from '../../app/(auth)/_layout';
import * as TabsLayout from '../../app/(auth)/(tabs)/_layout';
import * as PublicLayout from '../../app/(public)/_layout';
import * as LoginScreen from '../../app/(public)/login';
import * as SignupScreen from '../../app/(public)/signup';
import * as HomeScreen from '../../app/(auth)/(tabs)/index';
import * as SessionsScreen from '../../app/(auth)/(tabs)/sessions';
import * as ProfileScreen from '../../app/(auth)/(tabs)/profile';
import * as SessionLayout from '../../app/(auth)/session/[id]/_layout';
import * as NotFound from '../../app/+not-found';
import * as NavigationTypes from '../types/navigation';
import * as AuthHooks from '../hooks/useAuth';

// Mock Clerk to avoid loading native deps during tests
jest.mock('@clerk/clerk-expo', () => {
  const React = require('react');
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
    ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => ({
      isSignedIn: true,
      isLoaded: true,
      signOut: jest.fn(),
      getToken: jest.fn().mockResolvedValue('mock-token'),
    }),
    useUser: () => ({
      user: {
        id: 'test-user',
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        fullName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
      },
    }),
  };
});

jest.mock('@clerk/clerk-expo/token-cache', () => ({
  tokenCache: {},
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(),
}));

// Mock expo-splash-screen
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

// Mock expo-status-bar
jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

// Mock expo-router
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    }),
    useSegments: () => [],
    useRootNavigationState: () => ({ key: 'nav-key' }),
    useLocalSearchParams: () => ({}),
    usePathname: () => '/',
    Redirect: ({ href }: { href: string }) =>
      React.createElement('Text', { testID: 'redirect' }, `Redirect to ${href}`),
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) => children,
      { Screen: 'Screen' }
    ),
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) => children,
      { Screen: 'Screen' }
    ),
    Link: 'Link',
    router: {
      push: jest.fn(),
      replace: jest.fn(),
    },
  };
});

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  return {
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Mock @tanstack/react-query
jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutate: jest.fn(), isLoading: false }),
}));

// Mock notification services
jest.mock('@/src/services/notifications', () => ({
  configureNotificationHandler: jest.fn(),
}));

// Mock useNotifications hook
jest.mock('@/src/hooks/useNotifications', () => ({
  useNotifications: () => ({}),
}));

// Mock api lib
jest.mock('@/src/lib/api', () => ({
  setTokenProvider: jest.fn(),
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock Toast context
jest.mock('@/src/contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ show: jest.fn() }),
}));

// Mock QueryProvider
jest.mock('@/src/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useSessions
jest.mock('@/src/hooks/useSessions', () => ({
  useSessions: () => ({
    data: { items: [] },
    isLoading: false,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

// Mock shared types
jest.mock('@meet-without-fear/shared', () => ({
  SessionStatus: { ACTIVE: 'ACTIVE' },
  Stage: { WITNESS: 'WITNESS' },
  StageStatus: { IN_PROGRESS: 'IN_PROGRESS' },
}));

describe('Navigation Structure', () => {
  describe('Route existence', () => {
    it('has root layout file', () => {
      expect(RootLayout.default).toBeDefined();
    });

    it('has auth group layout', () => {
      expect(AuthLayout.default).toBeDefined();
    });

    it('has tabs layout', () => {
      expect(TabsLayout.default).toBeDefined();
    });

    it('has public group layout', () => {
      expect(PublicLayout.default).toBeDefined();
    });

    it('has login screen', () => {
      expect(LoginScreen.default).toBeDefined();
    });

    it('has signup screen', () => {
      expect(SignupScreen.default).toBeDefined();
    });

    it('has home tab screen', () => {
      expect(HomeScreen.default).toBeDefined();
    });

    it('has sessions tab screen', () => {
      expect(SessionsScreen.default).toBeDefined();
    });

    it('has profile tab screen', () => {
      expect(ProfileScreen.default).toBeDefined();
    });

    it('has session detail layout', () => {
      expect(SessionLayout.default).toBeDefined();
    });

    it('has not-found screen', () => {
      expect(NotFound.default).toBeDefined();
    });
  });

  describe('Navigation types', () => {
    it('module loads successfully', () => {
      // TypeScript interfaces are erased at runtime
      // We verify the module can be imported successfully
      expect(NavigationTypes).toBeDefined();
      expect(typeof NavigationTypes).toBe('object');
    });
  });
});

describe('Auth Hook', () => {
  it('exports useAuth hook', () => {
    expect(AuthHooks.useAuth).toBeDefined();
    expect(typeof AuthHooks.useAuth).toBe('function');
  });

  it('exports useAuthProvider hook', () => {
    expect(AuthHooks.useAuthProvider).toBeDefined();
    expect(typeof AuthHooks.useAuthProvider).toBe('function');
  });

  it('exports AuthContext', () => {
    expect(AuthHooks.AuthContext).toBeDefined();
  });
});
