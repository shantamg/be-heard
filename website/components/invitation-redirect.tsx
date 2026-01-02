"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";

const PENDING_INVITATION_KEY = "pending_invitation_id";

/**
 * Checks for pending invitation after OAuth sign-in and redirects
 * to complete the invitation acceptance flow.
 */
export function InvitationRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoaded) return;

    // Only redirect if signed in and NOT already on an invitation page
    if (isSignedIn && !pathname.startsWith("/invitation/")) {
      const pendingInvitation = sessionStorage.getItem(PENDING_INVITATION_KEY);
      if (pendingInvitation) {
        // Clear it immediately to prevent redirect loops
        sessionStorage.removeItem(PENDING_INVITATION_KEY);
        // Redirect back to invitation page to complete acceptance
        router.replace(`/invitation/${pendingInvitation}`);
      }
    }
  }, [isLoaded, isSignedIn, pathname, router]);

  return null;
}
