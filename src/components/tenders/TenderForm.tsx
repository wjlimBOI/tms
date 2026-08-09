// components/tenders/TenderForm.tsx
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import ProjectManagerSelect from "@/components/tenders/ProjectManagerSelect";
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { CapExCalculator } from "@/components/capex/CapExCalculator";
import { Button } from "@/components/ui/Button";
import { getLogoPath } from "@/lib/brandLogos";
import { brandOrder } from "@/lib/brandOrder";
import { isoToLocalDateTime } from "@/lib/dateUtils";
import DatePicker from "@/components/ui/DatePicker";
import DateTimePicker from "@/components/ui/DateTimePicker";
import { getCompanyDetailsByBrand } from "@/lib/companyMapping";
import { useNotify } from "@/components/ui/notification-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Plus, X, Calendar, Sparkles } from "lucide-react";

// --- Types ---
interface Branch {
  branch_id: number;
  branch_name: string;
  brand_name: string;
  building_name: string | null;
  address: string | null;
  brand_id?: number;
}

interface RenovationType {
  type_id: number;
  type_name: string;
}

interface BriefingDate {
  id?: string;
  date: string;
  description: string;
}

interface TenderFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  isSubmitting: boolean;
  onGeneratedTitleChange?: (title: string) => void;
  onAddressChange?: (address: string) => void;
  onBudgetCalculated?: (budget: number) => void;
  showBudget?: boolean;
}

// --- Helpers ---
const getBrandOrderKey = (brandName: string) => {
  const upper = brandName.toUpperCase();
  if (upper.includes("NEW YORK")) return "NEW YORK";
  if (upper.includes("YUN NAM")) return "YUN NAM";
  return upper.split(" ")[0];
};

const formatBranchOption = (brandName: string, branchName: string) => {
  const shortBrand = getBrandOrderKey(brandName);
  const branchCode = branchName.includes("-") ? branchName.split("-").pop()?.trim() : branchName;
  return `${shortBrand} - ${branchCode}`;
};

