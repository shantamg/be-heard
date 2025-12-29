/**
 * Intent Handler Registry
 *
 * Central registry for all chat intent handlers.
 * Handlers are registered at startup and matched based on intent and priority.
 */

import { ChatIntent } from '@be-heard/shared';
import { IntentHandler, IntentHandlerRegistry, IntentDetectionPlugin, IntentDetectionHint } from './types';

class HandlerRegistry implements IntentHandlerRegistry {
  private handlers: Map<string, IntentHandler> = new Map();
  private plugins: Map<string, IntentDetectionPlugin> = new Map();

  register(handler: IntentHandler): void {
    if (this.handlers.has(handler.id)) {
      console.warn(`[ChatRouter] Handler ${handler.id} already registered, replacing`);
    }
    this.handlers.set(handler.id, handler);
    console.log(`[ChatRouter] Registered handler: ${handler.name} (${handler.id})`);
  }

  unregister(handlerId: string): void {
    this.handlers.delete(handlerId);
  }

  getHandlers(intent: ChatIntent): IntentHandler[] {
    const matching = Array.from(this.handlers.values()).filter((h) =>
      h.supportedIntents.includes(intent)
    );

    // Sort by priority (higher first)
    return matching.sort((a, b) => b.priority - a.priority);
  }

  getAllHandlers(): IntentHandler[] {
    return Array.from(this.handlers.values()).sort((a, b) => b.priority - a.priority);
  }

  // Plugin management
  registerPlugin(plugin: IntentDetectionPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[ChatRouter] Plugin ${plugin.id} already registered, replacing`);
    }
    this.plugins.set(plugin.id, plugin);
    console.log(`[ChatRouter] Registered detection plugin: ${plugin.id}`);
  }

  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  getDetectionHints(): IntentDetectionHint[] {
    const hints: IntentDetectionHint[] = [];
    for (const plugin of this.plugins.values()) {
      hints.push(...plugin.getDetectionHints());
    }
    return hints;
  }

  getPlugins(): IntentDetectionPlugin[] {
    return Array.from(this.plugins.values());
  }
}

// Singleton registry
export const handlerRegistry = new HandlerRegistry();

/**
 * Decorator for registering handlers
 */
export function registerHandler(handler: IntentHandler): void {
  handlerRegistry.register(handler);
}

/**
 * Decorator for registering plugins
 */
export function registerPlugin(plugin: IntentDetectionPlugin): void {
  handlerRegistry.registerPlugin(plugin);
}
