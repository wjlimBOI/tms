"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBranchStatusBadgeStyle, getBranchStatusLabel } from "@/lib/statusColors";

// ---------- Interfaces ----------
interface Branch {
  branch_id: number;
  branch_name: string;
  brand_id: number;
  brand_name: string;
  operation_status: string;
  address: {
    address_id: number;
    full_address: string;
    building_name: string;
    postal_code: string;
    is_primary: boolean;
  } | null;
}

interface Brand {
  brand_id: number;
  brand_name: string;
}

// ---------- Brand Colors (keyed by brand_id) ----------
const BRAND_COLORS: Record<number, string> = {
  1: '#B29014', // Jonsson
  2: '#E61994', // Shakura
  3: '#FF7600', // Yun Nam
  4: '#CD0008', // London
  5: '#00e6d7', // Victoria
  6: '#0082D7', // New York
  7: '#480A87', // Dorra
};

// ---------- Brand Display Names (short names) ----------
const BRAND_DISPLAY_NAMES: Record<number, string> = {
  1: 'Jonsson',
  2: 'Shakura',
  3: 'Yun Nam',
  4: 'London',
  5: 'Victoria',
  6: 'New York',
  7: 'Dorra',
};

// ---------- Brand Sort Order (custom) ----------
const BRAND_ORDER: Record<number, number> = {
  3: 1, // Yun Nam
  4: 2, // London
  6: 3, // New York
  7: 4, // Dorra
  2: 5, // Shakura
  1: 6, // Jonsson
  5: 7, // Victoria
};

const OPERATION_STATUSES = [
  'Open',
  'Under Renovation',
  'Under Refurbishment',
  'Closed',
];

// ---------- StyledModal ----------
interface StyledModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  note?: string;
  type: "confirm" | "success" | "error";
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

