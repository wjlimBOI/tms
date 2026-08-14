interface ClauseProps {
  number: string;
  children: React.ReactNode;
}

// Renders a numbered legal clause (e.g. "3.1", "14.2.1") as a label next to
// its text, matching the N / N.M / N.M.M numbering convention used across
// the Terms of Use and Privacy Policy source drafts.
export function Clause({ number, children }: ClauseProps) {
  return (
    <div className="mt-4 flex gap-3">
      <span className="mt-0.5 shrink-0 min-w-[2.75rem] font-mono text-sm font-semibold text-slate-400">
        {number}
      </span>
      <p className="flex-1 text-slate-700 leading-relaxed">{children}</p>
    </div>
  );
}
