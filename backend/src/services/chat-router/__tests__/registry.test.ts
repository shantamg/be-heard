/**
 * Handler Registry Tests
 *
 * Tests for the chat router handler registry system.
 */

import { ChatIntent } from '@be-heard/shared';
import { IntentHandler, IntentDetectionPlugin } from '../types';

// Create a fresh registry for each test (don't use singleton)
class TestHandlerRegistry {
  private handlers: Map<string, IntentHandler> = new Map();
  private plugins: Map<string, IntentDetectionPlugin> = new Map();

  register(handler: IntentHandler): void {
    this.handlers.set(handler.id, handler);
  }

  unregister(handlerId: string): void {
    this.handlers.delete(handlerId);
  }

  getHandlers(intent: ChatIntent): IntentHandler[] {
    const matching = Array.from(this.handlers.values()).filter((h) =>
      h.supportedIntents.includes(intent)
    );
    return matching.sort((a, b) => b.priority - a.priority);
  }

  getAllHandlers(): IntentHandler[] {
    return Array.from(this.handlers.values()).sort((a, b) => b.priority - a.priority);
  }

  registerPlugin(plugin: IntentDetectionPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  getDetectionHints() {
    const hints: Array<{ intent: string; keywords: string[]; examples: string[]; description: string }> = [];
    for (const plugin of this.plugins.values()) {
      hints.push(...plugin.getDetectionHints());
    }
    return hints;
  }

  getPlugins(): IntentDetectionPlugin[] {
    return Array.from(this.plugins.values());
  }
}

// Create mock handlers for testing
function createMockHandler(overrides: Partial<IntentHandler> = {}): IntentHandler {
  return {
    id: 'test-handler',
    name: 'Test Handler',
    supportedIntents: [ChatIntent.HELP],
    priority: 50,
    canHandle: jest.fn().mockReturnValue(true),
    handle: jest.fn().mockResolvedValue({
      actionType: 'test',
      message: 'Test response',
    }),
    ...overrides,
  };
}

function createMockPlugin(overrides: Partial<IntentDetectionPlugin> = {}): IntentDetectionPlugin {
  return {
    id: 'test-plugin',
    detectableIntents: ['CUSTOM_INTENT'],
    getDetectionHints: jest.fn().mockReturnValue([
      {
        intent: 'CUSTOM_INTENT',
        keywords: ['custom', 'test'],
        examples: ['Test custom intent'],
        description: 'A custom test intent',
      },
    ]),
    ...overrides,
  };
}

describe('Handler Registry', () => {
  let registry: TestHandlerRegistry;

  beforeEach(() => {
    registry = new TestHandlerRegistry();
  });

  describe('register', () => {
    it('registers a handler', () => {
      const handler = createMockHandler();
      registry.register(handler);

      expect(registry.getAllHandlers()).toHaveLength(1);
      expect(registry.getAllHandlers()[0].id).toBe('test-handler');
    });

    it('replaces handler with same id', () => {
      const handler1 = createMockHandler({ name: 'First' });
      const handler2 = createMockHandler({ name: 'Second' });

      registry.register(handler1);
      registry.register(handler2);

      expect(registry.getAllHandlers()).toHaveLength(1);
      expect(registry.getAllHandlers()[0].name).toBe('Second');
    });

    it('registers multiple handlers', () => {
      const handler1 = createMockHandler({ id: 'handler-1' });
      const handler2 = createMockHandler({ id: 'handler-2' });

      registry.register(handler1);
      registry.register(handler2);

      expect(registry.getAllHandlers()).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('removes a handler', () => {
      const handler = createMockHandler();
      registry.register(handler);
      registry.unregister('test-handler');

      expect(registry.getAllHandlers()).toHaveLength(0);
    });

    it('does nothing for non-existent handler', () => {
      expect(() => registry.unregister('non-existent')).not.toThrow();
    });
  });

  describe('getHandlers', () => {
    it('returns handlers for matching intent', () => {
      const helpHandler = createMockHandler({
        id: 'help',
        supportedIntents: [ChatIntent.HELP],
      });
      const sessionHandler = createMockHandler({
        id: 'session',
        supportedIntents: [ChatIntent.CREATE_SESSION],
      });

      registry.register(helpHandler);
      registry.register(sessionHandler);

      const result = registry.getHandlers(ChatIntent.HELP);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('help');
    });

    it('returns handlers sorted by priority (descending)', () => {
      const lowPriority = createMockHandler({
        id: 'low',
        priority: 10,
        supportedIntents: [ChatIntent.HELP],
      });
      const highPriority = createMockHandler({
        id: 'high',
        priority: 100,
        supportedIntents: [ChatIntent.HELP],
      });
      const medPriority = createMockHandler({
        id: 'med',
        priority: 50,
        supportedIntents: [ChatIntent.HELP],
      });

      registry.register(lowPriority);
      registry.register(highPriority);
      registry.register(medPriority);

      const result = registry.getHandlers(ChatIntent.HELP);

      expect(result[0].id).toBe('high');
      expect(result[1].id).toBe('med');
      expect(result[2].id).toBe('low');
    });

    it('returns empty array for no matching handlers', () => {
      const handler = createMockHandler({
        supportedIntents: [ChatIntent.HELP],
      });
      registry.register(handler);

      const result = registry.getHandlers(ChatIntent.CREATE_SESSION);

      expect(result).toHaveLength(0);
    });

    it('returns handlers supporting multiple intents', () => {
      const multiHandler = createMockHandler({
        id: 'multi',
        supportedIntents: [ChatIntent.HELP, ChatIntent.LIST_SESSIONS],
      });
      registry.register(multiHandler);

      expect(registry.getHandlers(ChatIntent.HELP)).toHaveLength(1);
      expect(registry.getHandlers(ChatIntent.LIST_SESSIONS)).toHaveLength(1);
      expect(registry.getHandlers(ChatIntent.CREATE_SESSION)).toHaveLength(0);
    });
  });

  describe('getAllHandlers', () => {
    it('returns all handlers sorted by priority', () => {
      const handler1 = createMockHandler({ id: 'h1', priority: 30 });
      const handler2 = createMockHandler({ id: 'h2', priority: 70 });

      registry.register(handler1);
      registry.register(handler2);

      const result = registry.getAllHandlers();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('h2');
      expect(result[1].id).toBe('h1');
    });
  });

  describe('plugin management', () => {
    it('registers a plugin', () => {
      const plugin = createMockPlugin();
      registry.registerPlugin(plugin);

      expect(registry.getPlugins()).toHaveLength(1);
    });

    it('unregisters a plugin', () => {
      const plugin = createMockPlugin();
      registry.registerPlugin(plugin);
      registry.unregisterPlugin('test-plugin');

      expect(registry.getPlugins()).toHaveLength(0);
    });

    it('collects detection hints from all plugins', () => {
      const plugin1 = createMockPlugin({
        id: 'p1',
        getDetectionHints: jest.fn().mockReturnValue([
          { intent: 'INTENT_1', keywords: ['a'], examples: ['a'], description: 'A' },
        ]),
      });
      const plugin2 = createMockPlugin({
        id: 'p2',
        getDetectionHints: jest.fn().mockReturnValue([
          { intent: 'INTENT_2', keywords: ['b'], examples: ['b'], description: 'B' },
        ]),
      });

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      const hints = registry.getDetectionHints();

      expect(hints).toHaveLength(2);
      expect(hints.map((h) => h.intent)).toContain('INTENT_1');
      expect(hints.map((h) => h.intent)).toContain('INTENT_2');
    });
  });
});
