// hooks/useSearch.ts
import { useMemo } from 'react';
import { getSmartKeywords, createFuse } from '@/lib/search-utils';

export function useSearch(items: any[], query: string) {
  // Build fuse index only once
  const fuse = useMemo(() => {
    if (!items.length) return null;
    return createFuse(items);
  }, [items]);

  return useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return [];

    // 1. Smart keyword search (stemming + synonyms)
    const keywords = getSmartKeywords(trimmed);
    let results: any[] = [];
    if (keywords.length > 0) {
      results = items.filter(({ item }) => {
        const text = (item.item_number + ' ' + item.description + ' ' + (item.brand || '')).toLowerCase();
        return keywords.some(kw => text.includes(kw));
      });
    }

    // 2. If no results, fall back to fuzzy search
    if (results.length === 0 && fuse) {
      const fuzzy = fuse.search(trimmed);
      results = fuzzy.map(r => r.item);
    }

    // 3. If still no results, fall back to simple substring (original)
    if (results.length === 0) {
      const lower = trimmed.toLowerCase();
      results = items.filter(({ item }) =>
        item.item_number.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower) ||
        (item.brand && item.brand.toLowerCase().includes(lower))
      );
    }

    return results;
  }, [query, items, fuse]);
}