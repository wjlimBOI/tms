interface CalloutBoxProps {
  type: 'info' | 'warning' | 'highlight';
  children: React.ReactNode;
}

export function CalloutBox({ type, children }: CalloutBoxProps) {
  const styles = {
    info: 'bg-cyan-50 border-cyan-600',
    warning: 'bg-amber-50 border-amber-500',
    highlight: 'bg-slate-100 border-slate-400',
  };

  return (
    <div className={`border-l-4 p-5 my-6 rounded-r-lg ${styles[type]}`}>
      <div className="text-sm text-slate-700 m-0">{children}</div>
    </div>
  );
}