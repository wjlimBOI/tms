"use client";

import { useEffect } from "react";
import ErrorState from "@/components/ui/ErrorState";

// Next.js App Router error boundary — catches uncaught render/render-effect
// errors anywhere under this layout. Without this file Next falls back to
// its own unstyled default error page.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      fullScreen
      variant="error"
      title="Something went wrong"
      message="An unexpected error occurred. Please try again, or contact your system administrator if the problem continues."
      actionLabel="Try Again"
      onAction={reset}
      secondaryActionLabel="Go to Dashboard"
      secondaryHref="/dashboard"
    />
  );
}
