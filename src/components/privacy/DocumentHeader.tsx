// components/privacy/DocumentHeader.tsx
interface DocumentHeaderProps {
  title: string;
  subtitle?: string;   // now optional
  effectiveDate: string;
  version: string;
  lastUpdated: string;
}

export function DocumentHeader({
  title,
  subtitle,
  effectiveDate,
  version,
  lastUpdated,
}: DocumentHeaderProps) {
  return (
    <div className="mb-10 pb-6 border-b border-slate-200 dark:border-slate-800">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{subtitle}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500 mt-1">
        <span>Effective Date: {effectiveDate}</span>
        <span className="hidden sm:inline">|</span>
        <span>Version: {version}</span>
        <span className="hidden sm:inline">|</span>
        <span>Last Updated: {lastUpdated}</span>
      </div>
    </div>
  );
}