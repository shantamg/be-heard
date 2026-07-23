/**
 * Message identity registry for the transcript animation queue.
 *
 * Two problems are solved here, and they are separate:
 *
 * 1. **Identity aliasing.** A streamed assistant turn is rendered under a
 *    temporary id (`streaming-*`, `optimistic-*`) and later reconciled to its
 *    persisted server UUID. Anything keyed on the raw id — FlatList keys,
 *    "already animated" bookkeeping, the animation queue head — would see that
 *    swap as a brand new item and replay the typewriter. `getAnimationIdentity`
 *    maps the server id back to the identity the row was first rendered under,
 *    so the swap is invisible to the view.
 *
 * 2. **Seen bookkeeping per animation scope.** Each session keeps its own set
 *    of ids that have already been revealed, so remounting a screen does not
 *    replay a transcript the user has already watched.
 *
 * This module owns process-wide mutable maps by design: the streaming layer
 * registers aliases before the renderer ever sees the reconciled message, so
 * the two cannot communicate through React state.
 */

const preRegisteredIds = new Set<string>();
const animationIdentityById = new Map<string, string>();
const seenAnimatedItemIdsByScope = new Map<string, Set<string>>();

let localAnimationScopeCounter = 0;

/**
 * Mark an id as already-revealed before the renderer ever sees it. Used by the
 * streaming layer for text the user has already watched arrive.
 */
export function preRegisterAnimatedId(id: string): void {
  preRegisteredIds.add(id);
}

export function isPreRegisteredAnimatedId(id: string): boolean {
  return preRegisteredIds.has(id);
}

/**
 * Alias a newly assigned id back onto the identity an existing row is already
 * rendering under. Chains resolve to the original identity, so repeated
 * reconciliation of the same row stays stable.
 */
export function bridgeAnimatedId(oldId: string, newId: string): void {
  animationIdentityById.set(newId, getAnimationIdentity(oldId));
}

/** Resolve an id to the stable identity its row renders under. */
export function getAnimationIdentity(id: string): string {
  return animationIdentityById.get(id) || id;
}

/**
 * Animation scopes isolate seen-bookkeeping between sessions. A chat without a
 * session id gets a private scope so its reveals never leak into another list.
 */
export function createLocalAnimationScope(): string {
  localAnimationScopeCounter += 1;
  return `__local_chat_animation_scope_${localAnimationScopeCounter}`;
}

/** The (mutable, caller-owned) set of ids already revealed in this scope. */
export function getSeenAnimatedItemIds(scope: string): Set<string> {
  let ids = seenAnimatedItemIdsByScope.get(scope);
  if (!ids) {
    ids = new Set<string>();
    seenAnimatedItemIdsByScope.set(scope, ids);
  }
  return ids;
}

/** Test-only: drop all registry state so cases cannot leak into each other. */
export function __resetAnimationIdentityRegistryForTests(): void {
  preRegisteredIds.clear();
  animationIdentityById.clear();
  seenAnimatedItemIdsByScope.clear();
  localAnimationScopeCounter = 0;
}