// --- Briefing Dates Section ---
function BriefingDatesSection({
  briefingDates,
  onChange,
  errors = [],
}: {
  briefingDates: BriefingDate[];
  onChange: (dates: BriefingDate[]) => void;
  errors?: string[];
}) {
  const addBriefingDate = () => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    
    const newDate: BriefingDate = {
      id: `temp-${Date.now()}`,
      date: localDateTime,
      description: "",
    };
    onChange([...briefingDates, newDate]);
  };

  const removeBriefingDate = (id: string) => {
    onChange(briefingDates.filter(d => d.id !== id));
  };

  const updateBriefingDate = (id: string, field: keyof BriefingDate, value: string) => {
    onChange(
      briefingDates.map(d => 
        d.id === id ? { ...d, [field]: value } : d
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-semibold text-slate-700">
            Briefing Dates & Descriptions
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            Add multiple briefing dates with optional descriptions
          </p>
        </div>
        <Button
          type="button"
          onClick={addBriefingDate}
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 border-slate-300 hover:bg-slate-50"
        >
          <Plus className="w-4 h-4" />
          Add Briefing Date
        </Button>
      </div>

      {briefingDates.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-400">
            No briefing dates added yet. Click the button above to add one.
          </p>
        </div>
      )}

      {briefingDates.map((briefing, index) => (
        <div 
          key={briefing.id} 
          className="relative p-4 bg-slate-50 rounded-lg border border-slate-200"
        >
          <button
            type="button"
            onClick={() => removeBriefingDate(briefing.id!)}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Briefing Date & Time {index === 0 && <span className="text-rose-500">*</span>}
              </label>
              <DateTimePicker
                name={`briefing_date_${briefing.id}`}
                value={briefing.date}
                onChange={(e) => updateBriefingDate(briefing.id!, "date", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={briefing.description}
                onChange={(e) => updateBriefingDate(briefing.id!, "description", e.target.value)}
                placeholder="e.g., Site walkthrough, Q&A session, etc."
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>
        </div>
      ))}

      {errors.length > 0 && (
        <div className="text-xs text-rose-600 space-y-0.5">
          {errors.map((error, i) => (
            <p key={i}>• {error}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---
export default function TenderForm({
  initialData,
  onSubmit,
  isSubmitting,
  onGeneratedTitleChange,
  onAddressChange,
  onBudgetCalculated,
  showBudget = true,
}: TenderFormProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [renovationTypes, setRenovationTypes] = useState<RenovationType[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useNotify();

  const [branchSearchTerm, setBranchSearchTerm] = useState("");
  const [filteredBranches, setFilteredBranches] = useState<Branch[]>([]);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const branchInputRef = useRef<HTMLInputElement>(null);
  const branchDropdownRef = useRef<HTMLUListElement>(null);

  const [selectedBrandName, setSelectedBrandName] = useState("");
  const [selectedPMName, setSelectedPMName] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);

  const [briefingDates, setBriefingDates] = useState<BriefingDate[]>([]);
  const [briefingErrors, setBriefingErrors] = useState<string[]>([]);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [aiDescriptionInput, setAiDescriptionInput] = useState("");
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  const [formData, setFormData] = useState({
    branch_id: "",
    renovation_type_id: "",
    tender_name: "",
    tender_description: "",
    tender_date: "",
    closing_date: "",
    renovation_start_date: "",
    renovation_end_date: "",
    estimated_budget: "",
    project_manager_id: "",
    project_manager_name: "",
    project_manager_email: "",
    project_manager_phone: "",
    expected_handover_date: "",
    defect_liability_months: "12",
  });

  // Load lookups
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [branchesRes, typesRes] = await Promise.all([
          fetch("/api/branches"),
          fetch("/api/renovation-types"),
        ]);
        if (!branchesRes.ok || !typesRes.ok) throw new Error("Failed to load data");
        const branchesData = await branchesRes.json();
        const typesData = await typesRes.json();

        const processedBranches = branchesData.map((branch: any) => {
          const brandName = branch.brand_name || "";
          const companyDetails = brandName ? getCompanyDetailsByBrand(brandName) : null;
          const fullBrandName = companyDetails?.companyName || brandName;
          return {
            ...branch,
            brand_name: fullBrandName,
            building_name: branch.building_name || branch.branch_name || "",
            address: typeof branch.address === 'string' ? branch.address : branch.branch_name || "",
          };
        });

        const sortedBranches = [...processedBranches].sort((a, b) => {
          const keyA = getBrandOrderKey(a.brand_name);
          const keyB = getBrandOrderKey(b.brand_name);
          const orderA = brandOrder[keyA] ?? 99;
          const orderB = brandOrder[keyB] ?? 99;
          return orderA === orderB ? a.branch_name.localeCompare(b.branch_name) : orderA - orderB;
        });
        setBranches(sortedBranches);
        setFilteredBranches(sortedBranches);
        setRenovationTypes(typesData);
      } catch (err) {
        setError("Failed to load form data. Please refresh.");
        toast.error("Failed to load form data.");
      } finally {
        setLoadingLookups(false);
      }
    };
    loadLookups();
  }, []);

  // Populate from initialData (edit mode)
  useEffect(() => {
    if (!initialData || branches.length === 0) return;

    if (initialData.briefing_dates && Array.isArray(initialData.briefing_dates)) {
      const dates = initialData.briefing_dates.map((d: any) => ({
        id: d.id?.toString() || `existing-${Date.now()}-${Math.random()}`,
        date: isoToLocalDateTime(d.briefing_date) || "",
        description: d.description || "",
      }));
      setBriefingDates(dates);
    }

    setFormData({
      branch_id: initialData.branch_id?.toString() || "",
      renovation_type_id: initialData.renovation_type_id?.toString() || "",
      tender_name: initialData.tender_name || "",
      tender_description: initialData.tender_description || "",
      tender_date: isoToLocalDateTime(initialData.tender_date),
      closing_date: isoToLocalDateTime(initialData.closing_date),
      renovation_start_date: isoToLocalDateTime(initialData.renovation_start_date),
      renovation_end_date: isoToLocalDateTime(initialData.renovation_end_date),
      estimated_budget: initialData.estimated_budget?.toString() || "",
      project_manager_id: initialData.project_manager_id?.toString() || "",
      project_manager_name: initialData.project_manager_name || "",
      project_manager_email: initialData.project_manager_email || "",
      project_manager_phone: initialData.project_manager_phone || "",
      expected_handover_date: initialData.expected_handover_date
        ? new Date(initialData.expected_handover_date).toISOString().slice(0, 10)
        : "",
      defect_liability_months: initialData.defect_liability_months?.toString() || "12",
    });
    setSelectedPMName(initialData.project_manager_name || "");
    const selectedBranch = branches.find((b) => b.branch_id === initialData.branch_id);
    if (selectedBranch) {
      setBranchSearchTerm(formatBranchOption(selectedBranch.brand_name, selectedBranch.branch_name));
      setSelectedBrandName(selectedBranch.brand_name);
    }
  }, [initialData, branches]);

  // Auto-generate title
  useEffect(() => {
    const branchId = formData.branch_id ? parseInt(formData.branch_id) : null;
    const renovationTypeId = formData.renovation_type_id ? parseInt(formData.renovation_type_id) : null;
    if (!branchId || !renovationTypeId) return;
    if (isNameManuallyEdited) return;

    const branch = branches.find((b) => b.branch_id === branchId);
    const type = renovationTypes.find((t) => t.type_id === renovationTypeId);
    if (branch && type) {
      const fullBrandName = branch.brand_name || "Brand";
      const location = branch.building_name || branch.branch_name || "Location";
      const title = `${type.type_name} at ${location} for ${fullBrandName}`;

      if (formData.tender_name !== title) {
        setFormData((prev) => ({ ...prev, tender_name: title }));
        if (onGeneratedTitleChange) onGeneratedTitleChange(title);
        if (onAddressChange && branch.address) {
          const addressStr = typeof branch.address === "string" ? branch.address : "";
          onAddressChange(addressStr);
        }
      }
    }
  }, [
    formData.branch_id,
    formData.renovation_type_id,
    branches,
    renovationTypes,
    onGeneratedTitleChange,
    onAddressChange,
    isNameManuallyEdited,
  ]);

  // Filter branches
  useEffect(() => {
    const term = branchSearchTerm.toLowerCase();
    setFilteredBranches(
      term === ""
        ? branches
        : branches.filter((b) =>
            formatBranchOption(b.brand_name, b.branch_name).toLowerCase().includes(term)
          )
    );
    setShowBranchDropdown(true);
  }, [branchSearchTerm, branches]);

  // Click outside branch dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        branchInputRef.current &&
        !branchInputRef.current.contains(event.target as Node) &&
        branchDropdownRef.current &&
        !branchDropdownRef.current.contains(event.target as Node)
      ) {
        setShowBranchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "tender_name") {
      setIsNameManuallyEdited(true);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGenerateDescription = async () => {
    const input = aiDescriptionInput.trim();
    if (!input) {
      toast.error("Describe the project first, e.g. \"minor project, no closure, night work only\"");
      return;
    }

    const hasExistingText = formData.tender_description.trim().length > 0;
    if (hasExistingText) {
      const proceed = await confirm("This will replace the current description. Continue?");
      if (!proceed) return;
    }

    setIsGeneratingDescription(true);
    try {
      const res = await fetch("/api/tenders/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          tenderName: formData.tender_name || undefined,
          renovationType: renovationTypes.find(
            (t) => t.type_id === parseInt(formData.renovation_type_id)
          )?.type_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate description");
        return;
      }
      setFormData((prev) => ({ ...prev, tender_description: data.description }));
      toast.success(
        data.groundedInPastExamples
          ? "Description generated from your past tenders' style"
          : "Description generated"
      );
    } catch {
      toast.error("Failed to generate description");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleSelectBranch = (branch: Branch) => {
    setFormData((prev) => ({ ...prev, branch_id: branch.branch_id.toString() }));
    setBranchSearchTerm(formatBranchOption(branch.brand_name, branch.branch_name));
    setSelectedBrandName(branch.brand_name);
    setShowBranchDropdown(false);
    setIsNameManuallyEdited(false);
  };

  const handlePMChange = (pmId: number | null, pmDetails?: any) => {
    setFormData((prev) => ({
      ...prev,
      project_manager_id: pmId ? pmId.toString() : "",
      project_manager_name: pmDetails?.name || "",
      project_manager_email: pmDetails?.email || "",
      project_manager_phone: pmDetails?.phone || "",
    }));
    setSelectedPMName(pmDetails?.name || "");
  };

  const handleBudgetCalculated = (result: any) => {
    const budget = result.finalCost || result.baseRenovationCost;
    if (budget) {
      setFormData((prev) => ({ ...prev, estimated_budget: budget.toString() }));
      onBudgetCalculated?.(budget);
    }
    setIsDrawerOpen(false);
  };

  const validateBriefingDates = (): boolean => {
    const errors: string[] = [];
    
    if (briefingDates.length === 0) {
      errors.push("At least one briefing date is required.");
    } else {
      briefingDates.forEach((d, index) => {
        if (!d.date) {
          errors.push(`Briefing date ${index + 1} is missing a date/time.`);
        }
      });
    }
    
    setBriefingErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBriefingDates()) {
      toast.error("Please fix the briefing date errors.");
      return;
    }

    if (formData.tender_date && formData.closing_date) {
      if (new Date(formData.closing_date) < new Date(formData.tender_date)) {
        toast.error("Closing date cannot be before the tender date.");
        return;
      }
    }
    if (formData.renovation_start_date && formData.renovation_end_date) {
      if (new Date(formData.renovation_end_date) < new Date(formData.renovation_start_date)) {
        toast.error("Renovation end date cannot be before the renovation start date.");
        return;
      }
    }

    const dateFields = [
      "tender_date",
      "closing_date",
      "renovation_start_date",
      "renovation_end_date",
    ] as const;

    const submitData = { ...formData };
    for (const field of dateFields) {
      if (submitData[field]) {
        const date = new Date(submitData[field]);
        if (!isNaN(date.getTime())) {
          submitData[field] = date.toISOString();
        }
      }
    }

    const payload = {
      branch_id: parseInt(submitData.branch_id),
      renovation_type_id: parseInt(submitData.renovation_type_id),
      tender_name: submitData.tender_name,
      tender_description: submitData.tender_description || null,
      estimated_budget: submitData.estimated_budget ? parseFloat(submitData.estimated_budget) : null,
      tender_date: submitData.tender_date || null,
      closing_date: submitData.closing_date || null,
      renovation_start_date: submitData.renovation_start_date || null,
      renovation_end_date: submitData.renovation_end_date || null,
      project_manager_id: submitData.project_manager_id ? parseInt(submitData.project_manager_id) : null,
      project_manager_name: submitData.project_manager_name || null,
      project_manager_email: submitData.project_manager_email || null,
      project_manager_phone: submitData.project_manager_phone || null,
      expected_handover_date: submitData.expected_handover_date || null,
      defect_liability_months: submitData.defect_liability_months ? parseInt(submitData.defect_liability_months) : null,
      briefing_dates: briefingDates.map(d => {
        const parsed = new Date(d.date);
        return {
          date: !isNaN(parsed.getTime()) ? parsed.toISOString() : d.date,
          description: d.description || "",
        };
      }),
    };
    onSubmit(payload);
  };

  const logoPath = useMemo(() => getLogoPath(selectedBrandName), [selectedBrandName]);

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loadingLookups) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-slate-500">Loading form data…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {selectedBrandName && logoPath && (
        <img src={logoPath} alt={selectedBrandName} className="h-16 w-auto object-contain mx-auto my-4" />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Branch */}
        <div className="relative">
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Branch <span className="text-rose-500">*</span>
          </label>
          <input
            ref={branchInputRef}
            type="text"
            value={branchSearchTerm}
            onChange={(e) => setBranchSearchTerm(e.target.value)}
            onFocus={() => setShowBranchDropdown(true)}
            placeholder="Search branch…"
            required
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          {showBranchDropdown && filteredBranches.length > 0 && (
            <ul
              ref={branchDropdownRef}
              className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto"
            >
              {filteredBranches.map((branch) => (
                <li
                  key={branch.branch_id}
                  onClick={() => handleSelectBranch(branch)}
                  className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-slate-900"
                >
                  {formatBranchOption(branch.brand_name, branch.branch_name)}
                  {branch.building_name && branch.building_name !== branch.branch_name && (
                    <span className="text-xs text-slate-400 ml-2">
                      ({branch.building_name})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <input type="hidden" name="branch_id" value={formData.branch_id} required />
          <p className="text-xs text-slate-400 mt-1">
            {branches.find((b) => b.branch_id === parseInt(formData.branch_id))?.brand_name ||
              "Select a branch"}
            {branches.find((b) => b.branch_id === parseInt(formData.branch_id))?.building_name &&
              ` — ${
                branches.find((b) => b.branch_id === parseInt(formData.branch_id))?.building_name
              }`}
          </p>
        </div>

        {/* Renovation Type */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Renovation Type <span className="text-rose-500">*</span>
          </label>
          <select
            name="renovation_type_id"
            value={formData.renovation_type_id}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          >
            <option value="">Select type</option>
            {renovationTypes.map((t) => (
              <option key={t.type_id} value={t.type_id}>
                {t.type_name}
              </option>
            ))}
          </select>
        </div>

        {/* Tender Name */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-semibold text-slate-700">
              Tender Name <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {isNameManuallyEdited ? "✏️ Manually edited" : "🔄 Auto-generated"}
              </span>
            </div>
          </div>
          <input
            type="text"
            name="tender_name"
            value={formData.tender_name}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          <p className="text-xs text-slate-500 mt-1">
            Auto‑generated – you can edit it.
          </p>
        </div>

        {/* Estimated Budget */}
        {showBudget && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Estimated Budget ($)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  name="estimated_budget"
                  value={formData.estimated_budget}
                  onChange={handleChange}
                  className="pl-7 w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  placeholder="0.00"
                />
              </div>
              <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <DrawerTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap border-slate-300 hover:bg-slate-50"
                  >
                    Calculate
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="h-[90vh] max-h-[90vh] top-[5vh] bottom-auto inset-x-0 rounded-t-2xl overflow-hidden border-t border-slate-200 shadow-2xl">
                  <div className="flex flex-col h-full bg-white">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
                      <h2 className="text-xl font-semibold text-slate-900">
                        Budget Calculator
                      </h2>
                      <DrawerClose asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-slate-700"
                        >
                          ✕
                        </Button>
                      </DrawerClose>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                      <CapExCalculator onApply={handleBudgetCalculated} />
                    </div>
                    <div className="flex justify-end p-4 border-t border-slate-200 flex-shrink-0 bg-slate-50">
                      <DrawerClose asChild>
                        <Button variant="ghost">Cancel</Button>
                      </DrawerClose>
                    </div>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Use the calculator to estimate based on brand and area.
            </p>
          </div>
        )}

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Description
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
            <input
              type="text"
              value={aiDescriptionInput}
              onChange={(e) => setAiDescriptionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGenerateDescription();
                }
              }}
              placeholder='e.g. "minor project, no closure, night work only, 2 phases"'
              className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm px-3 py-2"
            />
            <Button
              type="button"
              onClick={handleGenerateDescription}
              disabled={isGeneratingDescription}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 border-indigo-300 text-indigo-600 hover:bg-indigo-50 whitespace-nowrap disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isGeneratingDescription ? "animate-pulse" : ""}`} />
              {isGeneratingDescription ? "Generating…" : "Generate with AI"}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mb-2">
            Type a short note about the project and generate a full description — you can edit it after.
          </p>

          <textarea
            ref={descriptionRef}
            name="tender_description"
            rows={6}
            value={formData.tender_description}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-y min-h-[140px]"
            placeholder="Describe the scope of work, key requirements, site conditions, special instructions, etc."
          />
          <div className="text-right text-xs text-slate-400 mt-1">
            {formData.tender_description?.length || 0} characters
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-md font-semibold text-slate-800 mb-4">Timeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DateTimePicker
            label="Tender Start"
            name="tender_date"
            value={formData.tender_date}
            onChange={handleChange}
          />

          <DateTimePicker
            label="Closing Date"
            name="closing_date"
            value={formData.closing_date}
            onChange={handleChange}
          />

          <DateTimePicker
            label="Renovation Start"
            name="renovation_start_date"
            value={formData.renovation_start_date}
            onChange={handleChange}
          />

          <DateTimePicker
            label="Renovation End"
            name="renovation_end_date"
            value={formData.renovation_end_date}
            onChange={handleChange}
          />

          <DatePicker
            label={<>Expected Handover Date <span className="font-normal text-slate-400">(planning estimate)</span></>}
            name="expected_handover_date"
            value={formData.expected_handover_date}
            onChange={handleChange}
          />

          <div>
            <label htmlFor="defect_liability_months" className="block font-semibold mb-1 text-slate-700">
              Defect Liability Period (months)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              id="defect_liability_months"
              name="defect_liability_months"
              value={formData.defect_liability_months}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          All dates and times are in your local time zone.
        </p>
      </div>

      {/* Briefing Dates Section */}
      <div className="border-t border-slate-200 pt-6">
        <BriefingDatesSection
          briefingDates={briefingDates}
          onChange={setBriefingDates}
          errors={briefingErrors}
        />
      </div>

      {/* Project Manager */}
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-md font-semibold text-slate-800 mb-4">Project Manager</h3>
        <ProjectManagerSelect
          value={formData.project_manager_id ? parseInt(formData.project_manager_id) : null}
          onChange={handlePMChange}
          initialName={selectedPMName}
          hideLabel
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              name="project_manager_name"
              value={formData.project_manager_name}
              onChange={handleChange}
              placeholder="e.g. Mr. Jack Puan"
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              name="project_manager_email"
              value={formData.project_manager_email}
              onChange={handleChange}
              placeholder="e.g. jack@company.com"
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phone / Mobile
            </label>
            <input
              type="text"
              name="project_manager_phone"
              value={formData.project_manager_phone}
              onChange={handleChange}
              placeholder="e.g. 8139 0348"
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Auto‑filled – you can edit it.
        </p>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Saving...
            </span>
          ) : initialData ? (
            "Update Tender"
          ) : (
            "Create Tender"
          )}
        </button>
      </div>
    </form>
  );
}