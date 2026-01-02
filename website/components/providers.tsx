"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { InvitationRedirect } from "./invitation-redirect";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#6366f1",
          colorBackground: "#171717",
          colorInputBackground: "#262626",
          colorInputText: "#e5e5e5",
        },
      }}
    >
      <InvitationRedirect />
      {children}
    </ClerkProvider>
  );
}
