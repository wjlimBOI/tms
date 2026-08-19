// lib/statusColors.ts

type StatusDomain = 'tender' | 'bq' | 'branch' | 'dlp';

interface StatusStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

interface StatusConfig {
  label: string;
  style: StatusStyle;
}

type StatusConfigMap = Record<string, StatusConfig>;

export const STATUS_CONFIG: Record<StatusDomain, StatusConfigMap> = {
  tender: {
    draft: {
      label: 'Draft',
      style: {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
      },
    },
    open: {
      label: 'Open',
      style: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
    },
    closed: {
      label: 'Closed',
      style: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      },
    },
    ongoing: {
      label: 'Ongoing',
      style: {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        dot: 'bg-blue-500',
      },
    },
    upcoming: {
      label: 'Upcoming',
      style: {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dot: 'bg-purple-400',
      },
    },
    awarded: {
      label: 'Awarded',
      style: {
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        dot: 'bg-indigo-500',
      },
    },
    cancelled: {
      label: 'Cancelled',
      style: {
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-300',
        dot: 'bg-slate-400',
      },
    },
  },
  bq: {
    draft: {
      label: 'Draft',
      style: {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
      },
    },
    submitted: {
      label: 'Submitted',
      style: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      },
    },
    approved: {
      label: 'Approved',
      style: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
    },
    rejected: {
      label: 'Rejected',
      style: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      },
    },
  },
  // ===== BRANCH OPERATION STATUSES =====
  branch: {
    open: {
      label: 'Open',
      style: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
    },
    under_renovation: {
      label: 'Under Renovation',
      style: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      },
    },
    under_refurbishment: {
      label: 'Under Refurbishment',
      style: {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dot: 'bg-purple-500',
      },
    },
    closed: {
      label: 'Closed',
      style: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      },
    },
  },
  // ===== DLP (DEFECT LIABILITY PERIOD) STATUSES =====
  dlp: {
    upcoming: {
      label: 'Upcoming',
      style: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
    },
    'due-soon': {
      label: 'Due Soon',
      style: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      },
    },
    overdue: {
      label: 'Overdue',
      style: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      },
    },
    processing: {
      label: 'Processing',
      style: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      },
    },
    completed: {
      label: 'Completed',
      style: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      },
    },
  },
};

const FALLBACK_STYLE: StatusStyle = {
  bg: 'bg-gray-100',
  text: 'text-gray-700',
  border: 'border-gray-300',
  dot: 'bg-gray-400',
};

// ---------- Helper functions ----------
export function getStatusBadgeStyle(status: string, domain: StatusDomain): string {
  const lowerStatus = status?.toLowerCase() || '';
  const config = STATUS_CONFIG[domain];
  const matched = config[lowerStatus];
  const style = matched ? matched.style : FALLBACK_STYLE;
  return `${style.bg} ${style.text} ${style.border}`;
}

export function getStatusStyles(status: string, domain: StatusDomain): StatusStyle {
  const lowerStatus = status?.toLowerCase() || '';
  const config = STATUS_CONFIG[domain];
  const matched = config[lowerStatus];
  return matched ? matched.style : FALLBACK_STYLE;
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

// ----- DLP status helpers -----
export const getDlpStatusBadgeStyle = (status: string) => getStatusBadgeStyle(status, 'dlp');
export const getDlpStatusLabel = (status: string) => getStatusLabel(status, 'dlp');
export const getDlpStatusStyles = (status: string) => getStatusStyles(status, 'dlp');
