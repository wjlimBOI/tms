interface SectionHeaderProps {
  id?: string;
  level: 2 | 3;
  children: React.ReactNode;
}

export function SectionHeader({ id, level, children }: SectionHeaderProps) {
  const HeadingTag = level === 2 ? 'h2' : 'h3';
  const className =
    level === 2
      ? 'font-serif text-2xl font-bold text-slate-900 mt-12 mb-5 tracking-tight scroll-mt-24'
      : 'font-serif text-xl font-semibold text-slate-800 mt-10 mb-4 tracking-tight scroll-mt-24';

  return (
    <HeadingTag id={id} className={className}>
      {children}
    </HeadingTag>
  );
}
