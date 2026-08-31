import ErrorState, { ErrorStateVariant } from "@/components/ui/ErrorState";

// Landing page for direct-navigation hits (e.g. a document link opened in a
// new tab) against an authenticated/authorized API route that would
// otherwise just hand the browser raw `{"error":"Forbidden"}` JSON. Routes
// that serve files/content directly (not via fetch()) redirect here instead
// of returning that JSON when the request looks like a top-level navigation.
const REASONS: Record<string, { variant: ErrorStateVariant; title: string; message: string }> = {
  unauthorized: {
    variant: "unauthorized",
    title: "Sign in required",
    message: "You need to be signed in to view this.",
  },
  forbidden: {
    variant: "forbidden",
    title: "You don't have access to this",
    message: "You don't have permission to view this document. If you think this is a mistake, contact your project manager or system administrator.",
  },
  "not-found": {
    variant: "notFound",
    title: "Not found",
    message: "This document doesn't exist or may have been removed.",
  },
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const r = REASONS[reason || "forbidden"] || REASONS.forbidden;

  return (
    <ErrorState
      fullScreen
      variant={r.variant}
      title={r.title}
      message={r.message}
      secondaryActionLabel="Go to Dashboard"
      secondaryHref="/dashboard"
    />
  );
}
