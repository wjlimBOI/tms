import Fuse from 'fuse.js';

// ---------- STOP WORDS ----------
export const stopWords = new Set([
  "a","an","the","of","for","on","at","to","in","with","without",
  "and","or","but","so","for","nor","yet","as","by","from","into",
  "what","which","who","whom","whose","why","how","where","when",
  "are","were","was","is","am","be","been","being","do","does","did",
  "have","has","had","we","you","they","them","their","our","us",
  "kind","type","style","need","want","use","using","used",
  "much","many","more","most","some","any","such",
  "cost","price","pricing","costing","expensive","cheap",
  "please","help","tell","show","give","find","looking","would",
  "could","should","may","might","must","shall","will","can",
]);

// ---------- DYNAMIC MAPS ----------
let loaded = false;
let synonymMap: Record<string, string[]> = {};
let phraseMap: Record<string, string[]> = {};

export async function loadSynonyms(): Promise<void> {
  if (loaded) return;
  try {
    const res = await fetch('/api/config/synonyms');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    synonymMap = data.synonyms || {};
    phraseMap = data.phrases || {};
    loaded = true;
    console.log('✅ Synonyms loaded from DB');
  } catch (error) {
    console.error('❌ Failed to load synonyms from DB, using static fallback.', error);
    // Fallback to static values to keep the app working
    synonymMap = {
      "screed": ["screed", "screeding", "screeds"],
      "ceil": ["ceiling", "ceil", "ceilings"],
      "led": ["led", "light", "lights", "lighting"],
      "carpet": ["carpet", "carpets", "carpeting"],
      "paint": ["paint", "paints", "painting"],
      "tile": ["tile", "tiles", "tiling"],
      "plumb": ["plumbing", "plumb", "plumber"],
      "elect": ["electrical", "electric", "electrician", "elect"],
      "acmv": ["acmv", "aircon", "hvac"],
      "demo": ["demolition", "demo", "demolish"],
      "hoard": ["hoarding", "hoard", "hoardings"],
      "insurance": ["insurance", "insured"],
      "scaffold": ["scaffold", "scaffolding"],
      "mech": ["mechanical", "mech", "m&e"],
      "carpentry": ["carpentry", "woodwork", "carpenter"],
      "glass": ["glass", "glazing", "mirror"],
      "door": ["door", "doors", "doorway"],
      "window": ["window", "windows", "glazing"],
      "floor": ["floor", "floors", "flooring"],
      "wall": ["wall", "walls", "partition"],
    };
    phraseMap = {
      "reception counter": ["reception counter", "reception desk", "front counter"],
      "false ceiling": ["false ceiling", "drop ceiling", "suspended ceiling"],
    };
    loaded = true;
  }
}

// ---------- STEM ----------
function stemWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith("ing")) return lower.slice(0, -3);
  if (lower.endsWith("ed")) return lower.slice(0, -2);
  if (lower.endsWith("es")) return lower.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  if (lower.endsWith("ly")) return lower.slice(0, -2);
  if (lower.endsWith("ful")) return lower.slice(0, -3);
  return lower;
}

function expandSynonyms(word: string): string[] {
  const stem = stemWord(word);
  const results = [stem];
  for (const [key, variants] of Object.entries(synonymMap)) {
    if (variants.includes(stem)) {
      results.push(key);
      for (const v of variants) {
        if (v !== stem) results.push(v);
      }
    }
  }
  return results;
}

// ---------- EXTRACT KEYWORDS ----------
export function getSmartKeywords(query: string): string[] {
  const lower = query.toLowerCase();
  const keywords: string[] = [];

  // Detect phrases from phraseMap
  for (const [phrase, variants] of Object.entries(phraseMap)) {
    if (variants.some(v => lower.includes(v))) {
      keywords.push(phrase);
    }
  }

  const words = lower.split(/\s+/);
  for (const w of words) {
    if (w.length < 2) continue;
    if (stopWords.has(w)) continue;
    const expanded = expandSynonyms(w);
    for (const e of expanded) {
      if (e.length > 1 && !keywords.includes(e)) keywords.push(e);
    }
  }

  return [...new Set(keywords)];
}

// ---------- COST QUERY ----------
export function isCostQuery(query: string): boolean {
  const costPhrases = ["how much", "what is the price", "price", "cost", "how much is", "total", "amount", "expensive", "cheap", "costing", "pricing"];
  const lower = query.toLowerCase();
  return costPhrases.some(phrase => lower.includes(phrase));
}

// ---------- HIGHLIGHT ----------
export function highlightMatches(text: string, keywords: string[]): string {
  if (!text || keywords.length === 0) return text;
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(escaped.join('|'), 'gi');
  return text.replace(regex, match => `<mark class="bg-yellow-300/70 dark:bg-yellow-500/60 text-gray-900 dark:text-white px-0.5 rounded">${match}</mark>`);
}

// ---------- FUSE ----------
export function createFuse(items: any[], keys: string[] = ['searchText']) {
  const searchable = items.map(({ item, key, category, section }) => ({
    ...item,
    key,
    category,
    section,
    searchText: `${item.item_number} ${item.description} ${item.brand || ''}`.toLowerCase(),
  }));
  return new Fuse(searchable, {
    keys,
    threshold: 0.4,
    includeScore: true,
  });
}

// ---------- PERFORM SEARCH ----------
export function performSearch(
  query: string,
  allItems: any[],
  fuseInstance: Fuse<any> | null
): any[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const keywords = getSmartKeywords(trimmed);
  let results: any[] = [];
  if (keywords.length > 0) {
    results = allItems.filter(({ item }) => {
      const text = (item.item_number + ' ' + item.description + ' ' + (item.brand || '')).toLowerCase();
      return keywords.every(kw => text.includes(kw));
    });
  }

  if (results.length === 0 && fuseInstance) {
    const fuzzy = fuseInstance.search(trimmed);
    results = fuzzy.map(r => r.item);
  }

  if (results.length === 0) {
    const lower = trimmed.toLowerCase();
    results = allItems.filter(({ item }) =>
      item.item_number.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower) ||
      (item.brand && item.brand.toLowerCase().includes(lower))
    );
  }

  return results;
}