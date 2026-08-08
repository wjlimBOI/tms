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
    <div className="toc-container mb-10 p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
        Contents
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="toc-link text-cyan-600 hover:underline"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}