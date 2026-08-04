import { query } from '../src/lib/db';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function analyzeSearchLogs() {
  try {
    console.log('📊 Analyzing search logs...\n');

    // 1. Top clicked queries (with the item they clicked)
    const clicked = await query(`
      SELECT query, item_key, COUNT(*) as clicks
      FROM search_logs
      WHERE clicked = true AND item_key IS NOT NULL
      GROUP BY query, item_key
      ORDER BY clicks DESC
      LIMIT 50
    `);
    console.log('✅ Most clicked searches (query → item_key):');
    console.table(clicked.rows);

    // 2. Queries with no results (no clicks and no item_key)
    const noResults = await query(`
      SELECT query, COUNT(*) as attempts
      FROM search_logs
      WHERE clicked = false AND item_key IS NULL
      GROUP BY query
      ORDER BY attempts DESC
      LIMIT 20
    `);
    console.log('\n❌ Queries with no results (candidates for new synonyms):');
    console.table(noResults.rows);

    // 3. Queries that led to clicks but could have better synonyms
    // Extract keywords from queries and see if they already exist in synonymMap
    // This is a simple heuristic: for each clicked query, split into words,
    // remove stop words, and compare to existing synonyms.
    // For a manual review, we'll just print the queries and the item descriptions.
    const clickedWithDetails = await query(`
      SELECT 
        sl.query,
        sl.item_key,
        COUNT(*) as clicks,
        li.description,
        li.brand
      FROM search_logs sl
      JOIN bq_line_item li ON li.description ILIKE '%' || sl.item_key || '%'  -- crude join – you can improve by using the actual key mapping
      WHERE sl.clicked = true AND sl.item_key IS NOT NULL
      GROUP BY sl.query, sl.item_key, li.description, li.brand
      ORDER BY clicks DESC
      LIMIT 20
    `);
    console.log('\n📝 Clicked queries with item descriptions (review for missing synonyms):');
    clickedWithDetails.rows.forEach(row => {
      console.log(`- "${row.query}" → ${row.description} (${row.brand}) [${row.clicks} clicks]`);
    });

    // 4. Suggest new synonyms based on query words that are not in the current map
    // You could implement a script that extracts unique words from queries
    // and checks them against your existing synonymMap – but we'll keep it manual for now.

    console.log('\n💡 Next steps:');
    console.log('1. Review the "no results" queries – consider adding them to synonymMap.');
    console.log('2. Review clicked queries – if the query contains a word that is not in the map but appears in the description, add it.');
    console.log('3. Update synonymMap in src/lib/search-utils.ts (or move to database for dynamic updates).');
    console.log('4. Re-run the analysis after adding synonyms to measure improvement.');
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

analyzeSearchLogs().then(() => process.exit(0));