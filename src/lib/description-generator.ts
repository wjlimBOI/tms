// lib/description-generator.ts
//
// Local, rule-based tender description generator. Runs without any LLM —
// parses a short staff note for recognizable signals (project type, phases,
// closure status, duration, night work, and per-work-item durations) and
// composes real sentences from them. Used as the primary generator when no
// ANTHROPIC_API_KEY is configured, and as a fallback if the Anthropic call
// fails.

type Closure = "none" | "full" | "partial" | "unspecified" | null;

interface ClauseInfo {
  raw: string;
  phaseNumber: number | null;
  closure: Closure;
  duration: string | null;
  nightWorkOnly: boolean;
}

interface DurationSegment {
  duration: string;
  workType: string;
}

const CLAUSE_SPLIT = /\s*(?:,\s*)?\b(?:but|while|whereas|however)\b\s*|\s*;\s*/gi;

const PROJECT_SIZE_WORDS = ["small", "minor", "major", "large", "substantial", "extensive"];
const PROJECT_TYPE_WORDS = [
  "refurbishment",
  "renovation",
  "revamp",
  "upgrade",
  "fit-out",
  "fitout",
  "repair",
  "maintenance",
  "construction",
  "installation",
  "reinstatement",
];

// Matches "<n> <unit> for/of <work type words>" so multi-part notes like
// "15 days for night works and another 6 days for minor work" keep every
// duration instead of only the first one the old single-duration regex saw.
const SEGMENT_RE =
  /(\d+)\s*(day|days|week|weeks|month|months)\s+(?:for|of)\s+([a-z][a-z\s-]*?)(?=\s*(?:,|;|\.|$| and ))/gi;

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

// Finds every "<n> <unit> for/of <work>" pattern in the full input, not just
// the first duration mentioned — this is what lets a note describing several
// work items with different durations (night works vs. minor work, etc.)
// come through with all of them instead of just one.
function extractDurationSegments(input: string): DurationSegment[] {
  const segments: DurationSegment[] = [];
  const re = new RegExp(SEGMENT_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase().replace(/s$/, "");
    const workType = m[3].trim().replace(/\s+/g, " ");
    if (!workType) continue;
    segments.push({ duration: `${n} ${unit}${n === 1 ? "" : "s"}`, workType });
  }
  return segments;
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

// Restricted to the text before the first digit so a work-item mention like
// "6 days for minor work" doesn't get mistaken for the overall project being
// described as "minor" — the project-level size/type descriptor should come
// from how the note opens, not from a work item buried later in the sentence.
function extractProjectDescriptor(preamble: string): { size: string | null; type: string | null } {
  const lower = preamble.toLowerCase();
  const size = PROJECT_SIZE_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(lower)) || null;
  const type =
    PROJECT_TYPE_WORDS.find((w) => new RegExp(`\\b${w.replace("-", "-?")}\\b`).test(lower)) || null;
  return { size, type };
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

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildSubjectSentence(
  size: string | null,
  type: string | null,
  totalPhases: number | null,
  renovationType: string | undefined
): string {
  let base: string;
  if (size && type) base = `This ${size} ${type} project`;
  else if (type) base = `This ${type} project`;
  else if (size) base = `This ${size} project`;
  else if (renovationType) base = `This ${renovationType.toLowerCase()} project`;
  else base = "This project";

  if (totalPhases) base += ` will be carried out in ${totalPhases} phases`;
  return capitalizeSentence(base);
}

export function generateLocalDescription(
  input: string,
  opts?: { tenderName?: string; renovationType?: string }
): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const firstDigitIdx = trimmed.search(/\d/);
  const preamble = firstDigitIdx === -1 ? trimmed : trimmed.slice(0, firstDigitIdx);

  const clauses: ClauseInfo[] = splitClauses(trimmed).map((raw) => ({
    raw,
    phaseNumber: extractPhaseNumber(raw),
    closure: extractClosure(raw),
    duration: extractDuration(raw),
    nightWorkOnly: isNightWorkOnly(raw),
  }));

  const totalPhases = extractPhaseCount(trimmed);
  const { size, type } = extractProjectDescriptor(preamble);
  const segments = extractDurationSegments(trimmed);

  const sentences: string[] = [];

  if (size || type || opts?.renovationType || totalPhases) {
    sentences.push(buildSubjectSentence(size, type, totalPhases, opts?.renovationType));
  }

  if (segments.length > 0) {
    const parts = segments.map((s) => `${s.workType} (approximately ${s.duration})`);
    sentences.push(capitalizeSentence(`the works comprise ${joinWithAnd(parts)}`));
  }

  // Per-work-item night timing is already captured in the segments sentence
  // above, so the broader "night work only" claim is only added when it
  // wasn't already accounted for there — otherwise it would incorrectly
  // extend night-only timing to work items the note never said were night work.
  const nightCoveredBySegments = segments.some((s) => /night/i.test(s.workType));

  for (const c of clauses) {
    const parts: string[] = [];
    const cf = closureFragment(c.closure, c.duration);
    if (cf) parts.push(cf);
    if (c.nightWorkOnly && !nightCoveredBySegments) parts.push("works will be limited to night hours only");

    const body = parts.length > 0 ? parts.join(", and ") : segments.length === 0 ? rawFragment(c.raw) : null;
    if (!body) continue;

    const prefix = c.phaseNumber !== null ? `Phase ${c.phaseNumber}: ` : "";
    sentences.push(prefix + capitalizeSentence(body));
  }

  if (sentences.length === 0) {
    return capitalizeSentence(trimmed);
  }

  return sentences.join(" ").replace(/\s+/g, " ").trim();
}
