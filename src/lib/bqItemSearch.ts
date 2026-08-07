// Pure ranking logic for the "find & reuse existing BQ item" search
// (src/app/api/admin/bq-template/item-search/route.ts). This is NOT a real
// LLM / semantic search — no embeddings or external API are involved, by
// design: no ANTHROPIC_API_KEY is configured in this app (see
// src/lib/anthropic.ts), and semantic search would need vector
// infrastructure that doesn't exist here either. Instead it's keyword
// overlap ranking plus a popularity boost from how many past tenders
// already used the same item description — the ranking naturally improves
// as more real BQ templates get created (more usage data), without any
// dedicated click-tracking table or ML model.

const STOPWORDS = new Set(["and", "the", "a", "an", "of", "for", "to", "with", "in", "on", "at"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export interface SearchCandidate {
  description: string;
  usageCount: number;
}

// Higher is more relevant, 0 means "not a match, exclude it." Combines
// query/description word overlap (the dominant factor — a word can match
// via substring either direction, so "tile" matches "tiling") with a
// log-scaled popularity boost from usageCount, so an item reused across
// many past tenders ranks slightly higher among otherwise-similar matches.
export function scoreMatch(query: string, candidate: SearchCandidate): number {
  const queryWords = tokenize(query);
  const descWords = tokenize(candidate.description);
  if (queryWords.length === 0 || descWords.length === 0) return 0;

  const matched = queryWords.filter((qw) =>
    descWords.some((dw) => dw === qw || dw.includes(qw) || qw.includes(dw))
  ).length;
  const overlapRatio = matched / queryWords.length;
  if (overlapRatio === 0) return 0;

  const popularityBoost = Math.log2(candidate.usageCount + 1);
  return overlapRatio * 10 + popularityBoost;
}
