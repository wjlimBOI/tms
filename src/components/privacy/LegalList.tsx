interface LegalListProps {
  items: React.ReactNode[];
  variant?: 'disc' | 'decimal';
}

export function LegalList({ items, variant = 'disc' }: LegalListProps) {
  const listClass =
    variant === 'disc'
      ? 'space-y-2 pl-6 list-disc marker:text-slate-500'
      : 'space-y-2 pl-6 list-decimal marker:text-slate-500 marker:font-semibold';

  return (
    <ul className={listClass}>
      {items.map((item, idx) => (
        <li key={idx} className="text-slate-700 dark:text-slate-300 leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}