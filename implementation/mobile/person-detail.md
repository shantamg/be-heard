# Person Detail Screen Implementation

## Source Documentation

- [Person Detail Wireframe](../../docs/mvp-planning/plans/wireframes/person-detail.md)
- [Home Dashboard](../../docs/mvp-planning/plans/wireframes/home-dashboard.md)

## Prerequisites

- [ ] `mobile/navigation.md` complete
- [ ] `mobile/api-client.md` complete

## External Services Required

> **None.**

## Scope

Implement the person detail screen showing relationship status, current session, and session history.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/screens/__tests__/PersonDetailScreen.test.tsx`:

```typescript
describe('PersonDetailScreen', () => {
  it('shows person profile information', () => {
    render(<PersonDetailScreen personId="123" />);
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText(/connected since/i)).toBeTruthy();
  });

  it('shows current session when active', () => {
    render(<PersonDetailScreen personId="123" hasActiveSession />);
    expect(screen.getByText(/stage 2/i)).toBeTruthy();
    expect(screen.getByText(/continue session/i)).toBeTruthy();
  });

  it('shows start new session when no active session', () => {
    render(<PersonDetailScreen personId="123" hasActiveSession={false} />);
    expect(screen.getByText(/start new session/i)).toBeTruthy();
  });

  it('shows past sessions list', () => {
    render(<PersonDetailScreen personId="123" />);
    expect(screen.getByText(/past sessions/i)).toBeTruthy();
  });
});
```

### 2. Create person profile component

Create `mobile/src/components/PersonProfile.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  name: string;
  initials: string;
  connectedSince: string;
}

export function PersonProfile({ name, initials, connectedSince }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.connected}>Connected since {connectedSince}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  initials: {
    fontSize: 28,
    fontWeight: '600',
    color: 'white',
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  connected: {
    fontSize: 14,
    color: '#6B7280',
  },
});
```

### 3. Create current session card

Create `mobile/src/components/CurrentSessionCard.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { STAGE_NAMES } from '@meet-without-fear/shared';

interface Props {
  sessionId: string;
  stage: string;
  status: 'waiting_on_you' | 'your_turn' | 'waiting_on_partner' | 'both_active';
  partnerName: string;
  lastUpdate: string;
}

const STATUS_TEXT = {
  waiting_on_you: 'Waiting on you',
  your_turn: 'Ready to continue',
  waiting_on_partner: 'Waiting for',
  both_active: 'Both working on',
};

