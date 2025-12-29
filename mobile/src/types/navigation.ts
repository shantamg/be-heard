/**
 * Navigation route parameters for the mobile app
 * Uses Expo Router's file-based routing
 */

// Session stage types
// Maps to conceptual stages in the Meet Without Fear conflict resolution process
export type SessionStage =
  // Stage 0: Initial stages
  | 'onboarding'  // Stage 0a: Session onboarding/setup
  | 'compact'     // Stage 0b: Initial compact format entry
  // Stage 1: Understanding
  | 'chat'        // Stage 1a: AI-guided chat exploration
  | 'witness'     // Stage 1b: Witness mode - being heard
  // Stage 2: Empathy & Perspective
  | 'empathy'     // Stage 2a: Empathy mapping
  | 'perspective' // Stage 2b: Perspective taking/switching
  // Stage 3: Needs
  | 'needs'       // Stage 3: Needs identification
  // Stage 4: Resolution
  | 'strategies'  // Stage 4a: Strategy development
  | 'review';     // Stage 4b: Session review and summary

// Route parameter types for dynamic routes
export interface SessionRouteParams {
  id: string;
}

export interface PersonRouteParams {
  id: string;
}

export interface InvitationRouteParams {
  id: string;
}

// Tab names for type-safe navigation
export type TabName = 'index' | 'sessions' | 'profile';

// Helper type for building typed navigation paths
export type AppRoutes = {
  // Public routes
  '/login': undefined;
  '/signup': undefined;
  '/invitation/[id]': InvitationRouteParams;

  // Auth-required routes
  '/': undefined; // Home tab
  '/sessions': undefined;
  '/profile': undefined;

  // Session routes
  '/session/new': undefined;
  '/session/[id]': SessionRouteParams;
  // Stage 0: Initial stages
  '/session/[id]/onboarding': SessionRouteParams;
  '/session/[id]/compact': SessionRouteParams;
  // Stage 1: Understanding
  '/session/[id]/chat': SessionRouteParams;
  '/session/[id]/witness': SessionRouteParams;
  // Stage 2: Empathy & Perspective
  '/session/[id]/empathy': SessionRouteParams;
  '/session/[id]/perspective': SessionRouteParams;
  // Stage 3: Needs
  '/session/[id]/needs': SessionRouteParams;
  // Stage 4: Resolution
  '/session/[id]/strategies': SessionRouteParams;
  '/session/[id]/review': SessionRouteParams;

  // Person routes
  '/person/[id]': PersonRouteParams;

  // Settings routes
  '/settings/notifications': undefined;
};

// Type for router.push with params
export type TypedRoute = keyof AppRoutes;
