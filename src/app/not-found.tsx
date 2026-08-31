import ErrorState from "@/components/ui/ErrorState";

export default function NotFound() {
  return (
    <ErrorState
      fullScreen
      variant="notFound"
      title="Page not found"
      message="The page you're looking for doesn't exist or may have been moved."
      secondaryActionLabel="Go to Dashboard"
      secondaryHref="/dashboard"
    />
  );
}
