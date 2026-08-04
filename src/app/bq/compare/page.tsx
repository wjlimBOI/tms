"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import React from "react";
import Link from "next/link";
import { getBrandColor } from "@/lib/brandColors";
import { highlightMatches } from "@/lib/search-utils";

// ==================== INTERFACES ====================
interface Submission {
  submission_id: number;
  version_name: string;
  round_no: number;
  client_name: string;
  job_site: string;
  tender_name: string;
  status: string;
  bq_name?: string;
  work_type?: string;
  contractor_name?: string;
}

interface ItemData {
  quantity: number;
  unit_price: number;
  discount: number;
  amount: number;
  location?: string;
  specifications?: string;
}

interface ComparisonItem {
  item_number: string;
  description: string;
  brand: string;
  unit: string;
  items: Record<number, ItemData>;
}

interface Section {
  section_name: string;
  items: ComparisonItem[];
}

interface Category {
  category_name: string;
  sections: Section[];
}

interface SearchResultItem {
  category_name: string;
  description: string;
  brand: string;
  unit: string;
  submissions: {
    submission_id: number;
    client_name: string;
    contractor_name: string;
    version: string;
    amount: number;
    unit_price: number;
    quantity: number;
  }[];
}

// ==================== HELPERS ====================
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
};

const formatQuantity = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const getHighlightClass = (value: number, min: number, max: number, hasData: boolean): string => {
  if (value === 0) return "bg-gray-100 dark:bg-gray-800/70 text-gray-500 dark:text-gray-300";
  if (!hasData || min === max) return "text-gray-700 dark:text-white/70";
  if (value === min) return "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-100 font-semibold";
  if (value === max) return "bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-100 font-semibold";
  return "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-100 font-medium";
};

const compatibleGroups: Record<string, string[]> = {
  "New York": ["Sakura", "Victoria"],
  Sakura: ["New York", "Victoria"],
  Victoria: ["New York", "Sakura"],
  "Yun Nam": ["Jonsson"],
  Jonsson: ["Yun Nam"],
  Dorra: ["London"],
  London: ["Dorra"],
};

const brandShortNameMap: Record<string, string> = {
  "NEW YORK SKIN SOLUTIONS (S) PTE LTD": "New York",
  "YUN NAM HAIR CARE (S) PTE LTD": "Yun Nam",
  "LONDON WEIGHT MANAGEMENT (S) PTE LTD": "London",
  "DORRA SLIMMING PTE LTD": "Dorra",
  "SHAKURA PIGMENTATION BEAUTY PTE LTD": "Sakura",
  "VICTORIA FACELIFT PTE LTD": "Victoria",
  "JONSSON PROTEIN HEALTHY HAIR GROWTH PTE LTD": "Jonsson",
};

const getShortBrand = (fullBrand: string): string => {
  return brandShortNameMap[fullBrand] || fullBrand;
};