export function CurrentSessionCard({ sessionId, stage, status, partnerName, lastUpdate }: Props) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.stageLabel}>{STAGE_NAMES[stage]}</Text>

      <Text style={styles.status}>
        {status === 'waiting_on_partner'
          ? `Waiting for ${partnerName} - ${lastUpdate}`
          : status === 'both_active'
          ? `Both working on ${STAGE_NAMES[stage]}`
          : `${STATUS_TEXT[status]} - ${lastUpdate}`}
      </Text>

      <TouchableOpacity
        style={styles.continueButton}
        onPress={() => router.push(`/session/${sessionId}`)}
      >
        <Text style={styles.continueText}>Continue Session</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 20,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4F46E5',
  },
  stageLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  continueButton: {
    backgroundColor: '#4F46E5',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  continueText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

### 4. Create past session card

Create `mobile/src/components/PastSessionCard.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle } from 'lucide-react-native';

interface Props {
  sessionId: string;
  date: string;
  topic: string;
}

export function PastSessionCard({ sessionId, date, topic }: Props) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push(`/session/${sessionId}/review`)}
    >
      <CheckCircle color="#10B981" size={20} />
      <View style={styles.content}>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.topic}>{topic}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  content: {
    marginLeft: 12,
    flex: 1,
  },
  date: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  topic: {
    fontSize: 16,
    color: '#1F2937',
  },
});
```

### 5. Create person detail screen

Create `mobile/app/(auth)/person/[id].tsx`:

```typescript
import { View, ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MoreVertical, Plus } from 'lucide-react-native';
import { usePerson, usePastSessions } from '../../../src/hooks/usePerson';
import { PersonProfile } from '../../../src/components/PersonProfile';
import { CurrentSessionCard } from '../../../src/components/CurrentSessionCard';
import { PastSessionCard } from '../../../src/components/PastSessionCard';

export default function PersonDetailScreen() {
  const { id: personId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: person } = usePerson(personId);
  const { data: pastSessions = [] } = usePastSessions(personId);

  if (!person) return null;

  const activeSession = person.activeSession;

  return (
    <>
      <Stack.Screen
        options={{
          title: person.name,
          headerRight: () => (
            <TouchableOpacity>
              <MoreVertical color="#374151" size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.container}>
        <PersonProfile
          name={person.name}
          initials={person.initials}
          connectedSince={person.connectedSince}
        />

        {activeSession ? (
          <CurrentSessionCard
            sessionId={activeSession.id}
            stage={activeSession.stage}
            status={activeSession.status}
            partnerName={person.name}
            lastUpdate={activeSession.lastUpdate}
          />
        ) : (
          <TouchableOpacity
            style={styles.newSessionButton}
            onPress={() => router.push(`/session/new?partnerId=${personId}`)}
          >
            <Plus color="white" size={20} />
            <Text style={styles.newSessionText}>Start New Session</Text>
          </TouchableOpacity>
        )}

        <View style={styles.pastSection}>
          <Text style={styles.pastTitle}>Past Sessions</Text>

          {pastSessions.length > 0 ? (
            pastSessions.map((session) => (
              <PastSessionCard
                key={session.id}
                sessionId={session.id}
                date={session.date}
                topic={session.topic}
              />
            ))
          ) : (
            <Text style={styles.emptyText}>No past sessions yet</Text>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  newSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
  },
  newSessionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  pastSection: {
    padding: 16,
  },
  pastTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#374151',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
```

### 6. Create person hooks

Create `mobile/src/hooks/usePerson.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';

export function usePerson(personId: string) {
  const api = useApiClient();

  return useQuery({
    queryKey: ['person', personId],
    queryFn: async () => {
      const { data } = await api.get(`/people/${personId}`);
      return data.data;
    },
    enabled: !!personId,
  });
}

export function usePastSessions(personId: string) {
  const api = useApiClient();

  return useQuery({
    queryKey: ['past-sessions', personId],
    queryFn: async () => {
      const { data } = await api.get(`/people/${personId}/sessions?status=completed`);
      return data.data.sessions;
    },
    enabled: !!personId,
  });
}
```

### 7. Create session review screen

Create `mobile/app/(auth)/session/[id]/review.tsx`:

```typescript
import { View, ScrollView, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSession } from '../../../../src/hooks/useSessions';
import { CheckCircle } from 'lucide-react-native';

export default function SessionReviewScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession(sessionId);

  if (!session) return null;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Session Review',
        }}
      />

      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <CheckCircle color="#10B981" size={32} />
          <Text style={styles.resolvedText}>
            Resolved {session.completedAt}
          </Text>
          <Text style={styles.topic}>{session.topic}</Text>
        </View>

        <View style={styles.timeline}>
          <Text style={styles.timelineTitle}>Journey Timeline</Text>

          {session.stages?.map((stage, i) => (
            <View key={i} style={styles.stageCard}>
              <Text style={styles.stageName}>{stage.name}</Text>
              <Text style={styles.stageSummary}>{stage.summary}</Text>
            </View>
          ))}
        </View>

        {session.agreement && (
          <View style={styles.outcomeCard}>
            <Text style={styles.outcomeTitle}>Agreed Actions</Text>
            <Text style={styles.outcomeText}>{session.agreement.experiment}</Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  resolvedText: {
    fontSize: 14,
    color: '#10B981',
    marginTop: 8,
  },
  topic: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  timeline: {
    padding: 16,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  stageCard: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  stageName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 4,
  },
  stageSummary: {
    fontSize: 14,
    color: '#6B7280',
  },
  outcomeCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  outcomeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 8,
  },
  outcomeText: {
    fontSize: 14,
    color: '#374151',
  },
});
```

### 8. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Profile section displays correctly
- [ ] Current session card shows status
- [ ] Continue button navigates to session
- [ ] Start new session button works
- [ ] Past sessions list displays
- [ ] Tapping past session opens review
- [ ] Session review shows timeline
- [ ] `npm run check` passes
- [ ] `npm run test` passes
