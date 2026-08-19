"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import React from "react";
import Link from "next/link";
import { getBrandColor } from "@/lib/brandColors";
import "./bq-compare.css";
import { highlightMatches } from "@/lib/search-utils";
import { useNotify } from "@/components/ui/notification-provider";
import { isSuperUser, ROLE_IDS } from "@/lib/roles";
import BqNotesPanel from "@/components/bq/BqNotesPanel";
import FinanceSummaryPanel from "@/components/bq/FinanceSummaryPanel";

// ==================== INTERFACES ====================
interface Submission {
  submission_id: number;
  version_name: string;
  round_no: number;
  client_name: string;
  job_site: string;
  tender_id?: number;
  tender_name: string;
  status: string;
  bq_name?: string;
  work_type?: string;
  contractor_id?: number;
  contractor_name?: string;
  contractor_email?: string;
  contractor_phone?: string | null;
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

interface BrandStat {
  brand: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

interface RelatedItemStat {
  description: string;
  min: number;
  max: number;
  count: number;
  brands: string[];
}

type SmartInsight =
  | { kind: "empty"; message: string }
  | { kind: "results"; itemLabel: string; brandStats: BrandStat[]; spreadPct: number; otherItems: RelatedItemStat[] };

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
  if (value === 0) return "bg-gray-100 text-gray-500";
  if (!hasData || min === max) return "text-gray-700";
  if (value === min) return "bg-emerald-100 text-emerald-800 font-semibold";
  if (value === max) return "bg-red-100 text-red-800 font-semibold";
  return "bg-amber-100 text-amber-800 font-medium";
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

// Reverse of brandShortNameMap, title-cased for display — client_name from
// the API is already the short brand ("New York"), but the comparison table
// and submission cards read more professionally with the full company name.
// Falls back to the input unchanged for a client_name_override or any brand
// not in the known list, so it never hides real data.
const toTitleCase = (str: string): string =>
  str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const brandFullNameMap: Record<string, string> = Object.fromEntries(
  Object.entries(brandShortNameMap).map(([full, short]) => [short, toTitleCase(full)])
);

const getFullBrand = (shortOrOverride: string): string => {
  return brandFullNameMap[shortOrOverride] || shortOrOverride;
};

const formatVersion = (sub: { version_name?: string; round_no: number }): string => {
  return sub.version_name || `V${sub.round_no}`;
};

// ==================== MAIN COMPONENT ====================
export default function CompareBQPage() {
  const { data: session, status } = useSession();
  const toast = useNotify();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canRequestResubmission =
    isSuperUser((session?.user as any)?.roleIds || []) ||
    ((session?.user as any)?.roleIds || []).includes(ROLE_IDS.PROJECT_MANAGER) ||
    ((session?.user as any)?.roleIds || []).includes(ROLE_IDS.SENIOR_PROJECT_MANAGER);
  // Separate from canRequestResubmission above — the backend's finance-summary
  // gate (canGenerateFinanceSummary, src/lib/permissions.ts) also allows
  // Finance Manager/GM/Team, who don't get PM/Senior PM's resubmission rights.
  // Previously this button reused canRequestResubmission, so Finance-role
  // users could call the API successfully but had no button to trigger it.
  const [canGenerateFinanceSummary, setCanGenerateFinanceSummary] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<Submission | null>(null);
  const [resubmitInstructions, setResubmitInstructions] = useState("");
  const [resubmitDueBy, setResubmitDueBy] = useState("");
  const [submittingResubmit, setSubmittingResubmit] = useState(false);
  const [resubmissionByContractor, setResubmissionByContractor] = useState<Record<number, { fulfilled: boolean }>>({});
  const [notesTarget, setNotesTarget] = useState<Submission | null>(null);
  const [financeTarget, setFinanceTarget] = useState<Submission | null>(null);
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

  const closeAISearch = useCallback(() => {
    setShowAISearch(false);
    setAiSearchQuery("");
    setSearchResults([]);
    setShowDetailedResults(false);
    setShowFullSummary(false);
  }, []);

  useEffect(() => {
    if (!showAISearch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAISearch();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAISearch, closeAISearch]);

  // Escape-to-close for the three hand-built portal modals below (Finance
  // Summary, Notes, Request Resubmission) — the shared base-ui Dialog used
  // to provide this for free, but was dropped for all three in favor of the
  // plain-portal pattern already used elsewhere (confirm-dialog.tsx,
  // dashboard's Customize Dashboard modal, this page's own AI Search modal)
  // to avoid the "crosshair" moire compositing artifact over this page's
  // busy sticky/blurred comparison table.
  useEffect(() => {
    if (!financeTarget && !notesTarget && !resubmitTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (financeTarget) setFinanceTarget(null);
      else if (notesTarget) setNotesTarget(null);
      else if (resubmitTarget) setResubmitTarget(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [financeTarget, notesTarget, resubmitTarget]);

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
        setCanGenerateFinanceSummary(
          isSuperUser((session?.user as any)?.roleIds || []) ||
          data.permissions.includes("generate_finance_summary")
        );
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

  // --- Resubmission-request status per contractor (badge on each card) ---
  useEffect(() => {
    if (!canRequestResubmission || !comparisonData?.submissions.length) {
      setResubmissionByContractor({});
      return;
    }
    const tenderId = comparisonData.submissions[0]?.tender_id;
    if (!tenderId) return;
    fetch(`/api/tenders/${tenderId}/resubmission-requests`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: { contractor_id: number; fulfilled: boolean }[]) => {
        const map: Record<number, { fulfilled: boolean }> = {};
        rows.forEach((r) => { map[r.contractor_id] = { fulfilled: r.fulfilled }; });
        setResubmissionByContractor(map);
      })
      .catch(() => setResubmissionByContractor({}));
  }, [comparisonData, canRequestResubmission]);

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

  // Opening the resubmission modal always shows the real identity/contact
  // info, regardless of the Mask Contractors toggle — staff need it to
  // actually negotiate (by phone, on top of email) with this contractor.
  const openResubmitModal = (sub: Submission) => {
    setResubmitInstructions("");
    setResubmitDueBy("");
    setResubmitTarget(sub);
  };

  const handleRequestResubmission = async () => {
    if (!resubmitTarget?.tender_id) return;
    setSubmittingResubmit(true);
    try {
      const res = await fetch(`/api/tenders/${resubmitTarget.tender_id}/resubmission-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: resubmitTarget.submission_id,
          instructions: resubmitInstructions.trim() || undefined,
          due_by: resubmitDueBy ? new Date(resubmitDueBy).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to request resubmission");
      toast.success(`Resubmission requested from ${resubmitTarget.contractor_name}.`);
      setResubmitTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to request resubmission. Please try again.");
    } finally {
      setSubmittingResubmit(false);
    }
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

  // ==================== SMART INSIGHT (Multi‑Brand Breakdown) ====================
  // Returns structured data instead of a preformatted text blob, so the
  // modal can render it as a real comparison card (ranked brand rows with
  // proportional bars, badges) rather than a monospace-feeling wall of text.
  const generateSmartInsight = useCallback((query: string, results: SearchResultItem[]): SmartInsight => {
    if (!results || results.length === 0) {
      return { kind: "empty", message: `No items found for "${query}".` };
    }

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
      return { kind: "empty", message: `No closely matching items found for "${query}".` };
    }

    // Always produce a priced breakdown, regardless of how the question was
    // phrased — a plain item description ("WPC fluted wall paneling") is
    // just as much a pricing question as "how much is...", and the previous
    // isCostQuery regex gate meant unmatched phrasings silently got a
    // price-free summary instead.
    const primary = filteredItems[0];

    const brandMap = new Map<string, { amounts: number[] }>();
    primary.submissions.forEach(sub => {
      const brand = getShortBrand(sub.client_name);
      if (!brandMap.has(brand)) brandMap.set(brand, { amounts: [] });
      brandMap.get(brand)!.amounts.push(sub.amount);
    });

    const brandStats: BrandStat[] = Array.from(brandMap.entries()).map(([brand, data]) => {
      const amounts = data.amounts;
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      return { brand, min, max, avg, count: amounts.length };
    });
    brandStats.sort((a, b) => a.avg - b.avg);

    const cheapest = brandStats[0];
    const mostExpensive = brandStats[brandStats.length - 1];
    const spreadPct = brandStats.length > 1 ? ((mostExpensive.avg - cheapest.avg) / cheapest.avg) * 100 : 0;

    // Other matched items get their own price-range summary (across all
    // brands combined, not per-brand) so "show more" reveals what they
    // actually cost instead of just a bare description string.
    const otherItems: RelatedItemStat[] = filteredItems.slice(1).map(it => {
      const amounts = it.submissions.map(s => s.amount).filter(a => a > 0);
      return {
        description: it.description,
        min: amounts.length ? Math.min(...amounts) : 0,
        max: amounts.length ? Math.max(...amounts) : 0,
        count: it.submissions.length,
        brands: Array.from(new Set(it.submissions.map(s => getShortBrand(s.client_name)))),
      };
    });

    return {
      kind: "results",
      itemLabel: primary.description,
      brandStats,
      spreadPct,
      otherItems,
    };
  }, []);

  // --- Loading / permission guards ---
  if (status === "loading" || hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }
  if (hasAccess === false) return null;

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-white">

      <div className="py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl font-bold text-gray-900 tracking-tight">Cost Comparison</h1>
              <p className="text-gray-500 text-sm mt-1">Select at least two cost estimates to compare side‑by‑side.</p>
            </div>
            {hasAccess && (
              <div className="relative inline-block z-0">
                <span className="absolute -top-2.5 -right-2 z-20 pointer-events-none rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600 whitespace-nowrap shadow-sm">
                  Beta
                </span>
                <button
                  onClick={() => setShowAISearch(true)}
                  className="relative z-0 flex items-center gap-2 px-4 py-2 bg-[#15406a] hover:bg-[#0d2d4a] text-white rounded-md shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md text-sm font-semibold whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Smart Search
                </button>
              </div>
            )}
          </div>

          {/* --- Selection Panel --- */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
            <h2 className="text-md font-semibold text-gray-800 mb-4">Select Cost Estimates</h2>
            <div className="mb-5">
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search by brand, job site, work type, or BQ name..."
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#15406a]"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Brand</label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#15406a] px-3 py-2 text-sm"
                >
                  <option value="">All Brands</option>
                  {brandOptions.map((brand) => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Job Site</label>
                <select
                  value={selectedJobSite}
                  onChange={(e) => setSelectedJobSite(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#15406a] px-3 py-2 text-sm"
                >
                  <option value="">All Job Sites</option>
                  {jobSiteOptions.map((site) => (
                    <option key={site} value={site}>{site}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Work Type</label>
                <select
                  value={selectedWorkType}
                  onChange={(e) => setSelectedWorkType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#15406a] px-3 py-2 text-sm"
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
                <button onClick={clearFilters} className="text-xs text-[#15406a] hover:text-[#0d2d4a]">
                  Clear all filters
                </button>
              </div>
            )}

            {/* ============= PROFESSIONAL DISCLAIMERS ============= */}
            {fetchAvailableError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-medium">Unable to load cost estimates</p>
                    <p className="text-red-700 mt-1">
                      We couldn’t retrieve your cost estimates. Please refresh the page or try again later.
                    </p>
                    <p className="text-xs text-red-600/70 mt-2">
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
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="font-medium">No cost estimates available</p>
                    <p className="text-blue-700 mt-1">
                      You haven’t created any estimates yet. Create your first estimate to start comparing prices across brands.
                    </p>
                    <Link
                      href="/bq/new"
                      className="inline-block mt-3 px-4 py-2 bg-[#15406a] hover:bg-[#0d2d4a] text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      + Create New Estimate
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {loadingAvailable && (
              <div className="mb-4 p-3 text-center text-gray-500">
                <div className="w-5 h-5 border-2 border-[#15406a] border-t-transparent rounded-full animate-spin inline-block mr-2" />
                Loading your cost estimates...
              </div>
            )}

            {selectedIds.length > 0 && (
              <div className="mb-4 p-3 bg-gray-100 rounded-xl">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-medium text-gray-700 mr-1">Selected ({selectedIds.length}):</span>
                  {selectedIds.map((id) => {
                    const bq = availableBQs.find((b) => b.submission_id === id);
                    if (!bq) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-[#15406a]/10 text-[#15406a] text-xs rounded-full border border-[#15406a]/30">
                        {bq.client_name.split(" ").slice(0, 2).join(" ")}
                        <button onClick={() => toggleSelection(id)} className="ml-1 text-[#15406a] hover:text-[#0d2d4a]">&times;</button>
                      </span>
                    );
                  })}
                  <button onClick={clearSelected} className="text-xs text-red-600 hover:text-red-700 ml-2">Clear all</button>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500">Available estimates ({filteredBQs.length})</span>
              <button onClick={selectAllFiltered} className="text-xs text-[#15406a] hover:text-[#0d2d4a]">
                Select all filtered
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50">
              {filteredBQs.length === 0 && !loadingAvailable && !fetchAvailableError ? (
                <p className="text-gray-500 text-sm p-4 text-center">No estimates match filters.</p>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredBQs.map((bq) => {
                    const brandColor = getBrandColor(bq.client_name);
                    const isSelected = selectedIds.includes(bq.submission_id);
                    return (
                      <label key={bq.submission_id} className={`flex items-center gap-3 p-3 cursor-pointer transition-all hover:bg-gray-100 ${isSelected ? "bg-[#15406a]/5" : ""}`} style={{ borderLeftColor: brandColor.borderColor, borderLeftWidth: "4px" }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(bq.submission_id)} className="rounded border-gray-300 text-[#15406a] focus:ring-[#15406a]" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{bq.bq_name || `Estimate #${bq.submission_id}`}</div>
                          <div className="text-xs text-gray-500 truncate">{getFullBrand(bq.client_name)} – {bq.job_site}</div>
                          <div className="text-xs text-gray-400">{formatVersion(bq)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {warningMessage && (
            <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded-xl text-yellow-800 text-sm">
              {warningMessage}
            </div>
          )}

          {loading && selectedIds.length >= 2 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500">Loading comparison data…</p>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {!loading && selectedIds.length < 2 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
              Select at least two cost estimates from the list above to see the comparison.
            </div>
          )}

          {!loading && comparisonData && comparisonData.submissions.length > 0 && (
            <>
              {/* Controls */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Search items:</label>
                    <div className="w-full sm:max-w-md">
                      <input
                        type="text"
                        placeholder="Item No., description, or brand..."
                        value={itemSearchTerm}
                        onChange={(e) => setItemSearchTerm(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#15406a] px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-medium text-gray-700">Highlight:</span>
                    <label className="inline-flex items-center gap-1 text-sm text-gray-700">
                      <input type="radio" name="highlightMetric" value="unit_price" checked={highlightMetric === "unit_price"} onChange={() => setHighlightMetric("unit_price")} className="text-[#15406a]" />
                      Unit Price
                    </label>
                    <label className="inline-flex items-center gap-1 text-sm text-gray-700">
                      <input type="radio" name="highlightMetric" value="amount" checked={highlightMetric === "amount"} onChange={() => setHighlightMetric("amount")} className="text-[#15406a]" />
                      Amount
                    </label>
                    <div className="border-l border-gray-300 pl-4">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={maskContractors} onChange={(e) => setMaskContractors(e.target.checked)} className="text-[#15406a]" />
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
                    <div key={sub.submission_id} className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:border-[#15406a] shadow-sm" style={{ borderLeftColor: brandColor.borderColor, borderLeftWidth: "4px" }}>
                      <div className="font-semibold text-gray-900">{getFullBrand(sub.client_name)}</div>
                      <div className="text-xs text-gray-500 mt-1">Version: {formatVersion(sub)}</div>
                      <div className="text-xs text-gray-500">Project: {sub.tender_name}</div>
                      <div className="text-xs text-gray-500">Contractor: {displayContractor}</div>
                      <div className="text-xs text-gray-500">Status: {sub.status}</div>
                      {canRequestResubmission && sub.contractor_id && resubmissionByContractor[sub.contractor_id] && (
                        <div className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${
                          resubmissionByContractor[sub.contractor_id].fulfilled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {resubmissionByContractor[sub.contractor_id].fulfilled ? "Resubmitted" : "Resubmission requested"}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        {canRequestResubmission && sub.tender_id && (
                          <button
                            onClick={() => openResubmitModal(sub)}
                            className="flex-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                          >
                            Request Resubmission
                          </button>
                        )}
                        <button
                          onClick={() => setNotesTarget(sub)}
                          className="flex-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                        >
                          Notes
                        </button>
                        {canGenerateFinanceSummary && (
                          <button
                            onClick={() => setFinanceTarget(sub)}
                            className="flex-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#15406a] text-[#15406a] bg-white hover:bg-[#15406a] hover:text-white transition-colors"
                          >
                            Finance Summary
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Finance Summary modal — per-submission cost analysis
                  (finance_budget_summary). Plain hand-built portal, not the
                  shared base-ui Dialog: over this page's busy sticky/blurred
                  comparison table the shared Dialog's ring/backdrop
                  compositing produced visible moire "crosshair" lines behind
                  the popup cards, the same artifact already fixed the same
                  way in confirm-dialog.tsx, dashboard's Customize Dashboard
                  modal, and this page's own AI Search modal above. */}
              {financeTarget &&
                createPortal(
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) setFinanceTarget(null); }}
                  >
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="finance-summary-title"
                      className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-lg border border-gray-200 p-6 modal-scroll"
                    >
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h2 id="finance-summary-title" className="text-lg font-bold text-gray-900">
                          Finance Summary — {financeTarget.contractor_name}
                        </h2>
                        <button onClick={() => setFinanceTarget(null)} aria-label="Close" className="p-1 rounded-lg hover:bg-gray-100 transition-colors shrink-0 text-gray-400 hover:text-gray-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">{financeTarget.tender_name}</p>
                      <FinanceSummaryPanel submissionId={financeTarget.submission_id} />
                    </div>
                  </div>,
                  document.body
                )}

              {/* Notes modal — staff notes on this specific BQ
                  (review_comment). Same hand-built portal pattern as above. */}
              {notesTarget &&
                createPortal(
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) setNotesTarget(null); }}
                  >
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="notes-title"
                      className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-lg border border-gray-200 p-6 modal-scroll"
                    >
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h2 id="notes-title" className="text-lg font-bold text-gray-900">
                          Notes — {notesTarget.contractor_name}
                        </h2>
                        <button onClick={() => setNotesTarget(null)} aria-label="Close" className="p-1 rounded-lg hover:bg-gray-100 transition-colors shrink-0 text-gray-400 hover:text-gray-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">{notesTarget.tender_name}</p>
                      <BqNotesPanel submissionId={notesTarget.submission_id} canAddNotes={canRequestResubmission} />
                    </div>
                  </div>,
                  document.body
                )}

              {/* Request Resubmission modal — always shows real identity/
                  contact info regardless of the Mask Contractors toggle,
                  since staff need it to negotiate by phone as well as email.
                  Same hand-built portal pattern as above. */}
              {resubmitTarget &&
                createPortal(
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
                    onMouseDown={(e) => { if (e.target === e.currentTarget && !submittingResubmit) setResubmitTarget(null); }}
                  >
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="resubmit-title"
                      className="w-full max-w-md rounded-xl bg-white shadow-lg border border-gray-200 p-6"
                    >
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h2 id="resubmit-title" className="text-lg font-bold text-gray-900">Request Resubmission</h2>
                        <button
                          onClick={() => !submittingResubmit && setResubmitTarget(null)}
                          aria-label="Close"
                          className="p-1 rounded-lg hover:bg-gray-100 transition-colors shrink-0 text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        For <strong>{resubmitTarget.tender_name}</strong>
                      </p>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm space-y-0.5">
                        <div><span className="text-gray-500">Contractor:</span> <span className="font-medium text-gray-900">{resubmitTarget.contractor_name}</span></div>
                        {resubmitTarget.contractor_email && (
                          <div><span className="text-gray-500">Email:</span> <span className="font-medium text-gray-900">{resubmitTarget.contractor_email}</span></div>
                        )}
                        {resubmitTarget.contractor_phone && (
                          <div><span className="text-gray-500">Phone:</span> <span className="font-medium text-gray-900">{resubmitTarget.contractor_phone}</span></div>
                        )}
                      </div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Instructions (optional, shared with contractor)</label>
                      <textarea
                        value={resubmitInstructions}
                        onChange={(e) => setResubmitInstructions(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="e.g. Please review section 3 pricing and resubmit with a revised quote."
                      />
                      <label className="block text-xs font-medium text-gray-500 mb-1">Due by (optional)</label>
                      <input
                        type="date"
                        value={resubmitDueBy}
                        onChange={(e) => setResubmitDueBy(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setResubmitTarget(null)}
                          disabled={submittingResubmit}
                          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleRequestResubmission}
                          disabled={submittingResubmit}
                          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition disabled:opacity-50"
                        >
                          {submittingResubmit ? "Sending..." : "Send Request"}
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}

              {/* Comparison table */}
              {filteredData && filteredData.categories.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                  No items match your search term "{itemSearchTerm}".
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed divide-y divide-gray-200 compare-table">
                      <colgroup>
                        <col style={{ width: "64px" }} />
                        <col style={{ width: "340px" }} />
                        <col style={{ width: "130px" }} />
                        <col style={{ width: "80px" }} />
                        {comparisonData.submissions.map((sub) => (
                          <React.Fragment key={sub.submission_id}>
                            <col style={{ width: "85px" }} />
                            <col style={{ width: "105px" }} />
                            <col style={{ width: "115px" }} />
                          </React.Fragment>
                        ))}
                      </colgroup>
                      <thead className="sticky-header">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider sticky-left z-20 border-r border-gray-200">Item No.</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Brand</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Unit</th>
                          {comparisonData.submissions.map((sub, subIdx) => {
                            const displayContractor = getDisplayContractor(sub.contractor_name);
                            return (
                              <th
                                key={sub.submission_id}
                                colSpan={3}
                                className={`px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-normal leading-snug ${subIdx > 0 ? "border-l-2 border-gray-200" : ""}`}
                              >
                                <span className="block normal-case font-bold text-[#15406a]">{getFullBrand(sub.client_name)}</span>
                                <span className="block text-xs font-normal text-gray-500 normal-case">{formatVersion(sub)}</span>
                                <span className="block text-xs font-normal text-gray-400 normal-case truncate">{displayContractor}</span>
                              </th>
                            );
                          })}
                        </tr>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 sticky-left border-r border-gray-200"></th>
                          <th className="px-4 py-2"></th>
                          <th className="px-4 py-2"></th>
                          <th className="px-4 py-2"></th>
                          {comparisonData.submissions.map((sub, subIdx) => (
                            <React.Fragment key={sub.submission_id}>
                              <th className={`px-3 py-2 text-center text-xs font-medium text-gray-600 ${subIdx > 0 ? "border-l-2 border-gray-200" : ""}`}>Qty</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Unit Price</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Amount</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredData?.categories.map((cat) => (
                          <React.Fragment key={cat.category_name}>
                            <tr className="bg-gray-100">
                              <td colSpan={4 + comparisonData.submissions.length * 3} className="px-4 py-2 font-bold text-gray-900">{cat.category_name}</td>
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
                                    <tr key={idx} data-item-key={uniqueKey} className={`hover:bg-gray-50 transition-colors even:bg-gray-50 align-top ${highlightedItemKey === uniqueKey ? "highlight-row" : ""}`}>
                                      <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-600 sticky-left border-r border-gray-200">{item.item_number}</td>
                                      <td className="px-4 py-2.5 text-sm font-medium text-gray-800 whitespace-normal break-words leading-snug">{item.description}</td>
                                      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-normal break-words">{item.brand || "—"}</td>
                                      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-normal">{item.unit}</td>
                                      {comparisonData.submissions.map((sub, subIdx) => {
                                        const data = item.items[sub.submission_id];
                                        const quantity = data ? data.quantity : 0;
                                        const unitPrice = data ? data.unit_price : 0;
                                        const amount = data ? data.amount : 0;
                                        const unitPriceClass =
                                          highlightMetric === "unit_price"
                                            ? getHighlightClass(unitPrice, unitPriceMM.min, unitPriceMM.max, unitPriceMM.hasData)
                                            : "text-gray-700";
                                        const amountClass =
                                          highlightMetric === "amount"
                                            ? getHighlightClass(amount, amountMM.min, amountMM.max, amountMM.hasData)
                                            : "text-gray-700";
                                        return (
                                          <React.Fragment key={sub.submission_id}>
                                            <td className={`px-3 py-2.5 text-right font-mono text-sm text-gray-700 ${subIdx > 0 ? "border-l-2 border-gray-200" : ""}`}>{quantity === 0 ? "—" : formatQuantity(quantity)}</td>
                                            <td className={`px-3 py-2.5 text-right font-mono text-sm ${unitPriceClass}`}>{unitPrice === 0 ? "—" : formatCurrency(unitPrice)}</td>
                                            <td className={`px-3 py-2.5 text-right font-mono text-sm ${amountClass}`}>{amount === 0 ? "—" : formatCurrency(amount)}</td>
                                          </React.Fragment>
                                        );
                                      })}
                                    </tr>
                                  );
                                });
                              }
                              return (
                                <React.Fragment key={section.section_name}>
                                  <tr className="bg-gray-50">
                                    <td colSpan={4 + comparisonData.submissions.length * 3} className="px-4 py-2 pl-6 font-semibold text-[#15406a]">{section.section_name}</td>
                                  </tr>
                                  {section.items.map((item, idx) => {
                                    const unitPriceMM = getMinMax(item, "unit_price");
                                    const amountMM = getMinMax(item, "amount");
                                    const uniqueKey = `${cat.category_name.replace(/\s/g, '_')}_${item.item_number}`;
                                    return (
                                      <tr key={idx} data-item-key={uniqueKey} className={`hover:bg-gray-50 transition-colors even:bg-gray-50 align-top ${highlightedItemKey === uniqueKey ? "highlight-row" : ""}`}>
                                        <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-600 sticky-left border-r border-gray-200">{item.item_number}</td>
                                        <td className="px-4 py-2.5 text-sm font-medium text-gray-800 whitespace-normal break-words leading-snug">{item.description}</td>
                                        <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-normal break-words">{item.brand || "—"}</td>
                                        <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-normal">{item.unit}</td>
                                        {comparisonData.submissions.map((sub, subIdx) => {
                                          const data = item.items[sub.submission_id];
                                          const quantity = data ? data.quantity : 0;
                                          const unitPrice = data ? data.unit_price : 0;
                                          const amount = data ? data.amount : 0;
                                          const unitPriceClass =
                                            highlightMetric === "unit_price"
                                              ? getHighlightClass(unitPrice, unitPriceMM.min, unitPriceMM.max, unitPriceMM.hasData)
                                              : "text-gray-700";
                                          const amountClass =
                                            highlightMetric === "amount"
                                              ? getHighlightClass(amount, amountMM.min, amountMM.max, amountMM.hasData)
                                              : "text-gray-700";
                                          return (
                                            <React.Fragment key={sub.submission_id}>
                                              <td className={`px-3 py-2.5 text-right font-mono text-sm text-gray-700 ${subIdx > 0 ? "border-l-2 border-gray-200" : ""}`}>{quantity === 0 ? "—" : formatQuantity(quantity)}</td>
                                              <td className={`px-3 py-2.5 text-right font-mono text-sm ${unitPriceClass}`}>{unitPrice === 0 ? "—" : formatCurrency(unitPrice)}</td>
                                              <td className={`px-3 py-2.5 text-right font-mono text-sm ${amountClass}`}>{amount === 0 ? "—" : formatCurrency(amount)}</td>
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

              <div className="mt-4 flex justify-center gap-6 text-xs text-gray-600 flex-wrap">
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-emerald-200 border border-emerald-600 rounded"></span> Lowest (Best)</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-amber-200 border border-amber-600 rounded"></span> Middle</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-red-200 border border-red-600 rounded"></span> Highest (Costly)</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-gray-200 border border-gray-400 rounded"></span> Zero / Missing</span>
                <span className="text-gray-500 text-xs">(Only the selected metric is highlighted)</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- AI SEARCH MODAL ---- */}
      {/* Plain hand-built portal instead of the shared base-ui Dialog - same
          fix already applied to confirm-dialog.tsx, AgreementAcknowledgementModal,
          and the dashboard's Customize Dashboard modal for the "crosshair"
          rendering artifact (moire lines from the shared Dialog's
          ring/backdrop compositing over a busy background). */}
      {showAISearch &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeAISearch();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-search-title"
              className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-3">
                  <h2 id="ai-search-title" className="text-lg font-semibold text-gray-900">Search Estimates</h2>
                </div>
                <button onClick={closeAISearch} aria-label="Close" className="p-1 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search input */}
              <div className="p-4 border-b border-gray-200 shrink-0">
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-[#15406a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search for any item across all your estimates..."
                    value={aiSearchQuery}
                    onChange={(e) => setAiSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-transparent transition-all duration-200"
                    autoFocus
                  />
                  {isSearching && (
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <div className="w-5 h-5 border-2 border-[#15406a] border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-[#15406a] rounded-full animate-pulse"></span>
                  Searching across all your submitted estimates.
                </p>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-4 min-h-[200px] modal-scroll">
                {!aiSearchQuery.trim() ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                    <svg className="w-16 h-16 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="w-8 h-8 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                    <p className="text-sm">No matches found for "{aiSearchQuery}"</p>
                    <p className="text-xs text-gray-400">Try a different keyword</p>
                  </div>
                ) : (
                  <>
                    {/* SMART INSIGHT — structured multi-brand comparison card
                        instead of a preformatted text blob, so pricing reads
                        as a real ranked comparison (bars + badges) rather
                        than a monospace-feeling wall of text. */}
                    {(() => {
                      const insight = generateSmartInsight(aiSearchQuery, searchResults);
                      return (
                        <div className="p-4 bg-gradient-to-br from-[#15406a]/[0.06] to-[#15406a]/[0.01] rounded-xl border border-[#15406a]/20">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#15406a] text-white shrink-0">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </span>
                            <p className="text-sm font-semibold text-[#15406a]">Smart Insight</p>
                          </div>

                          {insight.kind === "empty" && (
                            <p className="text-sm text-gray-600">{insight.message}</p>
                          )}

                          {insight.kind === "results" && (
                            <div>
                              <p className="text-sm text-gray-800 mb-3 break-words">
                                <span className="font-medium">"{insight.itemLabel}"</span> has been quoted by{" "}
                                {insight.brandStats.length} brand{insight.brandStats.length > 1 ? "s" : ""}.
                              </p>
                              <div className="space-y-2">
                                {insight.brandStats.map((stat, idx) => {
                                  const color = getBrandColor(stat.brand);
                                  const maxAvg = insight.brandStats[insight.brandStats.length - 1].avg || 1;
                                  const widthPct = Math.max(10, (stat.avg / maxAvg) * 100);
                                  const isBest = idx === 0 && insight.brandStats.length > 1;
                                  const isWorst = idx === insight.brandStats.length - 1 && insight.brandStats.length > 1;
                                  return (
                                    <div key={stat.brand} className="flex items-center gap-2 sm:gap-3">
                                      <span className="w-16 sm:w-20 shrink-0 text-xs font-medium text-gray-700 truncate">{stat.brand}</span>
                                      <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                                        <div
                                          className="h-full rounded-md transition-all duration-500"
                                          style={{ width: `${widthPct}%`, backgroundColor: color.borderColor }}
                                        />
                                      </div>
                                      <span className="w-24 shrink-0 text-right text-xs font-mono text-gray-700">{formatCurrency(stat.avg)}</span>
                                      <span className="w-16 shrink-0 text-right text-[10px] text-gray-400">
                                        {stat.count} quote{stat.count > 1 ? "s" : ""}
                                      </span>
                                      {isBest && (
                                        <span className="shrink-0 hidden sm:inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                          Best value
                                        </span>
                                      )}
                                      {isWorst && (
                                        <span className="shrink-0 hidden sm:inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 whitespace-nowrap">
                                          Highest
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {insight.brandStats.length > 1 ? (
                                <p className="mt-3 text-xs text-gray-600 leading-relaxed">
                                  <strong className="text-[#15406a]">{insight.brandStats[0].brand}</strong> is the most cost-effective, averaging{" "}
                                  {formatCurrency(insight.brandStats[0].avg)} vs {formatCurrency(insight.brandStats[insight.brandStats.length - 1].avg)} for{" "}
                                  {insight.brandStats[insight.brandStats.length - 1].brand} ({Math.round(insight.spreadPct)}% higher).
                                  {insight.spreadPct > 30 && " That's a significant gap — worth checking scope alignment between brands."}
                                </p>
                              ) : (
                                <p className="mt-3 text-xs text-gray-600">
                                  Only one brand has priced this item so far — consider requesting quotes from others for a fair comparison.
                                </p>
                              )}
                              {insight.otherItems.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                  <p className="text-xs font-medium text-gray-500 mb-2">
                                    {insight.otherItems.length} other related item{insight.otherItems.length > 1 ? "s" : ""}
                                  </p>
                                  <div className="space-y-2">
                                    {(showFullSummary ? insight.otherItems : insight.otherItems.slice(0, 3)).map((oi, idx) => (
                                      <div key={idx} className="flex items-start justify-between gap-3 text-xs bg-white/70 rounded-lg px-3 py-2 border border-gray-100">
                                        <span className="text-gray-700 flex-1 min-w-0 break-words">{oi.description}</span>
                                        <div className="shrink-0 flex flex-col items-end gap-1">
                                          <span className="text-gray-700 font-mono whitespace-nowrap">
                                            {oi.min === oi.max ? formatCurrency(oi.min) : `${formatCurrency(oi.min)} – ${formatCurrency(oi.max)}`}
                                          </span>
                                          <div className="flex gap-1">
                                            {oi.brands.slice(0, 3).map((b) => {
                                              const color = getBrandColor(b);
                                              return (
                                                <span key={b} className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: color.badge, color: color.text }}>
                                                  {b}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {insight.otherItems.length > 3 && (
                                    <button
                                      onClick={() => setShowFullSummary(!showFullSummary)}
                                      className="mt-2 text-xs text-[#15406a] hover:underline focus:outline-none"
                                    >
                                      {showFullSummary ? "Show less" : `Show all ${insight.otherItems.length} items`}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {insight.kind !== "empty" && (
                            <button
                              onClick={() => setShowDetailedResults(!showDetailedResults)}
                              className="mt-3 text-xs text-[#15406a] hover:underline focus:outline-none"
                            >
                              {showDetailedResults ? "Hide detailed breakdown" : "Show detailed breakdown"}
                            </button>
                          )}
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
                            <li key={idx} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                              <div className="mb-3">
                                <p
                                  className="text-base font-semibold text-gray-900"
                                  dangerouslySetInnerHTML={{ __html: highlightedDesc }}
                                />
                                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                                  <span className="bg-gray-100 px-2 py-0.5 rounded">{result.category_name}</span>
                                  {result.brand && (
                                    <span dangerouslySetInnerHTML={{ __html: `Brand: ${highlightedBrand || result.brand}` }} />
                                  )}
                                  <span>Unit: {result.unit}</span>
                                  <span className="text-xs text-gray-500">{result.submissions.length} BQ(s)</span>
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contractor</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {result.submissions.map((sub) => (
                                      <tr key={sub.submission_id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-900">{sub.client_name}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{sub.contractor_name}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{sub.version}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{formatQuantity(sub.quantity)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{formatCurrency(sub.unit_price)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right font-semibold text-gray-900">{formatCurrency(sub.amount)}</td>
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
          </div>,
          document.body
        )}
    </div>
  );
}