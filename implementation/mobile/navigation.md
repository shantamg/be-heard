# Mobile Navigation Implementation

## Source Documentation

- [Core Layout](../../docs/mvp-planning/plans/wireframes/core-layout.md)
- [Wireframes Index](../../docs/mvp-planning/plans/wireframes/index.md)
- [User Journey](../../docs/mvp-planning/plans/overview/user-journey.md)

## Prerequisites

- [ ] `shared/session-types.md` complete (for type imports)

## External Services Required

> **None required.** This is app structure setup.

## Scope

Set up Expo Router navigation structure matching the wireframes:
- Tab navigation (Home, Sessions, Profile)
- Stack navigation for session flows
- Auth-gated routes

**Out of scope:** Screen implementations (separate plans), Clerk integration (auth-flow plan)

## Implementation Steps

### 1. Write navigation structure test

Create `mobile/src/__tests__/navigation.test.tsx`:

```typescript
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

describe('Navigation', () => {
  it('renders root layout', () => {
    // Test that app renders without crashing
  });

  it('shows auth screen when not authenticated', () => {
    // Test auth gate
  });
});
```

### 2. Create app directory structure

```
mobile/app/
├── _layout.tsx           # Root layout with providers
├── (auth)/               # Auth-required routes
│   ├── _layout.tsx       # Tab navigator
│   ├── (tabs)/
│   │   ├── _layout.tsx   # Tab bar config
│   │   ├── index.tsx     # Home tab
│   │   ├── sessions.tsx  # Sessions list
│   │   └── profile.tsx   # Profile tab
│   ├── session/
│   │   ├── [id]/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx      # Session dashboard
│   │   │   ├── chat.tsx       # Chat interface
│   │   │   ├── compact.tsx    # Stage 0: Curiosity Compact
│   │   │   ├── empathy.tsx    # Stage 2: Empathy draft
│   │   │   ├── needs.tsx      # Stage 3: Need mapping
│   │   │   └── strategies.tsx # Stage 4: Strategy ranking
│   │   └── new.tsx            # New session flow
│   └── person/
│       └── [id].tsx           # Person detail
├── (public)/             # No auth required
│   ├── _layout.tsx
│   ├── login.tsx
│   ├── signup.tsx
│   └── invitation/
│       └── [id].tsx      # Accept invitation (can trigger signup)
└── +not-found.tsx
```

### 3. Implement root layout

Create `mobile/app/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(public)" />
    </Stack>
  );
}
```

### 4. Implement tab layout

Create `mobile/app/(auth)/(tabs)/_layout.tsx`:

```typescript
import { Tabs } from 'expo-router';
import { Home, MessageCircle, User } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```

### 5. Create placeholder screens

For each route, create a minimal placeholder:

```typescript
// mobile/app/(auth)/(tabs)/index.tsx
import { View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Home Dashboard</Text>
    </View>
  );
}
```

### 6. Implement auth gate hook

Create `mobile/src/hooks/useAuth.ts`:

```typescript
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

// Placeholder - will be replaced with Clerk integration
export function useAuth() {
  const segments = useSegments();
  const router = useRouter();

  // Mock auth state for now
  const isAuthenticated = false;
  const isLoading = false;

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && !inAuthGroup) {
      router.replace('/');
    }
  }, [isAuthenticated, segments, isLoading]);

  return { isAuthenticated, isLoading };
}
```

### 7. Add navigation types

Create `mobile/src/types/navigation.ts`:

```typescript
export type SessionRouteParams = {
  id: string;
};

export type PersonRouteParams = {
  id: string;
};

export type InvitationRouteParams = {
  id: string;
};
```

### 8. Run verification

```bash
npm run check
npm run test
npx expo start  # Manual verification
```

## Verification

- [ ] App starts without errors
- [ ] Tab navigation works (Home, Sessions, Profile)
- [ ] Session routes are accessible: `/session/[id]`, `/session/[id]/chat`
- [ ] Public routes work: `/login`, `/signup`, `/invitation/[id]`
- [ ] Auth gate redirects unauthenticated users to login
- [ ] `npm run check` passes
- [ ] `npm run test` passes

## Notes

- Use `lucide-react-native` for icons (already common in RN projects)
- Screen options can be refined in individual screen plans
- Deep linking will be configured in deployment plan
- Auth gate is placeholder until Clerk integration