// ==================== MAIN COMPONENT ====================
export default function CompareBQPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlIds = searchParams.get("ids")?.split(",").map(Number).filter(id => !isNaN(id)) || [];

  const [availableBQs, setAvailableBQs] = useState<Submission[]>([]);
  const [filteredBQs, setFilteredBQs] = useState<Submission[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>(urlIds);
  const [comparisonData, setComparisonData] = useState<{ submissions: Submission[]; categories: Category[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [highlightMetric, setHighlightMetric] = useState<"unit_price" | "amount">("unit_price");
  const [maskContractors, setMaskContractors] = useState(false);

  const [showAISearch, setShowAISearch] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedJobSite, setSelectedJobSite] = useState("");
  const [selectedWorkType, setSelectedWorkType] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [jobSiteOptions, setJobSiteOptions] = useState<string[]>([]);
  const [workTypeOptions, setWorkTypeOptions] = useState<string[]>([]);

  const [fetchAvailableError, setFetchAvailableError] = useState<string | null>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const [highlightedItemKey, setHighlightedItemKey] = useState<string | null>(null);

  // --- Permission check ---
  useEffect(() => {
    const checkAccess = async () => {
      if (status === "loading") return;
      if (!session) {
        router.push("/login");
        return;
      }
      try {
        const res = await fetch("/api/user/permissions");
        const data = await res.json();
        if (!data.permissions.includes("view_cost_comparison")) {
          router.push("/");
          return;
        }
        setHasAccess(true);
      } catch (err) {
        console.error(err);
        router.push("/");
      }
    };
    checkAccess();
  }, [session, status, router]);

  // --- Fetch available BQs ---
  useEffect(() => {
    if (hasAccess !== true) return;
    setLoadingAvailable(true);
    setFetchAvailableError(null);
    fetch("/api/bq/my-submissions?limit=100")
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        return res.json();
      })
      .then((response) => {
        const bqs = response.data || [];
        if (!Array.isArray(bqs)) {
          throw new Error("API response missing 'data' array");
        }
        if (bqs.length === 0) {
          setFetchAvailableError(null); // no error, just empty
        }
        setAvailableBQs(bqs);
        setFilteredBQs(bqs);

        const brands = bqs
          .map((bq: Submission) => bq.client_name)
          .filter((name): name is string => Boolean(name));
        setBrandOptions([...new Set(brands)].sort());

        const jobSites = bqs
          .map((bq: Submission) => bq.job_site)
          .filter((site): site is string => Boolean(site));
        setJobSiteOptions([...new Set(jobSites)].sort());

        const workTypes = bqs
          .map((bq: Submission) => bq.work_type)
          .filter((wt): wt is string => Boolean(wt));
        setWorkTypeOptions([...new Set(workTypes)].sort());
      })
      .catch((err) => {
        console.error("Failed to load available BQs:", err);
        setFetchAvailableError(`Failed to load cost estimates: ${err.message}. Please check the API endpoint.`);
      })
      .finally(() => setLoadingAvailable(false));
  }, [hasAccess]);

  // --- Filters ---
  useEffect(() => {
    let filtered = [...availableBQs];
    if (globalSearch.trim()) {
      const searchLower = globalSearch.toLowerCase();
      filtered = filtered.filter((bq) =>
        bq.client_name?.toLowerCase().includes(searchLower) ||
        bq.job_site?.toLowerCase().includes(searchLower) ||
        bq.work_type?.toLowerCase().includes(searchLower) ||
        bq.bq_name?.toLowerCase().includes(searchLower)
      );
    }
    if (selectedBrand) filtered = filtered.filter((bq) => bq.client_name === selectedBrand);
    if (selectedJobSite) filtered = filtered.filter((bq) => bq.job_site === selectedJobSite);
    if (selectedWorkType) filtered = filtered.filter((bq) => bq.work_type === selectedWorkType);
    setFilteredBQs(filtered);
  }, [globalSearch, selectedBrand, selectedJobSite, selectedWorkType, availableBQs]);

  const clearFilters = () => {
    setGlobalSearch("");
    setSelectedBrand("");
    setSelectedJobSite("");
    setSelectedWorkType("");
  };

  // --- Fetch comparison data for selected BQs ---
  useEffect(() => {
    if (hasAccess !== true) return;
    if (selectedIds.length < 2) {
      setComparisonData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/bq/compare?ids=${selectedIds.join(",")}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to load comparison data");
        }
        return res.json();
      })
      .then((data) => {
        if (!data || !data.submissions || !Array.isArray(data.categories)) {
          throw new Error("Invalid comparison data structure");
        }
        setComparisonData(data);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [selectedIds, hasAccess]);

  // --- Selection toggles ---
  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => [...new Set([...prev, ...filteredBQs.map((bq) => bq.submission_id)])]);
  };

  const clearSelected = () => setSelectedIds([]);

  const updateUrl = () => {
    if (selectedIds.length >= 2) {
      router.push(`/bq/compare?ids=${selectedIds.join(",")}`, { scroll: false });
    } else {
      router.push("/bq/compare", { scroll: false });
    }
  };

  useEffect(() => {
    if (selectedIds.length >= 2 && selectedIds.join(",") !== urlIds.join(",")) {
      updateUrl();
    }
  }, [selectedIds]);

  // --- Brand compatibility ---
  const getLeadBrand = (): string | null => {
    if (selectedIds.length === 0) return null;
    const firstId = selectedIds[0];
    if (comparisonData && comparisonData.submissions) {
      const sub = comparisonData.submissions.find((s) => s.submission_id === firstId);
      if (sub) return getShortBrand(sub.client_name);
    }
    const bq = availableBQs.find((b) => b.submission_id === firstId);
    return bq ? getShortBrand(bq.client_name) : null;
  };

  const getIncompatibleWithLead = (): string[] => {
    const lead = getLeadBrand();
    if (!lead || selectedIds.length < 2) return [];
    const otherBrands = new Set<string>();
    for (const id of selectedIds.slice(1)) {
      let brand = "";
      if (comparisonData && comparisonData.submissions) {
        const sub = comparisonData.submissions.find((s) => s.submission_id === id);
        if (sub) brand = getShortBrand(sub.client_name);
      }
      if (!brand) {
        const bq = availableBQs.find((b) => b.submission_id === id);
        if (bq) brand = getShortBrand(bq.client_name);
      }
      if (brand && brand !== lead) otherBrands.add(brand);
    }
    const allowed = compatibleGroups[lead] || [];
    return Array.from(otherBrands).filter((b) => !allowed.includes(b));
  };

  const leadBrand = getLeadBrand();
  const incompatibleBrands = getIncompatibleWithLead();
  let warningMessage = null;
  if (leadBrand && incompatibleBrands.length > 0) {
    if (incompatibleBrands.length === 1) {
      warningMessage = `⚠️ ${leadBrand} is not typically compared with ${incompatibleBrands[0]}. Results may not be meaningful.`;
    } else {
      const list = incompatibleBrands.slice(0, -1).join(", ");
      const last = incompatibleBrands[incompatibleBrands.length - 1];
      warningMessage = `⚠️ ${leadBrand} is not typically compared with ${list} or ${last}. Results may not be meaningful.`;
    }
  }

  // --- Comparison table filtering ---
  const getFilteredComparison = () => {
    if (!comparisonData) return null;
    if (!itemSearchTerm.trim()) return comparisonData;
    const term = itemSearchTerm.toLowerCase();
    const filteredCategories = comparisonData.categories
      .map((cat) => ({
        ...cat,
        sections: cat.sections
          .map((section) => ({
            ...section,
            items: section.items.filter(
              (item) =>
                item.item_number.toLowerCase().includes(term) ||
                item.description.toLowerCase().includes(term) ||
                (item.brand && item.brand.toLowerCase().includes(term))
            ),
          }))
          .filter((section) => section.items.length > 0),
      }))
      .filter((cat) => cat.sections.length > 0);
    return { submissions: comparisonData.submissions, categories: filteredCategories };
  };

  const filteredData = getFilteredComparison();

  // --- Mask contractor names (for the comparison table) ---
  const maskedContractorMap = useMemo(() => {
    if (!comparisonData) return new Map<string, string>();
    const uniqueNames = Array.from(
      new Set(comparisonData.submissions.map((s) => s.contractor_name || "Unknown").filter(Boolean))
    ).sort();
    const map = new Map<string, string>();
    uniqueNames.forEach((name, index) => {
      map.set(name, `Contractor ${String.fromCharCode(65 + index)}`);
    });
    return map;
  }, [comparisonData]);

  const getDisplayContractor = (originalName: string | undefined): string => {
    if (!originalName) return "Unknown";
    if (!maskContractors) return originalName;
    return maskedContractorMap.get(originalName) || originalName;
  };

  // ==================== AI SEARCH (Global API) ====================
  const performSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/bq/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Search failed");
      }
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce the search input
  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!aiSearchQuery.trim() || aiSearchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      performSearch(aiSearchQuery);
    }, 300);
    setDebounceTimer(timer);
    return () => clearTimeout(timer);
  }, [aiSearchQuery, performSearch]);

  // Reset detailed view when new results arrive
  useEffect(() => {
    setShowDetailedResults(false);
    setShowFullSummary(false);
  }, [searchResults]);

  // --- Log non-clicked searches when modal closes ---
  useEffect(() => {
    if (!showAISearch && aiSearchQuery.trim() && searchResults.length === 0) {
      fetch('/api/log-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiSearchQuery, itemKey: null, timestamp: new Date() }),
      }).catch(console.error);
    }
  }, [showAISearch, aiSearchQuery, searchResults]);

  // ==================== PROFESSIONAL AI SUMMARY (Multi‑Brand Breakdown) ====================
  const generateSmartSummary = useCallback((query: string, results: SearchResultItem[]): { full: string; truncated: string; hasMore: boolean } => {
    if (!results || results.length === 0) {
      return { full: `No items found for "${query}".`, truncated: `No items found for "${query}".`, hasMore: false };
    }

    const isCostQuery = /how much|cost|price|what is|estimate|total|charge|fee|rate|amount/i.test(query);
    const MAX_ITEMS = 3;

    // ---- Extract meaningful keywords ----
    const stopWords = new Set(['how', 'much', 'cost', 'price', 'what', 'is', 'estimate', 'total', 'charge', 'fee', 'rate', 'amount', 'for', 'the', 'of', 'to', 'and', 'with', 'at', 'from', 'by', 'in', 'on', 'a', 'an']);
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const meaningfulQuery = words.join(' ');
    const queryLower = meaningfulQuery || query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

    // ---- Score items ----
    const scored = results.map(item => {
      const descLower = item.description.toLowerCase();
      let score = 0;
      if (meaningfulQuery && descLower.includes(meaningfulQuery)) {
        score = 3;
      } else if (queryWords.length > 0) {
        let matchCount = 0;
        for (const word of queryWords) {
          if (descLower.includes(word)) matchCount++;
        }
        if (matchCount === queryWords.length) score = 2;
        else if (matchCount > 0) score = 1;
        else score = 0;
      } else {
        if (descLower.includes(query.toLowerCase())) score = 3;
        else score = 0;
      }
      return { item, score };
    });

    // ---- Filter to best matches ----
    let filteredScored = scored.filter(s => s.score >= 2);
    if (filteredScored.length === 0) {
      filteredScored = scored.filter(s => s.score >= 1);
    }
    filteredScored.sort((a, b) => b.score - a.score || a.item.description.length - b.item.description.length);
    const filteredItems = filteredScored.map(s => s.item);

    if (filteredItems.length === 0) {
      return { full: `No closely matching items found for "${query}".`, truncated: `No closely matching items found for "${query}".`, hasMore: false };
    }

    // ---- For cost queries: produce a structured multi‑brand breakdown ----
    if (isCostQuery) {
      const primary = filteredItems[0];
      const desc = primary.description;
      const shortDesc = desc.length > 60 ? desc.substring(0, 60) + '…' : desc;

      const brandMap = new Map<string, { amounts: number[]; submissions: typeof primary.submissions }>();
      primary.submissions.forEach(sub => {
        const brand = getShortBrand(sub.client_name);
        if (!brandMap.has(brand)) {
          brandMap.set(brand, { amounts: [], submissions: [] });
        }
        brandMap.get(brand)!.amounts.push(sub.amount);
        brandMap.get(brand)!.submissions.push(sub);
      });

      const brandStats = Array.from(brandMap.entries()).map(([brand, data]) => {
        const amounts = data.amounts;
        const min = Math.min(...amounts);
        const max = Math.max(...amounts);
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        return { brand, min, max, avg, count: amounts.length };
      });
      brandStats.sort((a, b) => a.avg - b.avg);

      let lines: string[] = [];
      lines.push(`"${shortDesc}" has been quoted by ${brandStats.length} brand${brandStats.length > 1 ? 's' : ''}:`);

      brandStats.forEach((stat, idx) => {
        let line = `  - ${stat.brand}: ${formatCurrency(stat.min)} – ${formatCurrency(stat.max)} (avg ${formatCurrency(stat.avg)}, ${stat.count} quote${stat.count > 1 ? 's' : ''})`;
        if (stat.avg === brandStats[0].avg && brandStats.length > 1) {
          line += ` (Most cost‑effective)`;
        } else if (stat.avg === brandStats[brandStats.length - 1].avg && brandStats.length > 1) {
          line += ` (Most expensive)`;
        }
        lines.push(line);
      });

      if (brandStats.length > 1) {
        const cheapest = brandStats[0];
        const mostExpensive = brandStats[brandStats.length - 1];
        const diffPercent = ((mostExpensive.avg - cheapest.avg) / cheapest.avg * 100);
        lines.push('');
        lines.push(`Insight: ${cheapest.brand} is the most cost‑effective (avg ${formatCurrency(cheapest.avg)}), while ${mostExpensive.brand} is ${Math.round(diffPercent)}% higher.`);
        if (diffPercent > 30) {
          lines.push(`Advice: Significant price variation – we recommend reviewing scope alignment between brands.`);
        } else {
          lines.push(`Pricing is relatively consistent across brands.`);
        }
      } else {
        lines.push('');
        lines.push(`Only one brand has provided pricing – we recommend getting competitive quotes from at least 2 other brands.`);
      }

      const otherItemsCount = filteredItems.length - 1;
      if (otherItemsCount > 0) {
        lines.push('');
        lines.push(`We also found ${otherItemsCount} other related item${otherItemsCount > 1 ? 's' : ''} (e.g., "${filteredItems[1].description.substring(0, 40)}…").`);
      }

      const fullText = lines.join('\n');
      return { full: fullText, truncated: fullText, hasMore: false };
    }

    // ---- Non‑cost queries: list items with counts ----
    const grouped = new Map<string, { brands: Set<string>, count: number }>();
    filteredItems.forEach(item => {
      const desc = item.description;
      if (!grouped.has(desc)) {
        grouped.set(desc, { brands: new Set(), count: 0 });
      }
      const entry = grouped.get(desc)!;
      item.submissions.forEach(sub => {
        entry.brands.add(getShortBrand(sub.client_name));
        entry.count++;
      });
    });

    const partsArray: string[] = [];
    grouped.forEach((value, desc) => {
      const shortDesc = desc.length > 60 ? desc.substring(0, 60) + '…' : desc;
      const brandList = Array.from(value.brands).join(', ');
      partsArray.push(`${shortDesc} (${value.count} quote${value.count > 1 ? 's' : ''} from ${brandList})`);
    });

    const fullText = partsArray.join('\n');
    const truncatedParts = partsArray.slice(0, MAX_ITEMS);
    const truncatedText = truncatedParts.join('\n');
    const hasMore = partsArray.length > MAX_ITEMS;
    return { full: fullText, truncated: truncatedText, hasMore };
  }, []);

  // --- Loading / permission guards ---
  if (status === "loading" || hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a1228]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 dark:text-cyan-300/70">Loading…</p>
        </div>
      </div>
    );
  }
  if (hasAccess === false) return null;

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-50 dark:bg-[#0a1228]">
      <style jsx global>{`
        .sticky-left {
          position: sticky;
          left: 0;
          background-color: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(4px);
          z-index: 10;
        }
        .dark .sticky-left {
          background-color: rgba(10, 18, 40, 0.9);
          backdrop-filter: blur(4px);
        }
        .sticky-header {
          position: sticky;
          top: 0;
          background-color: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
          z-index: 20;
        }
        .dark .sticky-header {
          background-color: rgba(10, 18, 40, 0.95);
          backdrop-filter: blur(8px);
        }
        .highlight-row {
          animation: highlight-flash 1.5s ease;
        }
        @keyframes highlight-flash {
          0% { background-color: rgba(6, 182, 212, 0.3); }
          50% { background-color: rgba(6, 182, 212, 0.6); }
          100% { background-color: transparent; }
        }
        .price-card-pulse {
          animation: price-pulse 1.5s ease-in-out infinite;
        }
        @keyframes price-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
          50% { box-shadow: 0 0 20px 4px rgba(6, 182, 212, 0.3); }
        }
        .modal-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .modal-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .modal-scroll::-webkit-scrollbar-thumb {
          background: rgba(6, 182, 212, 0.5);
          border-radius: 9999px;
        }
        .modal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(6, 182, 212, 0.8);
        }
      `}</style>

      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[35vw] max-w-[540px] max-h-[280px] bg-cyan-500/5 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative z-10 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Cost Comparison</h1>
              <p className="text-gray-500 dark:text-cyan-300/70 text-sm mt-1">Select at least two cost estimates to compare side‑by‑side.</p>
            </div>
            {hasAccess && (
              <button
                onClick={() => setShowAISearch(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white rounded-lg shadow-md shadow-cyan-500/30 transition-all duration-200 text-sm font-medium whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Smart Search
              </button>
            )}
          </div>

          {/* --- Selection Panel --- */}
          <div className="bg-white dark:bg-[#0a1228]/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-5 mb-6 shadow-sm dark:shadow-xl">
            <h2 className="text-md font-semibold text-gray-800 dark:text-cyan-300 mb-4">Select Cost Estimates</h2>
            <div className="mb-5">
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-white/40">🔍</span>
                <input
                  type="text"
                  placeholder="Search by brand, job site, work type, or BQ name..."
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:focus:ring-cyan-400"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-white/50 mb-1">Brand</label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:focus:ring-cyan-400 px-3 py-2 text-sm"
                >
                  <option value="">All Brands</option>
                  {brandOptions.map((brand) => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-white/50 mb-1">Job Site</label>
                <select
                  value={selectedJobSite}
                  onChange={(e) => setSelectedJobSite(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:focus:ring-cyan-400 px-3 py-2 text-sm"
                >
                  <option value="">All Job Sites</option>
                  {jobSiteOptions.map((site) => (
                    <option key={site} value={site}>{site}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-white/50 mb-1">Work Type</label>
                <select
                  value={selectedWorkType}
                  onChange={(e) => setSelectedWorkType(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:focus:ring-cyan-400 px-3 py-2 text-sm"
                >
                  <option value="">All Work Types</option>
                  {workTypeOptions.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
            {(globalSearch || selectedBrand || selectedJobSite || selectedWorkType) && (
              <div className="flex justify-end mb-4">
                <button onClick={clearFilters} className="text-xs text-cyan-700 dark:text-cyan-300 hover:text-cyan-800 dark:hover:text-cyan-200">
                  Clear all filters
                </button>
              </div>
            )}

            {/* ============= PROFESSIONAL DISCLAIMERS ============= */}
            {fetchAvailableError && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-red-800 dark:text-red-200 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-medium">Unable to load cost estimates</p>
                    <p className="text-red-700 dark:text-red-300/80 mt-1">
                      We couldn’t retrieve your cost estimates. Please refresh the page or try again later.
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-2">
                      If the problem persists, contact your system administrator.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="inline-block mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      ↻ Refresh Page
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!loadingAvailable && !fetchAvailableError && availableBQs.length === 0 && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl text-blue-800 dark:text-blue-200 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="font-medium">No cost estimates available</p>
                    <p className="text-blue-700 dark:text-blue-300/80 mt-1">
                      You haven’t created any estimates yet. Create your first estimate to start comparing prices across brands.
                    </p>
                    <Link
                      href="/bq/new"
                      className="inline-block mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      + Create New Estimate
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {loadingAvailable && (
              <div className="mb-4 p-3 text-center text-gray-500 dark:text-white/50">
                <div className="w-5 h-5 border-2 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin inline-block mr-2" />
                Loading your cost estimates...
              </div>
            )}

            {selectedIds.length > 0 && (
              <div className="mb-4 p-3 bg-gray-100 dark:bg-white/5 rounded-xl">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-medium text-gray-700 dark:text-cyan-300 mr-1">Selected ({selectedIds.length}):</span>
                  {selectedIds.map((id) => {
                    const bq = availableBQs.find((b) => b.submission_id === id);
                    if (!bq) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 text-xs rounded-full border border-cyan-300 dark:border-cyan-500/40">
                        {bq.client_name.split(" ").slice(0, 2).join(" ")}
                        <button onClick={() => toggleSelection(id)} className="ml-1 text-cyan-600 dark:text-cyan-300 hover:text-cyan-800 dark:hover:text-white">&times;</button>
                      </span>
                    );
                  })}
                  <button onClick={clearSelected} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 ml-2">Clear all</button>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 dark:text-white/40">Available estimates ({filteredBQs.length})</span>
              <button onClick={selectAllFiltered} className="text-xs text-cyan-700 dark:text-cyan-300 hover:text-cyan-800 dark:hover:text-cyan-200">
                Select all filtered
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20">
              {filteredBQs.length === 0 && !loadingAvailable && !fetchAvailableError ? (
                <p className="text-gray-500 dark:text-white/50 text-sm p-4 text-center">No estimates match filters.</p>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-white/5">
                  {filteredBQs.map((bq) => {
                    const brandColor = getBrandColor(bq.client_name);
                    const isSelected = selectedIds.includes(bq.submission_id);
                    return (
                      <label key={bq.submission_id} className={`flex items-center gap-3 p-3 cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-white/5 ${isSelected ? "bg-cyan-50 dark:bg-cyan-500/10" : ""}`} style={{ borderLeftColor: brandColor.borderColor, borderLeftWidth: "4px" }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(bq.submission_id)} className="rounded border-gray-300 dark:border-white/30 text-cyan-600 dark:text-cyan-500 focus:ring-cyan-500" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{bq.bq_name || `Estimate #${bq.submission_id}`}</div>
                          <div className="text-xs text-gray-500 dark:text-white/50 truncate">{bq.client_name} – {bq.job_site}</div>
                          <div className="text-xs text-gray-400 dark:text-white/30">{bq.version_name || `Round ${bq.round_no}`}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {warningMessage && (
            <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-500/20 border border-yellow-300 dark:border-yellow-500/50 rounded-xl text-yellow-800 dark:text-yellow-200 text-sm">
              {warningMessage}
            </div>
          )}

          {loading && selectedIds.length >= 2 && (
            <div className="bg-white dark:bg-[#0a1228]/80 rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-8 text-center">
              <div className="w-10 h-10 border-4 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 dark:text-white/50">Loading comparison data…</p>
            </div>
          )}

          {error && (
            <div className="bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/50 rounded-xl p-4 text-red-700 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {!loading && selectedIds.length < 2 && (
            <div className="bg-white dark:bg-[#0a1228]/80 rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-8 text-center text-gray-500 dark:text-white/50">
              Select at least two cost estimates from the list above to see the comparison.
            </div>
          )}

          {!loading && comparisonData && comparisonData.submissions.length > 0 && (
            <>
              {/* Controls */}
              <div className="bg-white dark:bg-[#0a1228]/80 rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-cyan-300 whitespace-nowrap">Search items:</label>
                    <div className="w-full sm:max-w-md">
                      <input
                        type="text"
                        placeholder="Item No., description, or brand..."
                        value={itemSearchTerm}
                        onChange={(e) => setItemSearchTerm(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:focus:ring-cyan-400 px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-medium text-gray-700 dark:text-cyan-300">Highlight:</span>
                    <label className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-white/80">
                      <input type="radio" name="highlightMetric" value="unit_price" checked={highlightMetric === "unit_price"} onChange={() => setHighlightMetric("unit_price")} className="text-cyan-600 dark:text-cyan-400" />
                      Unit Price
                    </label>
                    <label className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-white/80">
                      <input type="radio" name="highlightMetric" value="amount" checked={highlightMetric === "amount"} onChange={() => setHighlightMetric("amount")} className="text-cyan-600 dark:text-cyan-400" />
                      Amount
                    </label>
                    <div className="border-l border-gray-300 dark:border-white/20 pl-4">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-white/80 cursor-pointer">
                        <input type="checkbox" checked={maskContractors} onChange={(e) => setMaskContractors(e.target.checked)} className="text-cyan-600 dark:text-cyan-400" />
                        Mask Contractors
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submission summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {comparisonData.submissions.map((sub) => {
                  const brandColor = getBrandColor(sub.client_name);
                  const displayContractor = getDisplayContractor(sub.contractor_name);
                  return (
                    <div key={sub.submission_id} className="bg-white dark:bg-[#0a1228]/80 rounded-xl border border-gray-200 dark:border-white/20 p-4 transition-all hover:border-cyan-600 dark:hover:border-cyan-500/50 shadow-sm" style={{ borderLeftColor: brandColor.borderColor, borderLeftWidth: "4px" }}>
                      <div className="font-semibold text-gray-900 dark:text-white">{sub.client_name}</div>
                      <div className="text-xs text-gray-500 dark:text-white/50 mt-1">Version: {sub.version_name || `Round ${sub.round_no}`}</div>
                      <div className="text-xs text-gray-500 dark:text-white/50">Project: {sub.tender_name}</div>
                      <div className="text-xs text-gray-500 dark:text-white/50">Contractor: {displayContractor}</div>
                      <div className="text-xs text-gray-500 dark:text-white/50">Status: {sub.status}</div>
                    </div>
                  );
                })}
              </div>

              {/* Comparison table */}
              {filteredData && filteredData.categories.length === 0 ? (
                <div className="bg-white dark:bg-[#0a1228]/80 rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-8 text-center text-gray-500 dark:text-white/50">
                  No items match your search term "{itemSearchTerm}".
                </div>
              ) : (
                <div className="bg-white dark:bg-[#0a1228]/80 rounded-2xl border border-gray-200 dark:border-cyan-500/30 overflow-hidden shadow-sm dark:shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
                      <thead className="sticky-header">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider sticky-left z-20">Item No.</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Brand</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Unit</th>
                          {comparisonData.submissions.map((sub) => {
                            const displayContractor = getDisplayContractor(sub.contractor_name);
                            return (
                              <th key={sub.submission_id} colSpan={3} className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider min-w-[180px]">
                                {sub.client_name}
                                <br />
                                <span className="text-xs font-normal text-gray-500 dark:text-white/50">{sub.version_name || `Round ${sub.round_no}`}</span>
                                <br />
                                <span className="text-xs font-normal text-gray-400 dark:text-white/30">{displayContractor}</span>
                              </th>
                            );
                          })}
                        </tr>
                        <tr className="bg-gray-50 dark:bg-white/5">
                          <th className="px-4 py-2 sticky-left"></th>
                          <th className="px-4 py-2"></th>
                          <th className="px-4 py-2"></th>
                          <th className="px-4 py-2"></th>
                          {comparisonData.submissions.map((sub) => (
                            <React.Fragment key={sub.submission_id}>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 dark:text-white/50">Quantity</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 dark:text-white/50">Unit Price</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 dark:text-white/50">Amount</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                        {filteredData?.categories.map((cat) => (
                          <React.Fragment key={cat.category_name}>
                            <tr className="bg-gray-100 dark:bg-white/10">
                              <td colSpan={4 + comparisonData.submissions.length * 3} className="px-4 py-2 font-bold text-gray-900 dark:text-white">{cat.category_name}</td>
                            </tr>
                            {cat.sections.map((section) => {
                              const getMinMax = (item: ComparisonItem, field: "unit_price" | "amount") => {
                                const values = comparisonData.submissions.map((sub) => {
                                  const data = item.items[sub.submission_id];
                                  return data ? data[field] : 0;
                                }).filter((v) => v > 0);
                                if (values.length === 0) return { min: 0, max: 0, hasData: false };
                                return { min: Math.min(...values), max: Math.max(...values), hasData: true };
                              };

                              if (section.section_name === "General") {
                                return section.items.map((item, idx) => {
                                  const unitPriceMM = getMinMax(item, "unit_price");
                                  const amountMM = getMinMax(item, "amount");
                                  const uniqueKey = `${cat.category_name.replace(/\s/g, '_')}_${item.item_number}`;
                                  return (
                                    <tr key={idx} data-item-key={uniqueKey} className={`hover:bg-gray-50 dark:hover:bg-white/5 transition-colors even:bg-gray-50 dark:even:bg-white/5 ${highlightedItemKey === uniqueKey ? "highlight-row" : ""}`}>
                                      <td className="px-4 py-2 text-center font-mono text-gray-600 dark:text-white/70 sticky-left pl-8">{item.item_number}</td>
                                      <td className="px-4 py-2 font-medium text-gray-800 dark:text-white">{item.description}</td>
                                      <td className="px-4 py-2 text-gray-600 dark:text-white/70">{item.brand || "—"}</td>
                                      <td className="px-4 py-2 text-gray-600 dark:text-white/70">{item.unit}</td>
                                      {comparisonData.submissions.map((sub) => {
                                        const data = item.items[sub.submission_id];
                                        const quantity = data ? data.quantity : 0;
                                        const unitPrice = data ? data.unit_price : 0;
                                        const amount = data ? data.amount : 0;
                                        const unitPriceClass =
                                          highlightMetric === "unit_price"
                                            ? getHighlightClass(unitPrice, unitPriceMM.min, unitPriceMM.max, unitPriceMM.hasData)
                                            : "text-gray-700 dark:text-white/70";
                                        const amountClass =
                                          highlightMetric === "amount"
                                            ? getHighlightClass(amount, amountMM.min, amountMM.max, amountMM.hasData)
                                            : "text-gray-700 dark:text-white/70";
                                        return (
                                          <React.Fragment key={sub.submission_id}>
                                            <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-white/80">{quantity === 0 ? "—" : formatQuantity(quantity)}</td>
                                            <td className={`px-4 py-2 text-right font-mono ${unitPriceClass}`}>{unitPrice === 0 ? "—" : formatCurrency(unitPrice)}</td>
                                            <td className={`px-4 py-2 text-right font-mono ${amountClass}`}>{amount === 0 ? "—" : formatCurrency(amount)}</td>
                                          </React.Fragment>
                                        );
                                      })}
                                    </tr>
                                  );
                                });
                              }
                              return (
                                <React.Fragment key={section.section_name}>
                                  <tr className="bg-gray-50 dark:bg-white/5">
                                    <td colSpan={4 + comparisonData.submissions.length * 3} className="px-4 py-2 pl-6 font-semibold text-cyan-700 dark:text-cyan-300">{section.section_name}</td>
                                  </tr>
                                  {section.items.map((item, idx) => {
                                    const unitPriceMM = getMinMax(item, "unit_price");
                                    const amountMM = getMinMax(item, "amount");
                                    const uniqueKey = `${cat.category_name.replace(/\s/g, '_')}_${item.item_number}`;
                                    return (
                                      <tr key={idx} data-item-key={uniqueKey} className={`hover:bg-gray-50 dark:hover:bg-white/5 transition-colors even:bg-gray-50 dark:even:bg-white/5 ${highlightedItemKey === uniqueKey ? "highlight-row" : ""}`}>
                                        <td className="px-4 py-2 text-center font-mono text-gray-600 dark:text-white/70 sticky-left pl-8">{item.item_number}</td>
                                        <td className="px-4 py-2 font-medium text-gray-800 dark:text-white">{item.description}</td>
                                        <td className="px-4 py-2 text-gray-600 dark:text-white/70">{item.brand || "—"}</td>
                                        <td className="px-4 py-2 text-gray-600 dark:text-white/70">{item.unit}</td>
                                        {comparisonData.submissions.map((sub) => {
                                          const data = item.items[sub.submission_id];
                                          const quantity = data ? data.quantity : 0;
                                          const unitPrice = data ? data.unit_price : 0;
                                          const amount = data ? data.amount : 0;
                                          const unitPriceClass =
                                            highlightMetric === "unit_price"
                                              ? getHighlightClass(unitPrice, unitPriceMM.min, unitPriceMM.max, unitPriceMM.hasData)
                                              : "text-gray-700 dark:text-white/70";
                                          const amountClass =
                                            highlightMetric === "amount"
                                              ? getHighlightClass(amount, amountMM.min, amountMM.max, amountMM.hasData)
                                              : "text-gray-700 dark:text-white/70";
                                          return (
                                            <React.Fragment key={sub.submission_id}>
                                              <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-white/80">{quantity === 0 ? "—" : formatQuantity(quantity)}</td>
                                              <td className={`px-4 py-2 text-right font-mono ${unitPriceClass}`}>{unitPrice === 0 ? "—" : formatCurrency(unitPrice)}</td>
                                              <td className={`px-4 py-2 text-right font-mono ${amountClass}`}>{amount === 0 ? "—" : formatCurrency(amount)}</td>
                                            </React.Fragment>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-center gap-6 text-xs text-gray-600 dark:text-white/70 flex-wrap">
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-emerald-200 dark:bg-emerald-500/30 border border-emerald-600 dark:border-emerald-400 rounded"></span> Lowest (Best)</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-amber-200 dark:bg-amber-500/30 border border-amber-600 dark:border-amber-400 rounded"></span> Middle</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-red-200 dark:bg-red-500/30 border border-red-600 dark:border-red-400 rounded"></span> Highest (Costly)</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-gray-200 dark:bg-gray-700/50 border border-gray-400 dark:border-gray-500 rounded"></span> Zero / Missing</span>
                <span className="text-gray-500 dark:text-white/50 text-xs">(Only the selected metric is highlighted)</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- AI SEARCH MODAL ---- */}
      {showAISearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity">
          <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl p-[2px] bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 shadow-2xl shadow-cyan-500/30">
            <div className="flex flex-col h-full w-full bg-white dark:bg-[#0a1228] rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-full border border-cyan-400/30">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-xs font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">AI</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Search Estimates</h3>
                </div>
                <button onClick={() => { setShowAISearch(false); setAiSearchQuery(""); setSearchResults([]); setShowDetailedResults(false); setShowFullSummary(false); }} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0">
                  <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search input */}
              <div className="p-4 border-b border-gray-200 dark:border-white/10 shrink-0">
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search for any item across all your estimates..."
                    value={aiSearchQuery}
                    onChange={(e) => setAiSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-white/10 border-2 border-cyan-400/40 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all duration-200 shadow-inner"
                    autoFocus
                  />
                  {isSearching && (
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></span>
                  Searching across all your submitted estimates.
                </p>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-4 min-h-[200px] modal-scroll">
                {!aiSearchQuery.trim() ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
                    <svg className="w-16 h-16 mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-sm font-medium">Type a keyword to search all estimates</p>
                    <p className="text-xs text-gray-400">e.g., "screeding", "led downlight", "reception counter"</p>
                  </div>
                ) : searchError ? (
                  <div className="text-center text-red-500 py-8">
                    <p>Error: {searchError}</p>
                  </div>
                ) : isSearching ? (
                  <div className="flex justify-center py-8">
                    <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
                    <p className="text-sm">No matches found for "{aiSearchQuery}"</p>
                    <p className="text-xs text-gray-400">Try a different keyword</p>
                  </div>
                ) : (
                  <>
                    {/* SMART SUMMARY - Multi‑brand breakdown (no emojis) */}
                    {(() => {
                      const summary = generateSmartSummary(aiSearchQuery, searchResults);
                      const displayText = showFullSummary ? summary.full : summary.truncated;
                      return (
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-500/10 dark:to-cyan-500/10 rounded-xl border border-blue-200 dark:border-blue-500/30 shadow-sm">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-blue-500 dark:text-blue-400">⚡</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">AI Insight</p>
                              <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                                {displayText}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {summary.hasMore && (
                              <button
                                onClick={() => setShowFullSummary(!showFullSummary)}
                                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline focus:outline-none"
                              >
                                {showFullSummary ? 'Show less' : `Show all (${summary.full.split('\n').length} items)`}
                              </button>
                            )}
                            <button
                              onClick={() => setShowDetailedResults(!showDetailedResults)}
                              className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline focus:outline-none"
                            >
                              {showDetailedResults ? 'Hide detailed breakdown' : 'Show detailed breakdown'}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* DETAILED TABLES */}
                    {showDetailedResults && (
                      <ul className="space-y-4">
                        {searchResults.map((result, idx) => {
                          const keywords = aiSearchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
                          const highlightedDesc = highlightMatches(result.description, keywords);
                          const highlightedBrand = result.brand ? highlightMatches(result.brand, keywords) : null;

                          return (
                            <li key={idx} className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-200 dark:border-white/10 shadow-sm hover:shadow-md transition-shadow">
                              <div className="mb-3">
                                <p
                                  className="text-base font-semibold text-gray-900 dark:text-white"
                                  dangerouslySetInnerHTML={{ __html: highlightedDesc }}
                                />
                                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{result.category_name}</span>
                                  {result.brand && (
                                    <span dangerouslySetInnerHTML={{ __html: `Brand: ${highlightedBrand || result.brand}` }} />
                                  )}
                                  <span>Unit: {result.unit}</span>
                                  <span className="text-xs text-gray-500">{result.submissions.length} BQ(s)</span>
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Brand</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contractor</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Version</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Qty</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit Price</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                    {result.submissions.map((sub) => (
                                      <tr key={sub.submission_id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">{sub.client_name}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{sub.contractor_name}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{sub.version}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600 dark:text-gray-400">{formatQuantity(sub.quantity)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600 dark:text-gray-400">{formatCurrency(sub.unit_price)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(sub.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}