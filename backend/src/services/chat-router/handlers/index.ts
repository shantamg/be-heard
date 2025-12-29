/**
 * Intent Handlers Index
 *
 * Export all handlers and register them with the registry.
 */

import { registerHandler } from '../registry';
import { sessionCreationHandler } from './session-creation';
import { sessionSwitchHandler } from './session-switch';
import { conversationHandler } from './conversation';
import { sessionsListHandler } from './sessions-list';
import { helpHandler } from './help';
import { witnessingHandler } from './witnessing';

// Export individual handlers for direct use
export { sessionCreationHandler } from './session-creation';
export { sessionSwitchHandler } from './session-switch';
export { conversationHandler } from './conversation';
export { sessionsListHandler } from './sessions-list';
export { helpHandler } from './help';
export { witnessingHandler, isInWitnessingMode, getLastPersonMention } from './witnessing';

// Export helper functions
export {
  cancelCreation,
  hasPendingCreation,
  getPendingCreation,
} from './session-creation';

/**
 * Register all built-in handlers
 */
export function registerBuiltInHandlers(): void {
  registerHandler(sessionCreationHandler);
  registerHandler(sessionSwitchHandler);
  registerHandler(conversationHandler);
  registerHandler(sessionsListHandler);
  registerHandler(witnessingHandler); // Handles pre-session witnessing/Inner Work
  registerHandler(helpHandler); // Lowest priority fallback

  console.log('[ChatRouter] Registered all built-in handlers');
}
