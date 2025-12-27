# Chat Interface Implementation

## Source Documentation

- [Chat Interface Wireframe](../../docs/mvp-planning/plans/wireframes/chat-interface.md)
- [Stage 1 Witness](../../docs/mvp-planning/plans/stages/stage-1-witness.md)

## Prerequisites

- [ ] `mobile/api-client.md` complete
- [ ] `mobile/navigation.md` complete

## External Services Required

> **None.**

## Scope

Implement the AI chat interface used in Stage 1 (and other stages).

## Implementation Steps

### 1. Write tests first

Create `mobile/src/components/__tests__/ChatInterface.test.tsx`:

```typescript
describe('ChatInterface', () => {
  it('renders message history', () => {
    const messages = [
      { id: '1', role: 'USER', content: 'Hello' },
      { id: '2', role: 'AI', content: 'Hi there' }
    ];
    render(<ChatInterface messages={messages} />);
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Hi there')).toBeTruthy();
  });

  it('sends message on submit', async () => {
    const onSend = jest.fn();
    render(<ChatInterface messages={[]} onSendMessage={onSend} />);

    fireEvent.changeText(screen.getByPlaceholderText(/type/i), 'Test message');
    fireEvent.press(screen.getByTestId('send-button'));

    expect(onSend).toHaveBeenCalledWith('Test message');
  });

  it('shows AI typing indicator while loading', () => {
    render(<ChatInterface messages={[]} isLoading />);
    expect(screen.getByTestId('typing-indicator')).toBeTruthy();
  });

  it('scrolls to bottom on new message', () => {
    // Verify auto-scroll behavior
  });
});
```

### 2. Create message bubble component

Create `mobile/src/components/MessageBubble.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';
import type { MessageDTO } from '@be-heard/shared';

interface Props {
  message: MessageDTO;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'USER';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.text, isUser && styles.userText]}>
          {message.content}
        </Text>
      </View>
      <Text style={styles.time}>
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 4, paddingHorizontal: 16 },
  userContainer: { alignItems: 'flex-end' },
  aiContainer: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  text: { fontSize: 16, lineHeight: 22 },
  userText: { color: 'white' },
  time: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
});
```

### 3. Create typing indicator

Create `mobile/src/components/TypingIndicator.tsx`:

```typescript
import { View, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';

export function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    };

    animate(dot1, 0);
    animate(dot2, 150);
    animate(dot3, 300);
  }, []);

  return (
    <View testID="typing-indicator" style={styles.container}>
      <Animated.View style={[styles.dot, { opacity: dot1 }]} />
      <Animated.View style={[styles.dot, { opacity: dot2 }]} />
      <Animated.View style={[styles.dot, { opacity: dot3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginLeft: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9CA3AF',
    marginHorizontal: 2,
  },
});
```

### 4. Create chat interface component

Create `mobile/src/components/ChatInterface.tsx`:

```typescript
import { useRef, useEffect } from 'react';
import {
  View, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView,
  Platform, StyleSheet
} from 'react-native';
import { Send } from 'lucide-react-native';
import type { MessageDTO } from '@be-heard/shared';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

interface Props {
  messages: MessageDTO[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
}

export function ChatInterface({ messages, onSendMessage, isLoading }: Props) {
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Scroll to bottom on new message
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          testID="send-button"
          style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          <Send color={input.trim() ? '#4F46E5' : '#9CA3AF'} size={20} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messageList: { paddingVertical: 16 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: 'white',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
  },
  sendButton: { padding: 10 },
  sendButtonDisabled: { opacity: 0.5 },
});
```

### 5. Create chat screen

Create `mobile/app/(auth)/session/[id]/chat.tsx`:

```typescript
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMessages, useSendMessage } from '../../../../src/hooks/useMessages';
import { ChatInterface } from '../../../../src/components/ChatInterface';

export default function ChatScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const { data: messages = [], isLoading: loadingMessages } = useMessages(sessionId);
  const { mutate: sendMessage, isPending } = useSendMessage(sessionId);

  return (
    <View style={styles.container}>
      <ChatInterface
        messages={messages}
        onSendMessage={sendMessage}
        isLoading={isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
});
```

### 6. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Messages render with correct styling (user right, AI left)
- [ ] Typing indicator shows while waiting for AI
- [ ] Auto-scroll to bottom on new message
- [ ] Keyboard avoidance works on iOS
- [ ] Send button disabled when input empty
- [ ] Long messages wrap correctly
- [ ] `npm run check` passes
- [ ] `npm run test` passes
