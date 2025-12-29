# Home Dashboard Implementation

## Source Documentation

- [Home Dashboard Wireframe](../../docs/mvp-planning/plans/wireframes/home-dashboard.md)
- [User Journey](../../docs/mvp-planning/plans/overview/user-journey.md)

## Prerequisites

- [ ] `mobile/navigation.md` complete
- [ ] `mobile/api-client.md` complete

## External Services Required

> **None.**

## Scope

Implement home screen with smart hero card and session list.

## Implementation Steps

### 1. Write tests first

Create `mobile/app/(auth)/(tabs)/__tests__/index.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../index';

describe('HomeScreen', () => {
  it('shows empty state when no sessions', () => {
    // Mock useSessions returning empty array
    render(<HomeScreen />);
    expect(screen.getByText(/no active sessions/i)).toBeTruthy();
  });

  it('shows hero card for most urgent session', () => {
    // Mock session with partner waiting
    render(<HomeScreen />);
    expect(screen.getByTestId('hero-card')).toBeTruthy();
  });

  it('shows session list below hero', () => {
    // Mock multiple sessions
    render(<HomeScreen />);
    expect(screen.getAllByTestId('session-card').length).toBeGreaterThan(0);
  });
});
```

### 2. Create session card component

Create `mobile/src/components/SessionCard.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { STAGE_NAMES } from '@meet-without-fear/shared';

interface Props {
  session: SessionSummaryDTO;
  isHero?: boolean;
}

export function SessionCard({ session, isHero }: Props) {
  const router = useRouter();

  const currentStage = session.myProgress.stage;
  const actionNeeded = session.selfActionNeeded.length > 0;

  return (
    <TouchableOpacity
      testID={isHero ? 'hero-card' : 'session-card'}
      style={[styles.card, isHero && styles.heroCard]}
      onPress={() => router.push(`/session/${session.id}`)}
    >
      <View style={styles.header}>
        <Text style={styles.partnerName}>{session.partner.name || 'Partner'}</Text>
        {actionNeeded && <View style={styles.badge} />}
      </View>

      <Text style={styles.stage}>{STAGE_NAMES[currentStage]}</Text>

      {actionNeeded && (
        <Text style={styles.action}>Your turn</Text>
      )}

      {session.partnerActionNeeded.length > 0 && (
        <Text style={styles.waiting}>Waiting for partner</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  heroCard: {
    backgroundColor: '#4F46E5',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  stage: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  action: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '500',
    marginTop: 8,
  },
  waiting: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
});
```

### 3. Create home screen

Update `mobile/app/(auth)/(tabs)/index.tsx`:

```typescript
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSessions } from '../../../src/hooks/useSessions';
import { SessionCard } from '../../../src/components/SessionCard';
import { Plus } from 'lucide-react-native';

export default function HomeScreen() {
  const router = useRouter();
  const { data: sessions, isLoading } = useSessions();

  // Sort sessions: action needed first, then by last updated
  const sortedSessions = [...(sessions || [])].sort((a, b) => {
    if (a.selfActionNeeded.length > 0 && b.selfActionNeeded.length === 0) return -1;
    if (b.selfActionNeeded.length > 0 && a.selfActionNeeded.length === 0) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const heroSession = sortedSessions[0];
  const otherSessions = sortedSessions.slice(1);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!sessions?.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No active sessions</Text>
        <Text style={styles.emptySubtitle}>
          Start a new conversation to work through something together
        </Text>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => router.push('/session/new')}
        >
          <Plus color="white" size={20} />
          <Text style={styles.newButtonText}>New Session</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Home</Text>
        <TouchableOpacity onPress={() => router.push('/session/new')}>
          <Plus color="#4F46E5" size={24} />
        </TouchableOpacity>
      </View>

      {heroSession && (
        <SessionCard session={heroSession} isHero />
      )}

      <FlatList
        data={otherSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionCard session={item} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: 'bold' },
  list: { paddingTop: 16 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  newButtonText: { color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 8 },
});
```

### 4. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Empty state shown when no sessions
- [ ] Hero card shows most urgent session
- [ ] Sessions sorted by action needed
- [ ] Tapping card navigates to session detail
- [ ] New session button works
- [ ] `npm run check` passes
- [ ] `npm run test` passes
