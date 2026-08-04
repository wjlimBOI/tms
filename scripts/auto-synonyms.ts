import { query } from '../src/lib/db';
import natural from 'natural';
import { stopWords } from '../src/lib/search-utils'; // adjust path to your search-utils

const tokenizer = new natural.WordTokenizer();

// ========== CONFIGURATION ==========
const MIN_CLICKS = 3;
const CONFIDENCE_THRESHOLD = 0.6;
const DAYS_BACK = 30;

function cleanWords(text: string): string[] {
  const tokens = tokenizer.tokenize(text.toLowerCase());
  return tokens.filter(w => w.length > 2 && !stopWords.has(w));
}

function computeConfidence(count: number, totalSearches: number): number {
  const frequency = count / totalSearches;
  return Math.min(frequency * 5, 1);
}

async function autoDiscoverSynonyms() {
  console.log('🔍 Starting auto‑synonym discovery...');

  const logs = await query(`
    SELECT 
      sl.query,
      sl.item_key,
      li.description
    FROM search_logs sl
    LEFT JOIN bq_line_item li ON li.submission_id = (substring(sl.item_key FROM '^(.*?)_'))::int
    WHERE sl.clicked = true 
      AND sl.item_key IS NOT NULL
      AND sl.timestamp > NOW() - INTERVAL '${DAYS_BACK} days'
  `);

  if (logs.rows.length === 0) {
    console.log('ℹ️ No clicked searches found in the last', DAYS_BACK, 'days.');
    return;
  }

  console.log(`📊 Found ${logs.rows.length} clicked searches.`);

  const candidateMap = new Map<string, { count: number; items: Set<string>; descriptions: Set<string> }>();

  for (const row of logs.rows) {
    const queryWords = cleanWords(row.query);
    const descWords = cleanWords(row.description || '');
    const itemKey = row.item_key;

    for (const word of queryWords) {
      if (!candidateMap.has(word)) {
        candidateMap.set(word, { count: 0, items: new Set(), descriptions: new Set() });
      }
      const entry = candidateMap.get(word)!;
      entry.count += 1;
      entry.items.add(itemKey);
      descWords.forEach(d => entry.descriptions.add(d));
    }
  }

  const candidates = Array.from(candidateMap.entries())
    .filter(([word, data]) => data.count >= MIN_CLICKS)
    .map(([word, data]) => ({
      word,
      count: data.count,
      itemCount: data.items.size,
      descriptions: Array.from(data.descriptions).join(' '),
    }));

  console.log(`✅ Found ${candidates.length} candidate synonyms with at least ${MIN_CLICKS} clicks.`);

  const totalSearches = logs.rows.length;
  let inserted = 0;
  let pending = 0;

  for (const c of candidates) {
    const confidence = computeConfidence(c.count, totalSearches);

    // Check if already a base_term
    const existing = await query(`SELECT base_term FROM synonym_map WHERE base_term = $1`, [c.word]);
    if (existing.rows.length > 0) continue;

    const existingVariant = await query(`SELECT base_term FROM synonym_map WHERE $1 = ANY(variants)`, [c.word]);
    if (existingVariant.rows.length > 0) continue;

    if (confidence >= CONFIDENCE_THRESHOLD) {
      await query(`
        INSERT INTO synonym_map (base_term, variants) 
        VALUES ($1, ARRAY[$1])
        ON CONFLICT (base_term) DO NOTHING
      `, [c.word]);
      inserted++;
      console.log(`✅ Auto-inserted: "${c.word}" (confidence: ${confidence.toFixed(2)})`);
    } else {
      await query(`
        INSERT INTO pending_synonyms (base_term, variant, confidence, count)
        VALUES ($1, $1, $2, $3)
        ON CONFLICT (base_term) DO UPDATE SET 
          count = pending_synonyms.count + $3,
          confidence = (pending_synonyms.confidence * pending_synonyms.count + $2) / (pending_synonyms.count + $3)
      `, [c.word, confidence, c.count]);
      pending++;
      console.log(`📝 Queued for review: "${c.word}" (confidence: ${confidence.toFixed(2)}, count: ${c.count})`);
    }
  }

  console.log(`\n✨ Done. Auto-inserted ${inserted} synonyms, queued ${pending} for review.`);
}

autoDiscoverSynonyms().then(() => process.exit(0));