// lib/description-generator.ts
//
// Local, rule-based tender description generator. Runs without any LLM —
// parses a short staff note for recognizable signals (project type, phases,
// closure status, duration, night work) and composes real sentences from
// them. Used as the primary generator when no ANTHROPIC_API_KEY is
// configured, and as a fallback if the Anthropic call fails.

type Closure = "none" | "full" | "partial" | "unspecified" | null;

interface ClauseInfo {
  raw: string;
  phaseNumber: number | null;
  closure: Closure;
  duration: string | null;
  nightWorkOnly: boolean;
}

const CLAUSE_SPLIT = /\s*(?:,\s*)?\b(?:but|while|whereas|however)\b\s*|\s*;\s*/gi;

function splitClauses(input: string): string[] {
  return input
    .split(CLAUSE_SPLIT)
    .map((c) => c.trim())
    .filter(Boolean);
}

function extractPhaseNumber(clause: string): number | null {
  const m = clause.match(/\bphase\s*(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractPhaseCount(input: string): number | null {
  const m = input.match(/\b(\d+)\s*phases\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractDuration(clause: string): string | null {
  const m = clause.match(/\b(\d+)\s*(day|days|week|weeks|month|months)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase().replace(/s$/, "");
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function extractClosure(clause: string): Closure {
  const lower = clause.toLowerCase();
  if (
    /\bwithout\s+(any\s+)?closure\b/.test(lower) ||
    /\bno\s+closure\b/.test(lower) ||
    /\bnot\s+closed\b/.test(lower)
  ) {
    return "none";
  }
  if (/\bfully?\s+closure\b/.test(lower) || /\bfull\s+closure\b/.test(lower) || /\bfully\s+closed\b/.test(lower)) {
    return "full";
  }
  if (/\bpartial\s+closure\b/.test(lower) || /\bpartially\s+closed\b/.test(lower)) {
    return "partial";
  }
  if (/\bclosure\b/.test(lower) || /\bclosed\b/.test(lower)) {
    return "unspecified";
  }
  return null;
}

function isNightWorkOnly(clause: string): boolean {
  return /\bnight\s*works?\b/i.test(clause) || /\bafter[\s-]?hours\b/i.test(clause);
}

function isMinorProject(input: string): boolean {
  return /\bminor\s+(project|works?|renovation)\b/i.test(input);
}

function isMajorProject(input: string): boolean {
  return /\bmajor\s+(project|works?|renovation)\b/i.test(input);
}

function closureFragment(closure: Closure, duration: string | null): string | null {
  switch (closure) {
    case "none":
      return "the site will remain open with no closure required";
    case "full":
      return duration
        ? `the site will be fully closed for approximately ${duration}`
        : "the site will be fully closed";
    case "partial":
      return duration
        ? `the site will be partially closed for approximately ${duration}`
        : "the site will be partially closed";
    case "unspecified":
      return duration ? `closure will be required for approximately ${duration}` : "closure will be required";
    default:
      return null;
  }
}

function rawFragment(raw: string): string {
  return raw.trim().replace(/[.\s]+$/, "");
}

function capitalizeSentence(fragment: string): string {
  const t = fragment.trim();
  if (!t) return "";
  const capitalized = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function generateLocalDescription(
  input: string,
  opts?: { tenderName?: string; renovationType?: string }
): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const clauses: ClauseInfo[] = splitClauses(trimmed).map((raw) => ({
    raw,
    phaseNumber: extractPhaseNumber(raw),
    closure: extractClosure(raw),
    duration: extractDuration(raw),
    nightWorkOnly: isNightWorkOnly(raw),
  }));

  const totalPhases = extractPhaseCount(trimmed);
  const minor = isMinorProject(trimmed);
  const major = isMajorProject(trimmed);

  const sentences: string[] = [];

  if (minor || major || opts?.renovationType || totalPhases) {
    const subject = minor
      ? "This minor renovation project"
      : major
      ? "This major renovation project"
      : opts?.renovationType
      ? `This ${opts.renovationType.toLowerCase()} project`
      : "This project";
    const predicates: string[] = [];
    if (totalPhases) predicates.push(`will be carried out in ${totalPhases} phases`);
    sentences.push(predicates.length > 0 ? `${subject} ${predicates.join(", and ")}.` : `${subject}.`);
  }

  for (const c of clauses) {
    const parts: string[] = [];
    const cf = closureFragment(c.closure, c.duration);
    if (cf) parts.push(cf);
    if (c.nightWorkOnly) parts.push("works will be limited to night hours only");

    const body = parts.length > 0 ? parts.join(", and ") : rawFragment(c.raw);
    if (!body) continue;

    const prefix = c.phaseNumber !== null ? `Phase ${c.phaseNumber}: ` : "";
    sentences.push(prefix + capitalizeSentence(body));
  }

  if (sentences.length === 0) {
    return capitalizeSentence(trimmed);
  }

  return sentences.join(" ").replace(/\s+/g, " ").trim();
}
