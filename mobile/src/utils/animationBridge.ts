/**
 * Animation Bridge
 *
 * Allows useStreamingMessage to pre-register message IDs that should
 * skip typewriter animation in ChatInterface. This bridges the gap
 * when streaming placeholder IDs (e.g. "streaming-*") are replaced
 * with real server UUIDs before cache reconciliation.
 *
 * The implementation now lives with the rest of the renderer mechanics in
 * `../lib/chat/render/animationIdentity`; this module stays as the import path
 * the streaming layer already uses. There is exactly one registry instance.
 */

export {
  bridgeAnimatedId,
  getAnimationIdentity,
  isPreRegisteredAnimatedId,
  preRegisterAnimatedId,
} from '../lib/chat/render/animationIdentity';
