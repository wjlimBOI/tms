// components/privacy/TableOfContents.tsx
interface TocItem {
  id: string;
  label: string;
}

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  return (
    <nav className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-slate-900">Contents</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block rounded-lg px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-[#15406a]/5 hover:text-[#15406a]"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
