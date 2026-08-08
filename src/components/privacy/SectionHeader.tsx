interface SectionHeaderProps {
  id?: string;
  level: 2 | 3;
  children: React.ReactNode;
  summary?: string;
}

export function SectionHeader({ id, level, children, summary }: SectionHeaderProps) {
  const HeadingTag = level === 2 ? 'h2' : 'h3';
  const className =
    level === 2
      ? 'text-2xl font-bold text-slate-900 mt-12 mb-5 tracking-tight'
      : 'text-xl font-semibold text-slate-800 mt-10 mb-4 tracking-tight';

  return (
    <>
      <HeadingTag id={id} className={className}>
        {children}
      </HeadingTag>
      {summary && (
        <div className="bg-slate-50 border-l-4 border-slate-500 p-4 text-sm text-slate-600 mb-4 rounded-sm">
          {summary}
        </div>
      )}
    </>
  );
}