// lib/statusColors.ts

type StatusDomain = 'tender' | 'bq' | 'branch';

interface StatusStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

interface StatusConfig {
  label: string;
  light: StatusStyle;
  dark: StatusStyle;
}

type StatusConfigMap = Record<string, StatusConfig>;

export const STATUS_CONFIG: Record<StatusDomain, StatusConfigMap> = {
  tender: {
    draft: {
      label: 'Draft',
      light: {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
      },
      dark: {
        bg: 'dark:bg-slate-800',
        text: 'dark:text-slate-200',
        border: 'dark:border-slate-700',
        dot: 'dark:bg-slate-500',
      },
    },
    open: {
      label: 'Open',
      light: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
      dark: {
        bg: 'dark:bg-emerald-800',
        text: 'dark:text-emerald-100',
        border: 'dark:border-emerald-700',
        dot: 'dark:bg-emerald-400',
      },
    },
    closed: {
      label: 'Closed',
      light: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      },
      dark: {
        bg: 'dark:bg-rose-800',
        text: 'dark:text-rose-100',
        border: 'dark:border-rose-700',
        dot: 'dark:bg-rose-400',
      },
    },
    ongoing: {
      label: 'Ongoing',
      light: {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        dot: 'bg-blue-500',
      },
      dark: {
        bg: 'dark:bg-blue-900/50',
        text: 'dark:text-blue-200',
        border: 'dark:border-blue-700',
        dot: 'dark:bg-blue-400',
      },
    },
    upcoming: {
      label: 'Upcoming',
      light: {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dot: 'bg-purple-400',
      },
      dark: {
        bg: 'dark:bg-purple-900/30',
        text: 'dark:text-purple-200',
        border: 'dark:border-purple-700',
        dot: 'dark:bg-purple-400',
      },
    },
  },
  bq: {
    draft: {
      label: 'Draft',
      light: {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
      },
      dark: {
        bg: 'dark:bg-slate-800',
        text: 'dark:text-slate-200',
        border: 'dark:border-slate-700',
        dot: 'dark:bg-slate-500',
      },
    },
    submitted: {
      label: 'Submitted',
      light: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      },
      dark: {
        bg: 'dark:bg-amber-800',
        text: 'dark:text-amber-50',
        border: 'dark:border-amber-700',
        dot: 'dark:bg-amber-400',
      },
    },
    approved: {
      label: 'Approved',
      light: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
      dark: {
        bg: 'dark:bg-emerald-800',
        text: 'dark:text-emerald-50',
        border: 'dark:border-emerald-700',
        dot: 'dark:bg-emerald-400',
      },
    },
    rejected: {
      label: 'Rejected',
      light: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      },
      dark: {
        bg: 'dark:bg-rose-800',
        text: 'dark:text-rose-50',
        border: 'dark:border-rose-700',
        dot: 'dark:bg-rose-400',
      },
    },
  },
  // ===== BRANCH OPERATION STATUSES =====
  branch: {
    open: {
      label: 'Open',
      light: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
      dark: {
        bg: 'dark:bg-emerald-800',
        text: 'dark:text-emerald-100',
        border: 'dark:border-emerald-700',
        dot: 'dark:bg-emerald-400',
      },
    },
    under_renovation: {
      label: 'Under Renovation',
      light: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      },
      dark: {
        bg: 'dark:bg-amber-800',
        text: 'dark:text-amber-100',
        border: 'dark:border-amber-700',
        dot: 'dark:bg-amber-400',
      },
    },
    under_refurbishment: {
      label: 'Under Refurbishment',
      light: {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dot: 'bg-purple-500',
      },
      dark: {
        bg: 'dark:bg-purple-900/50',
        text: 'dark:text-purple-100',
        border: 'dark:border-purple-700',
        dot: 'dark:bg-purple-400',
      },
    },
    closed: {
      label: 'Closed',
      light: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      },
      dark: {
        bg: 'dark:bg-rose-800',
        text: 'dark:text-rose-100',
        border: 'dark:border-rose-700',
        dot: 'dark:bg-rose-400',
      },
    },
  },
};

// ---------- Helper functions ----------
function combineClasses(light: string, dark: string): string {
  return `${light} ${dark}`;
}

export function getStatusBadgeStyle(status: string, domain: StatusDomain): string {
  const lowerStatus = status?.toLowerCase() || '';
  const config = STATUS_CONFIG[domain];
  const matched = config[lowerStatus];
  if (matched) {
    return combineClasses(
      matched.light.bg + ' ' + matched.light.text + ' ' + matched.light.border,
      matched.dark.bg + ' ' + matched.dark.text + ' ' + matched.dark.border
    );
  }
  // fallback
  return combineClasses(
    'bg-gray-100 text-gray-700 border-gray-300',
    'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'
  );
}

export function getStatusStyles(status: string, domain: StatusDomain): StatusStyle {
  const lowerStatus = status?.toLowerCase() || '';
  const config = STATUS_CONFIG[domain];
  const matched = config[lowerStatus];
  if (matched) {
    return {
      bg: `${matched.light.bg} ${matched.dark.bg}`,
      text: `${matched.light.text} ${matched.dark.text}`,
      border: `${matched.light.border} ${matched.dark.border}`,
      dot: `${matched.light.dot} ${matched.dark.dot}`,
    };
  }
  // fallback
  return {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-200',
    border: 'border-gray-300 dark:border-gray-700',
    dot: 'bg-gray-400 dark:bg-gray-500',
  };
}

export function getStatusLabel(status: string, domain: StatusDomain): string {
  const lowerStatus = status?.toLowerCase() || '';
  const config = STATUS_CONFIG[domain];
  const matched = config[lowerStatus];
  if (matched) return matched.label;
  return status?.charAt(0).toUpperCase() + status?.slice(1).toLowerCase() || 'Unknown';
}

// ----- Convenience exports (existing) -----
export const getBQStatusBadgeStyle = (status: string) => getStatusBadgeStyle(status, 'bq');
export const getBQStatusLabel = (status: string) => getStatusLabel(status, 'bq');
export const getTenderStatusBadgeStyle = (status: string) => getStatusBadgeStyle(status, 'tender');
export const getTenderStatusLabel = (status: string) => getStatusLabel(status, 'tender');
export const getBQStatusStyles = (status: string) => getStatusStyles(status, 'bq');
export const getTenderStatusStyles = (status: string) => getStatusStyles(status, 'tender');

// ----- NEW: Branch status helpers -----
export const getBranchStatusBadgeStyle = (status: string) => getStatusBadgeStyle(status, 'branch');
export const getBranchStatusLabel = (status: string) => getStatusLabel(status, 'branch');
export const getBranchStatusStyles = (status: string) => getStatusStyles(status, 'branch');