const StyledModal: React.FC<StyledModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  note,
  type,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
}) => {
  if (!isOpen) return null;

  const getIconColors = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-emerald-100 dark:bg-emerald-500/20",
          icon: "text-emerald-600 dark:text-emerald-400",
          button: "from-emerald-600 to-teal-600",
        };
      case "error":
        return {
          bg: "bg-rose-100 dark:bg-rose-500/20",
          icon: "text-rose-600 dark:text-rose-400",
          button: "from-rose-600 to-pink-600",
        };
      default:
        return {
          bg: "bg-blue-100 dark:bg-blue-500/20",
          icon: "text-blue-600 dark:text-blue-400",
          button: "from-blue-600 to-indigo-600",
        };
    }
  };

  const colors = getIconColors();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#0f1630] rounded-xl shadow-xl max-w-md w-full border overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center`}>
              {type === "success" ? (
                <svg className={`w-5 h-5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              ) : type === "error" ? (
                <svg className={`w-5 h-5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className={`w-5 h-5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            {message}
            {note && <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">{note}</span>}
          </p>
          <div className="flex gap-3 justify-end">
            {type === "confirm" && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition font-medium text-sm"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={type === "confirm" ? onConfirm : onClose}
              className={`px-4 py-2 rounded-lg bg-gradient-to-r ${colors.button} hover:brightness-105 text-white font-medium text-sm shadow-sm transition`}
            >
              {type === "confirm" ? confirmText : "OK"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Main Page Component ----------
export default function AdminBranchesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState(() => searchParams.get("brand_id") || "");
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") || "");
  const [brandsLoading, setBrandsLoading] = useState(true);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    branch_name: "",
    brand_id: "",
    operation_status: "Open",
    address: {
      full_address: "",
      building_name: "",
      postal_code: "",
    }
  });

  const [confirmModal, setConfirmModal] = useState<{ open: boolean; branchId: number | null; name: string }>({
    open: false,
    branchId: null,
    name: "",
  });
  const [successModal, setSuccessModal] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });
  const [errorModal, setErrorModal] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  // Auth check
  useEffect(() => {
    if (status === "loading") return;
    if (!session || (session.user as any).role_id !== 1) {
      router.push("/");
    }
  }, [session, status, router]);

  const fetchBrands = useCallback(async () => {
    setBrandsLoading(true);
    try {
      const res = await fetch("/api/brands");
      if (!res.ok) {
        const text = await res.text();
        console.error("Brands API error:", res.status, text);
        throw new Error(`Failed to fetch brands (${res.status})`);
      }
      const data = await res.json();
      const sorted = data.sort((a: Brand, b: Brand) => {
        const orderA = BRAND_ORDER[a.brand_id] ?? 999;
        const orderB = BRAND_ORDER[b.brand_id] ?? 999;
        return orderA - orderB;
      });
      setBrands(sorted);
    } catch (err: any) {
      console.error("Error fetching brands:", err);
      setErrorModal({
        open: true,
        message: "Could not load brands. Please refresh the page.",
      });
      setBrands([]);
    } finally {
      setBrandsLoading(false);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = brandFilter ? `/api/branches?brand_id=${brandFilter}` : "/api/branches";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch branches");
      const data = await res.json();
      setBranches(data);
    } catch (err) {
      setError("Could not load branches. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [brandFilter]);

  useEffect(() => {
    if (session && (session.user as any).role_id === 1) {
      fetchBrands();
      fetchBranches();
    }
  }, [session, fetchBrands, fetchBranches]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (brandFilter) params.set("brand_id", brandFilter);
    if (searchTerm) params.set("search", searchTerm);
    router.replace(`/admin/branches?${params.toString()}`, { scroll: false });
  }, [brandFilter, searchTerm, router]);

  const applyFilter = () => fetchBranches();
  const clearFilters = () => {
    setBrandFilter("");
    setSearchTerm("");
  };

  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchTerm(value);
    }, 400);
  };

  const openCreateModal = () => {
    setEditingBranch(null);
    setFormData({
      branch_name: "",
      brand_id: "",
      operation_status: "Open",
      address: {
        full_address: "",
        building_name: "",
        postal_code: "",
      }
    });
    setShowModal(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      branch_name: branch.branch_name,
      brand_id: String(branch.brand_id),
      operation_status: branch.operation_status || "Open",
      address: {
        full_address: branch.address?.full_address || "",
        building_name: branch.address?.building_name || "",
        postal_code: branch.address?.postal_code || "",
      }
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        branch_name: formData.branch_name.trim(),
        brand_id: parseInt(formData.brand_id),
        operation_status: formData.operation_status,
        address: {
          full_address: formData.address.full_address.trim(),
          building_name: formData.address.building_name?.trim() || null,
          postal_code: formData.address.postal_code?.trim() || null,
        }
      };

      let url = "/api/branches";
      let method = "POST";
      if (editingBranch) {
        url = `/api/branches/${editingBranch.branch_id}`;
        method = "PUT";
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Operation failed");
      }

      setShowModal(false);
      await fetchBranches();
      setSuccessModal({
        open: true,
        message: `Branch ${editingBranch ? "updated" : "created"} successfully.`,
      });
    } catch (err: any) {
      setErrorModal({ open: true, message: err.message });
    }
  };

  const handleDelete = (branchId: number, name: string) => {
    setConfirmModal({ open: true, branchId, name });
  };

  const confirmDelete = async () => {
    const { branchId } = confirmModal;
    if (!branchId) return;
    try {
      const res = await fetch(`/api/branches/${branchId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Deletion failed");
      setConfirmModal({ open: false, branchId: null, name: "" });
      await fetchBranches();
      setSuccessModal({ open: true, message: "Branch deleted successfully." });
    } catch (err) {
      setErrorModal({ open: true, message: "Could not delete branch." });
    }
  };

  const filteredAndSortedBranches = useMemo(() => {
    let result = [...branches];
    
    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(branch =>
        branch.branch_name.toLowerCase().includes(term)
      );
    }
    
    // Sort alphabetically by building name (A to Z)
    result.sort((a, b) => {
      const buildingA = (a.address?.building_name || '').toLowerCase();
      const buildingB = (b.address?.building_name || '').toLowerCase();
      
      // If both have building names, sort alphabetically
      if (buildingA && buildingB) {
        return buildingA.localeCompare(buildingB);
      }
      // If only one has a building name, prioritize the one with a name
      if (buildingA && !buildingB) return -1;
      if (!buildingA && buildingB) return 1;
      
      // If neither has a building name, sort by branch name
      return a.branch_name.localeCompare(b.branch_name);
    });
    
    return result;
  }, [branches, searchTerm]);

  const activeBranches = filteredAndSortedBranches.filter(b => b.operation_status !== 'Closed');
  const ongoingWorksBranches = filteredAndSortedBranches.filter(
    b => b.operation_status === 'Under Renovation' || b.operation_status === 'Under Refurbishment'
  );

  if (status === "loading" || (loading && branches.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a1228]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 dark:text-cyan-300/70">Loading branches…</p>
        </div>
      </div>
    );
  }

  if (error && branches.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-[#0a1228]">
        <div className="bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/50 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-700 dark:text-red-200">{error}</p>
          <button onClick={fetchBranches} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-50 dark:bg-[#0a1228]">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[35vw] max-w-[540px] max-h-[280px] bg-cyan-500/5 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative z-10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Branch Management</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Manage all branch locations and their details
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { fetchBranches(); fetchBrands(); }}
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl shadow-sm dark:shadow-lg text-gray-700 dark:text-white bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-all duration-200"
                title="Refresh"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl shadow-sm dark:shadow-lg text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 dark:from-cyan-500 dark:to-blue-600 dark:hover:from-cyan-600 dark:hover:to-blue-700 transition-all duration-200 hover:-translate-y-0.5"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Branch
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-[#0a1228]/90 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-5 shadow-sm dark:shadow-none">
              <p className="text-xs font-semibold text-gray-400 dark:text-cyan-300 uppercase tracking-wider">Total Branches</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{filteredAndSortedBranches.length}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">All active locations</p>
            </div>
            <div className="bg-white dark:bg-[#0a1228]/90 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-5 shadow-sm dark:shadow-none">
              <p className="text-xs font-semibold text-gray-400 dark:text-cyan-300 uppercase tracking-wider">Operational</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{activeBranches.length}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Excludes closed locations</p>
            </div>
            <div className="bg-white dark:bg-[#0a1228]/90 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-5 shadow-sm dark:shadow-none">
              <p className="text-xs font-semibold text-gray-400 dark:text-cyan-300 uppercase tracking-wider">Works in Progress</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{ongoingWorksBranches.length}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Under renovation/refurbishment</p>
            </div>
            <div className="bg-white dark:bg-[#0a1228]/90 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-5 shadow-sm dark:shadow-none">
              <p className="text-xs font-semibold text-gray-400 dark:text-cyan-300 uppercase tracking-wider">Closed</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {filteredAndSortedBranches.filter(b => b.operation_status === 'Closed').length}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Permanently closed</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white dark:bg-[#0a1228]/90 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-cyan-500/30 p-5 mb-6 shadow-sm dark:shadow-none">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider mb-1">Search Branch</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type branch name..."
                    defaultValue={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:focus:ring-cyan-400 focus:border-transparent px-3 py-2 text-sm"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider mb-1">Filter by Brand</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:focus:ring-cyan-400 px-3 py-2 text-sm"
                  disabled={brandsLoading}
                >
                  <option value="">All Brands</option>
                  {brands.map((brand) => {
                    const displayName = BRAND_DISPLAY_NAMES[brand.brand_id] || brand.brand_name;
                    return (
                      <option key={brand.brand_id} value={brand.brand_id}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
                {brandsLoading && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Loading brands…</p>}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={applyFilter}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 dark:from-cyan-500 dark:to-blue-600 text-white text-sm font-medium rounded-lg shadow-sm transition"
                >
                  Apply Filter
                </button>
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 border border-cyan-600 dark:border-cyan-500/50 rounded-lg text-sm font-medium text-cyan-700 dark:text-cyan-300 bg-transparent hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>

          {/* Table - Brand Color as Left Border */}
          <div className="bg-white dark:bg-[#0a1228]/90 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-cyan-500/30 overflow-hidden shadow-sm dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
                <thead className="bg-gray-50 dark:bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Branch</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Building</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Full Address</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Postal Code</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-cyan-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                  {filteredAndSortedBranches.length > 0 ? (
                    filteredAndSortedBranches.map((branch) => {
                      const brandColor = BRAND_COLORS[branch.brand_id] || '#6B7280';
                      const statusClasses = getBranchStatusBadgeStyle(branch.operation_status);
                      
                      return (
                        <tr 
                          key={branch.branch_id} 
                          className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-150 relative"
                        >
                          {/* Left border color indicator for brand */}
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white text-center relative">
                            <div 
                              className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
                              style={{ backgroundColor: brandColor }}
                            />
                            {branch.branch_name}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-white/70 text-center">
                            {branch.address?.building_name || "—"}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600 dark:text-white/70 text-center max-w-xs truncate" title={branch.address?.full_address || ""}>
                            {branch.address?.full_address || "—"}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-white/70 text-center">
                            {branch.address?.postal_code || "—"}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClasses}`}>
                              {getBranchStatusLabel(branch.operation_status)}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => openEditModal(branch)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/50 hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-all"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(branch.branch_id, branch.branch_name)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/50 hover:bg-red-200 dark:hover:bg-red-500/30 transition-all"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-white/50">
                        {brandFilter || searchTerm ? "No branches match your filters." : "No branches have been created yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl transform transition-all border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
                    {editingBranch ? "Edit Branch" : "Create New Branch"}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {editingBranch
                      ? "Update branch details and operation status"
                      : "Add a new branch under a brand"}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 18" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Branch Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.branch_name}
                    onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    placeholder="e.g. Orchard Road"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Brand <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.brand_id}
                    onChange={(e) => setFormData({ ...formData, brand_id: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  >
                    <option value="">Select a brand</option>
                    {brands.map((brand) => {
                      const displayName = BRAND_DISPLAY_NAMES[brand.brand_id] || brand.brand_name;
                      return (
                        <option key={brand.brand_id} value={brand.brand_id}>
                          {displayName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-4 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Address Information</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Primary address</span>
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Full Address <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    value={formData.address.full_address}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      address: { ...formData.address, full_address: e.target.value }
                    })}
                    rows={2}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    placeholder="Full address of the branch"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Building Name
                    </label>
                    <input
                      type="text"
                      value={formData.address.building_name}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        address: { ...formData.address, building_name: e.target.value }
                      })}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                      placeholder="e.g. Kovan Heartland Mall"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      value={formData.address.postal_code}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        address: { ...formData.address, postal_code: e.target.value }
                      })}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                      placeholder="e.g. 530205"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Operation Status</label>
                <select
                  value={formData.operation_status}
                  onChange={(e) => setFormData({ ...formData, operation_status: e.target.value })}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                >
                  {OPERATION_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Indicates the current operational state of the branch.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 dark:from-cyan-500 dark:to-blue-600 rounded-lg text-sm font-medium text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
                >
                  {editingBranch ? "Update Branch" : "Create Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation modals */}
      <StyledModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, branchId: null, name: "" })}
        title="Confirm Delete"
        message={`Are you sure you want to delete the branch "${confirmModal.name}"?`}
        note="This action cannot be undone."
        type="confirm"
        onConfirm={confirmDelete}
        confirmText="Delete"
        cancelText="Cancel"
      />

      <StyledModal
        isOpen={successModal.open}
        onClose={() => setSuccessModal({ open: false, message: "" })}
        title="Success"
        message={successModal.message}
        type="success"
      />

      <StyledModal
        isOpen={errorModal.open}
        onClose={() => setErrorModal({ open: false, message: "" })}
        title="Error"
        message={errorModal.message}
        type="error"
      />
    </div>
  );
}