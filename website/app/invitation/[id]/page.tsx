"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useUser, SignIn } from "@clerk/nextjs";
import Link from "next/link";
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Download,
} from "lucide-react";
import { getInvitation, acceptInvitation, InvitationDetails } from "@/lib/api";

type InvitationState =
  | "loading"
  | "not_found"
  | "expired"
  | "accepted"
  | "declined"
  | "needs_auth"
  | "accepting"
  | "success"
  | "error";

export default function InvitationPage() {
  const params = useParams();
  const router = useRouter();
  const invitationId = params.id as string;

  const { isSignedIn, isLoaded: isAuthLoaded, getToken } = useAuth();
  const { user } = useUser();

  const [state, setState] = useState<InvitationState>("loading");
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch invitation details
  useEffect(() => {
    async function fetchInvitation() {
      if (!invitationId) {
        setState("not_found");
        return;
      }

      try {
        const data = await getInvitation(invitationId);

        if (!data) {
          setState("not_found");
          return;
        }

        setInvitation(data);

        // Check invitation status
        if (data.status === "EXPIRED") {
          setState("expired");
        } else if (data.status === "ACCEPTED") {
          setState("accepted");
        } else if (data.status === "DECLINED") {
          setState("declined");
        } else {
          // Invitation is pending - check auth status
          setState("needs_auth");
        }
      } catch (err) {
        console.error("Error fetching invitation:", err);
        setError("Failed to load invitation. Please try again.");
        setState("error");
      }
    }

    fetchInvitation();
  }, [invitationId]);

  // Handle accepting invitation after auth
  useEffect(() => {
    async function handleAcceptInvitation() {
      if (!isAuthLoaded || !isSignedIn || !invitation) return;
      if (state !== "needs_auth") return;

      setState("accepting");

      try {
        const token = await getToken();
        if (!token) {
          setError("Authentication failed. Please try again.");
          setState("error");
          return;
        }

        const result = await acceptInvitation(invitationId, token);

        if (result.success) {
          setState("success");
        } else {
          setError(result.error || "Failed to accept invitation");
          setState("error");
        }
      } catch (err) {
        console.error("Error accepting invitation:", err);
        setError("Failed to accept invitation. Please try again.");
        setState("error");
      }
    }

    handleAcceptInvitation();
  }, [isAuthLoaded, isSignedIn, invitation, state, invitationId, getToken]);

  // Render based on state
  if (state === "loading") {
    return <LoadingState />;
  }

  if (state === "not_found") {
    return <NotFoundState />;
  }

  if (state === "expired") {
    return <ExpiredState inviterName={invitation?.invitedBy.name || null} />;
  }

  if (state === "accepted") {
    return <AlreadyAcceptedState inviterName={invitation?.invitedBy.name || null} />;
  }

  if (state === "declined") {
    return <DeclinedState inviterName={invitation?.invitedBy.name || null} />;
  }

  if (state === "needs_auth" && !isSignedIn && isAuthLoaded) {
    return (
      <AuthRequiredState
        invitation={invitation}
        invitationId={invitationId}
      />
    );
  }

  if (state === "accepting") {
    return <AcceptingState />;
  }

  if (state === "success") {
    return <SuccessState />;
  }

  if (state === "error") {
    return <ErrorState message={error} onRetry={() => router.refresh()} />;
  }

  // Default loading
  return <LoadingState />;
}

// ============================================================================
// State Components
// ============================================================================

function LoadingState() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading invitation...</p>
      </div>
    </main>
  );
}

function NotFoundState() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-warning" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Invitation Not Found</h1>
        <p className="text-muted-foreground mb-6">
          We could not find this invitation. It may have been deleted or the link may be incorrect.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-accent hover:text-accent/80"
        >
          <ArrowLeft className="w-4 h-4" />
          Return Home
        </Link>
      </div>
    </main>
  );
}

function ExpiredState({ inviterName }: { inviterName: string | null }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mx-auto mb-6">
          <Clock className="w-10 h-10 text-warning" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Invitation Expired</h1>
        <p className="text-muted-foreground mb-2">
          {inviterName
            ? `The invitation from ${inviterName} has expired.`
            : "This invitation has expired."}
        </p>
        <p className="text-muted-foreground text-sm mb-6">
          Invitations are valid for 7 days. Please ask {inviterName || "the sender"} to send you a new invitation.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-accent hover:text-accent/80"
        >
          <ArrowLeft className="w-4 h-4" />
          Return Home
        </Link>
      </div>
    </main>
  );
}

function AlreadyAcceptedState({ inviterName }: { inviterName: string | null }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Invitation Already Accepted</h1>
        <p className="text-muted-foreground mb-6">
          You have already accepted this invitation
          {inviterName ? ` from ${inviterName}` : ""}.
        </p>
        <Link
          href="/app"
          className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold hover:bg-accent/90 transition-all"
        >
          <Download className="w-5 h-5" />
          Get the App
        </Link>
      </div>
    </main>
  );
}

function DeclinedState({ inviterName }: { inviterName: string | null }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Invitation Declined</h1>
        <p className="text-muted-foreground mb-6">
          This invitation{inviterName ? ` from ${inviterName}` : ""} was declined.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-accent hover:text-accent/80"
        >
          <ArrowLeft className="w-4 h-4" />
          Return Home
        </Link>
      </div>
    </main>
  );
}

function AuthRequiredState({
  invitation,
  invitationId,
}: {
  invitation: InvitationDetails | null;
  invitationId: string;
}) {
  const inviterName = invitation?.invitedBy.name;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="text-center max-w-md mb-8">
        <h1 className="font-bold mb-3">
          <span className="text-xl block mb-1">
            {inviterName ? `${inviterName} has invited you to` : "You've been invited to"}
          </span>
          <span className="text-3xl block whitespace-nowrap">Meet Without Fear</span>
        </h1>
        <p className="text-muted-foreground">
          A safe space for real conversations.
        </p>
        <p className="text-muted-foreground text-sm mt-2">
          Sign in to begin.
        </p>
      </div>

      <SignIn
        routing="hash"
        appearance={{
          variables: {
            colorPrimary: "#10b981",
          },
          elements: {
            card: "bg-card border border-border shadow-xl py-6",
            // Hide Clerk's header (we have our own above)
            header: "hidden",
            socialButtonsBlockButton: "border-border hover:bg-card text-foreground",
            // Hide email form and divider (social-only login)
            form: "hidden",
            dividerRow: "hidden",
            // Hide sign up link and footer
            footerAction: "hidden",
            footer: "hidden",
          },
          layout: {
            socialButtonsPlacement: "top",
            socialButtonsVariant: "blockButton",
          },
        }}
        forceRedirectUrl={`/invitation/${invitationId}`}
      />
    </main>
  );
}

function AcceptingState() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Accepting invitation...</p>
      </div>
    </main>
  );
}

function SuccessState() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <h1 className="text-2xl font-bold mb-3">You&apos;re In!</h1>
        <p className="text-muted-foreground mb-6">
          Your account has been created and linked to this session. Download the app to continue.
        </p>
        <Link
          href="/app"
          className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent/90 transition-all"
        >
          <Download className="w-5 h-5" />
          Download the App
        </Link>
      </div>
    </main>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-error/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-error" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Something Went Wrong</h1>
        <p className="text-muted-foreground mb-6">
          {message || "An error occurred. Please try again."}
        </p>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold hover:bg-accent/90 transition-all"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
