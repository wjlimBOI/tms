interface CalloutBoxProps {
  type: 'info' | 'warning' | 'highlight';
  children: React.ReactNode;
}

export function CalloutBox({ type, children }: CalloutBoxProps) {
  const styles = {
    info: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-600 dark:border-cyan-400',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-500',
    highlight: 'bg-slate-100 dark:bg-slate-800/50 border-slate-400 dark:border-slate-600',
  };

  return (
    <div className={`border-l-4 p-5 my-6 rounded-r-lg ${styles[type]}`}>
      <div className="text-sm text-slate-700 dark:text-slate-300 m-0">{children}</div>
    </div>
  );
}