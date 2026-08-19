"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useNotify } from "@/components/ui/notification-provider";
import { ArrowLeft, Save, Eye, Menu, X, RotateCw, Plus } from "lucide-react";
import { getCompanyDetailsByBrand } from "@/lib/companyMapping";
import { isoToLocalDateTime } from "@/lib/dateUtils";
import DatePicker from "@/components/ui/DatePicker";
import DateTimePicker from "@/components/ui/DateTimePicker";
import { ROLE_IDS, isSuperUser } from "@/lib/roles";
import { DEFAULT_CRITICAL, DEFAULT_SCOPE, DEFAULT_TERMS } from "@/lib/tenderClauses";
import {
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_TEL,
  DEFAULT_PM_NAME,
  DEFAULT_PM_EMAIL,
} from "@/lib/tenderConstants";

// ========== Helpers ==========
const formatDateTime = (isoString: string | null | undefined): string => {
  if (!isoString) return "To be confirmed";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "To be confirmed";
  return date.toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const generateCriticalDatesDescription = (tender: any): string => {
  if (!tender) return "";
  const briefingDates = tender.briefing_dates || [];
  let briefingText = "• Briefing Date & Time: To be confirmed";
  if (briefingDates.length > 0) {
    const briefings = briefingDates.map((bd: any) => 
      `• Briefing ${bd.id}: ${formatDateTime(bd.briefing_date)}${bd.description ? ` (${bd.description})` : ''}`
    ).join("\n");
    briefingText = briefings;
  }
  return [
    `• Tender Period: ${formatDateTime(tender.tender_date)} to ${formatDateTime(tender.closing_date)}`,
    `• Renovation Period: ${formatDateTime(tender.renovation_start_date)} to ${formatDateTime(tender.renovation_end_date)}`,
    briefingText,
    `* Refurbishment period is purely night work only.`,
  ].join("\n");
};

const generateTenderEnquiriesDescription = (tender: any): string => {
  if (!tender) return "";
  const brandName = tender.brand_name || "";
  const companyDetails = brandName ? getCompanyDetailsByBrand(brandName) : null;
  const companyAddress = companyDetails?.address || DEFAULT_COMPANY_ADDRESS;
  const companyTel = companyDetails?.tel || DEFAULT_COMPANY_TEL;
  const pmName = tender?.project_manager_name || DEFAULT_PM_NAME;
  const pmEmail = tender?.project_manager_email || DEFAULT_PM_EMAIL;
  return [
    `Any enquiries regarding the Tender Documents should be referred to in writing to:`,
    ``,
    `${pmName}`,
    `Project Manager`,
    `${companyAddress}`,
    `Tel: ${companyTel}`,
    `Email: ${pmEmail}`,
    ``,
    `Any attempt by any Contractors or by any person on his behalf to canvass, solicit or approach any officer from the Company and/or its subsidiaries and agent in any matter relating to or arising out of this quotation except seeking clarification on the specification shall render the quotation being disqualified.`,
  ].join("\n");
};

// ========== Helper: Generate Auto Tender Name ==========
const generateAutoTenderName = (tender: any, renovationTypes: DropdownOption[], branches: DropdownOption[]): string => {
  if (!tender) return "";
  const renovationTypeObj = renovationTypes.find(rt => rt.id === tender.renovation_type_id);
  const renovationType = renovationTypeObj?.name || tender.renovation_type || "Renovation";
  const branchObj = branches.find(b => b.id === tender.branch_id);
  const buildingName = branchObj?.name || tender.branch_name || "Location";
  const brandName = tender.brand_name || "";
  const companyDetails = brandName ? getCompanyDetailsByBrand(brandName) : null;
  const brandDisplayName = companyDetails?.companyName || brandName || "Brand";
  return `${renovationType} at ${buildingName} for ${brandDisplayName}`;
};

// ========== Interfaces ==========
interface BriefingDate {
  id?: number;
  briefing_date: string;
  description: string | null;
}

interface Tender {
  tender_id: number;
  tender_name: string;
  tender_description: string | null;
  status_id: number;
  branch_id: number;
  renovation_type_id: number;
  project_manager_id: number | null;
  project_manager_name?: string | null;
  project_manager_email?: string | null;
  project_manager_phone?: string | null;
  tender_date?: string | null;
  closing_date?: string | null;
  renovation_start_date?: string | null;
  renovation_end_date?: string | null;
  expected_handover_date?: string | null;
  defect_liability_months?: number | null;
  estimated_budget?: number | null;
  brand_name: string;
  branch_name: string;
  renovation_type?: string | null;
  briefing_dates?: BriefingDate[];
  clauses?: {
    critical: { title: string; description: string }[];
    scope: { title: string; description: string }[];
    terms: { header: string; text: string }[];
  };
}

interface DropdownOption {
  id: number;
  name: string;
}

const CONTENT_SECTIONS = [
  { id: "critical", label: "Critical Considerations" },
  { id: "scope", label: "Scope of Contract" },
  { id: "terms", label: "Terms & Conditions" },
];

// ========== Briefing Dates Component ==========
function BriefingDatesEditor({
  briefingDates,
  onChange,
}: {
  briefingDates: BriefingDate[];
  onChange: (dates: BriefingDate[]) => void;
}) {
  const addBriefingDate = () => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    const newDate: BriefingDate = {
      id: Date.now(),
      briefing_date: localDateTime,
      description: "",
    };
    onChange([...briefingDates, newDate]);
  };

  const removeBriefingDate = (id: number) => {
    onChange(briefingDates.filter(d => d.id !== id));
  };

  const updateBriefingDate = (id: number, field: keyof BriefingDate, value: string) => {
    onChange(
      briefingDates.map(d => 
        d.id === id ? { ...d, [field]: value } : d
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="block font-semibold text-slate-700">
            Briefing Dates
          </label>
          <p className="text-xs text-slate-400">
            Add multiple briefing dates with optional descriptions
          </p>
        </div>
        <button
          type="button"
          onClick={addBriefingDate}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Date
        </button>
      </div>

      {briefingDates.length === 0 && (
        <div className="text-center py-4 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-400">
            No briefing dates added yet.
          </p>
        </div>
      )}

      {briefingDates.map((briefing, index) => (
        <div 
          key={briefing.id} 
          className="relative p-3 bg-slate-50 rounded-lg border border-slate-200"
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
                value={briefing.briefing_date}
                onChange={(e) => updateBriefingDate(briefing.id!, "briefing_date", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={briefing.description || ""}
                onChange={(e) => updateBriefingDate(briefing.id!, "description", e.target.value)}
                placeholder="e.g., Site walkthrough, Q&A session, etc."
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ========== Main Component ==========
export default function AdminEditTenderPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const toast = useNotify();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"metadata" | "content">("metadata");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);

  const criticalRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const termsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = { critical: criticalRef, scope: scopeRef, terms: termsRef };

  const [formData, setFormData] = useState<Tender | null>(null);
  const [criticalClauses, setCriticalClauses] = useState(DEFAULT_CRITICAL);
  const [scopeClauses, setScopeClauses] = useState(DEFAULT_SCOPE);
  const [termsClauses, setTermsClauses] = useState(DEFAULT_TERMS);

  const [statuses, setStatuses] = useState<DropdownOption[]>([]);
  const [branches, setBranches] = useState<DropdownOption[]>([]);
  const [renovationTypes, setRenovationTypes] = useState<DropdownOption[]>([]);
  const [projectManagers, setProjectManagers] = useState<DropdownOption[]>([]);
  const [pmContacts, setPmContacts] = useState<{ id: number; name: string; email: string; phone: string | null }[]>([]);

  const userRoleIds = (session?.user as any)?.roleIds || [];
  const isAdmin = isSuperUser(userRoleIds);
  const isLegal = userRoleIds.includes(ROLE_IDS.LEGAL_TEAM);

  const canEditMetadata = isAdmin;
  const canEditContent = isAdmin || isLegal;
  const canEditDynamicClauses = isAdmin;

  // ===== Update dynamic clauses =====
  const updateDynamicClauses = (tenderData: Tender) => {
    setCriticalClauses((prev) => {
      const updated = [...prev];
      const datesIdx = updated.findIndex((c) => c.title === "2) CRITICAL DATES");
      if (datesIdx !== -1) {
        const autoDesc = generateCriticalDatesDescription(tenderData);
        const currentDesc = updated[datesIdx].description || "";
        if (!currentDesc || currentDesc === autoDesc) {
          updated[datesIdx].description = autoDesc;
        }
      }
      const enquiriesIdx = updated.findIndex((c) => c.title === "4) TENDER ENQUIRIES");
      if (enquiriesIdx !== -1) {
        const autoDesc = generateTenderEnquiriesDescription(tenderData);
        const currentDesc = updated[enquiriesIdx].description || "";
        if (!currentDesc || currentDesc === autoDesc) {
          updated[enquiriesIdx].description = autoDesc;
        }
      }
      return updated;
    });
  };

  const resetDynamicClause = (title: string) => {
    if (!formData) return;
    setCriticalClauses((prev) => {
      const idx = prev.findIndex((c) => c.title === title);
      if (idx === -1) return prev;
      const updated = [...prev];
      if (title === "2) CRITICAL DATES") {
        updated[idx].description = generateCriticalDatesDescription(formData);
      } else if (title === "4) TENDER ENQUIRIES") {
        updated[idx].description = generateTenderEnquiriesDescription(formData);
      }
      return updated;
    });
  };

  // ===== Auth & fetch =====
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
    } else if (sessionStatus === "authenticated" && !canEditMetadata && !canEditContent) {
      router.push("/unauthorized");
    }
  }, [sessionStatus, canEditMetadata, canEditContent, router]);

  const parseOptions = (data: any, idKeys: string[], nameKeys: string[]): DropdownOption[] => {
    let items = Array.isArray(data) ? data : data?.data ?? data?.results ?? [];
    if (!Array.isArray(items)) {
      console.warn("parseOptions received non-array data:", data);
      return [];
    }
    return items.map((item) => {
      let id: number | null = null;
      let name: string | null = null;
      for (const key of idKeys) {
        if (item?.[key] !== undefined && item?.[key] !== null) {
          id = Number(item[key]);
          break;
        }
      }
      for (const key of nameKeys) {
        if (item?.[key] !== undefined && item?.[key] !== null) {
          name = String(item[key]);
          break;
        }
      }
      return { id: id ?? 0, name: name ?? "Unknown" };
    });
  };

  // Fetch tender data
  useEffect(() => {
    if (!id || !(canEditMetadata || canEditContent)) return;

    const fetchData = async () => {
      try {
        const [tenderRes, statusRes, branchRes, pmRes, typeRes] = await Promise.all([
          fetch(`/api/tenders/${id}`),
          fetch("/api/tender-statuses"),
          fetch("/api/branches"),
          fetch("/api/project-managers"),
          fetch("/api/renovation-types"),
        ]);

        if (!tenderRes.ok) throw new Error("Failed to fetch tender");
        const tender = await tenderRes.json();
        setFormData({
          ...tender,
          briefing_dates: Array.isArray(tender.briefing_dates)
            ? tender.briefing_dates.map((d: any) => ({
                id: d.id,
                briefing_date: isoToLocalDateTime(d.briefing_date),
                description: d.description || "",
              }))
            : [],
        });

        if (tender.clauses && typeof tender.clauses === "object") {
          setCriticalClauses(
            Array.isArray(tender.clauses.critical) && tender.clauses.critical.length > 0
              ? tender.clauses.critical
              : DEFAULT_CRITICAL
          );
          setScopeClauses(
            Array.isArray(tender.clauses.scope) && tender.clauses.scope.length > 0
              ? tender.clauses.scope
              : DEFAULT_SCOPE
          );
          setTermsClauses(
            Array.isArray(tender.clauses.terms) && tender.clauses.terms.length > 0
              ? tender.clauses.terms
              : DEFAULT_TERMS
          );
        } else {
          setCriticalClauses(DEFAULT_CRITICAL);
          setScopeClauses(DEFAULT_SCOPE);
          setTermsClauses(DEFAULT_TERMS);
        }

        updateDynamicClauses(tender);

        // Prefer the PM's current, live contact details (joined in the same
        // tender response as project_manager_*_joined) over the tender's own
        // denormalized snapshot, in case the PM's info changed since this
        // tender was last saved. No extra fetch needed - the data is already
        // in `tender` from the request above.
        if (tender.project_manager_id) {
          setFormData((prev) =>
            prev
              ? {
                  ...prev,
                  project_manager_name: tender.project_manager_name_joined || prev.project_manager_name || "",
                  project_manager_email: tender.project_manager_email_joined || prev.project_manager_email || "",
                  project_manager_phone: tender.project_manager_phone_joined || prev.project_manager_phone || "",
                }
              : null
          );
        }

        const statusData = await statusRes.json();
        const branchData = await branchRes.json();
        const pmData = await pmRes.json();
        const typeData = await typeRes.json();

        setStatuses(parseOptions(statusData, ["status_id", "id"], ["label", "status_code", "name"]));
        setBranches(parseOptions(branchData, ["branch_id", "id"], ["branch_name", "name"]));
        setProjectManagers(parseOptions(pmData, ["id", "project_manager_id"], ["name", "full_name"]));
        setPmContacts(Array.isArray(pmData) ? pmData : []);
        setRenovationTypes(parseOptions(typeData, ["type_id", "id"], ["type_name", "name"]));

        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load data");
        setLoading(false);
      }
    };

    fetchData();
  }, [id, canEditMetadata, canEditContent]);

  // ===== Auto-generate name =====
  useEffect(() => {
    if (!formData || branches.length === 0 || renovationTypes.length === 0) return;
    if (isNameManuallyEdited) return;
    const autoName = generateAutoTenderName(formData, renovationTypes, branches);
    if (autoName) {
      if (!formData.tender_name || formData.tender_name === autoName) {
        setFormData((prev) => prev ? { ...prev, tender_name: autoName } : null);
      }
    }
  }, [formData?.branch_id, formData?.renovation_type_id, formData?.brand_name, branches, renovationTypes]);

  useEffect(() => {
    if (activeTab === "content" && formData) {
      updateDynamicClauses(formData);
    }
  }, [activeTab, formData]);

  // ===== Handlers =====
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (!formData) return;
    if (name === "tender_name") {
      setIsNameManuallyEdited(true);
    }
    let parsedValue: any = value;
    if (["status_id", "branch_id", "renovation_type_id"].includes(name)) {
      parsedValue = parseInt(value, 10) || 0;
    } else if (name === "project_manager_id") {
      parsedValue = value ? parseInt(value, 10) : null;
    } else if (name === "defect_liability_months") {
      parsedValue = value ? parseInt(value, 10) : null;
    }
    setFormData({ ...formData, [name]: parsedValue });
  };

  const handlePMChange = (pmId: number | null) => {
    if (!formData) return;
    if (!pmId) {
      setFormData({
        ...formData,
        project_manager_id: null,
        project_manager_name: "",
        project_manager_email: "",
        project_manager_phone: "",
      });
      return;
    }
    // pmContacts is already populated from the same /api/project-managers
    // list that backs this dropdown's options - no extra fetch needed.
    const pmDetail = pmContacts.find((pm) => pm.id === pmId);
    setFormData({
      ...formData,
      project_manager_id: pmId,
      project_manager_name: pmDetail?.name || "",
      project_manager_email: pmDetail?.email || "",
      project_manager_phone: pmDetail?.phone || "",
    });
  };

  // ===== Clause update functions =====
  const updateCriticalClause = (index: number, field: "title" | "description", value: string) => {
    setCriticalClauses((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };
  const updateScopeClause = (index: number, field: "title" | "description", value: string) => {
    setScopeClauses((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };
  const updateTermsClause = (index: number, field: "header" | "text", value: string) => {
    setTermsClauses((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addCriticalClause = () => {
    setCriticalClauses((prev) => [...prev, { title: "", description: "" }]);
  };
  const addScopeClause = () => {
    setScopeClauses((prev) => [...prev, { title: "", description: "" }]);
  };
  const addTermsClause = () => {
    setTermsClauses((prev) => [...prev, { header: "", text: "" }]);
  };

  const removeCriticalClause = (index: number) => {
    setCriticalClauses((prev) => prev.filter((_, i) => i !== index));
  };
  const removeScopeClause = (index: number) => {
    setScopeClauses((prev) => prev.filter((_, i) => i !== index));
  };
  const removeTermsClause = (index: number) => {
    setTermsClauses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNightWorkToggle = (checked: boolean) => {
    if (checked) {
      const hasNote = criticalClauses.some((c) => c.title === "Refurbishment period");
      if (!hasNote) {
        setCriticalClauses((prev) => [
          ...prev,
          { title: "Refurbishment period", description: "* Refurbishment period is purely night work only." },
        ]);
      }
    } else {
      setCriticalClauses((prev) => prev.filter((c) => c.title !== "Refurbishment period"));
    }
  };


  const scrollToSection = (sectionId: string) => {
    const ref = sectionRefs[sectionId as keyof typeof sectionRefs];
    if (ref && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setSidebarOpen(false);
    }
  };

  const projectManagerOptions = useMemo(() => {
    const options = [...projectManagers];
    if (formData?.project_manager_id && !options.some((opt) => opt.id === formData.project_manager_id)) {
      const name = formData.project_manager_name || `ID: ${formData.project_manager_id}`;
      options.push({ id: formData.project_manager_id, name });
      options.sort((a, b) => {
        if (a.id === formData.project_manager_id) return -1;
        if (b.id === formData.project_manager_id) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    return options;
  }, [projectManagers, formData]);

  // ===== Submit handler =====
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    setSaving(true);
    setValidationErrors(null);

    const basePayload: any = {
      clauses: {
        critical: criticalClauses,
        scope: scopeClauses,
        terms: termsClauses,
      },
    };

    if (canEditMetadata) {
      const metadataFields = [
        "tender_name",
        "tender_description",
        "status_id",
        "branch_id",
        "renovation_type_id",
        "project_manager_id",
        "project_manager_name",
        "project_manager_email",
        "project_manager_phone",
        "tender_date",
        "closing_date",
        "renovation_start_date",
        "renovation_end_date",
        "expected_handover_date",
        "defect_liability_months",
      ] as const;

      const dateTimeFields = new Set([
        "tender_date", "closing_date", "renovation_start_date", "renovation_end_date",
      ]);

      for (const field of metadataFields) {
        const value = formData[field as keyof Tender];
        if (!(field in formData) || value === undefined || value === null) continue;
        if (dateTimeFields.has(field) && typeof value === "string") {
          const parsed = new Date(value);
          basePayload[field] = !isNaN(parsed.getTime()) ? parsed.toISOString() : value;
        } else {
          basePayload[field] = value;
        }
      }

      // Add briefing dates
      if (formData.briefing_dates) {
        basePayload.briefing_dates = formData.briefing_dates.map(d => {
          const parsed = new Date(d.briefing_date);
          return {
            date: !isNaN(parsed.getTime()) ? parsed.toISOString() : d.briefing_date,
            description: d.description || "",
          };
        });
      }
    }

    try {
      const res = await fetch(`/api/tenders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
      });

      const responseData = await res.json();

      if (!res.ok) {
        if (responseData.details) {
          setValidationErrors(responseData.details);
          const errorMessages = responseData.details
            .map((e: any) => `${e.path}: ${e.message}`)
            .join("\n");
          throw new Error(`Validation failed:\n${errorMessages}`);
        }
        throw new Error(responseData.error || "Update failed");
      }

      setLastSaved(new Date().toLocaleString());
      toast.success("Tender updated successfully!");
      router.push(`/tenders/${id}`);
    } catch (err: any) {
      console.error("Submit error:", err);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ===== Loading & error =====
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading tender data...</div>
      </div>
    );
  }
  if (error || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="bg-red-100 text-red-800 p-6 rounded-xl max-w-md">
          <p className="font-bold">Error</p>
          <p>{error || "Tender not found"}</p>
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ========== RENDER ==========
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/tenders/${id}`}
              className="text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold text-slate-800">
              Edit Tender #{formData.tender_id}
            </h1>
            {lastSaved && (
              <span className="text-xs text-slate-400 hidden sm:inline">
                Last saved: {lastSaved}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.open(`/tenders/${id}`, "_blank")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
            <button
              type="submit"
              form="tender-form"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#15406a] hover:bg-[#0d2d4a] text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 mb-6">
          {canEditMetadata && (
            <button
              onClick={() => setActiveTab("metadata")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "metadata"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Metadata
            </button>
          )}
          {canEditContent && (
            <button
              onClick={() => setActiveTab("content")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "content"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Document Content
            </button>
          )}
        </div>

        {validationErrors && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold">Validation Errors:</p>
            <ul className="list-disc list-inside text-sm text-red-700">
              {validationErrors.map((err: any, idx: number) => (
                <li key={idx}>
                  <span className="font-mono">{err.path}</span>: {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form id="tender-form" onSubmit={handleSubmit}>
          {/* ===== METADATA TAB ===== */}
          {activeTab === "metadata" && canEditMetadata && (
            <div className="space-y-5 bg-white p-6 rounded-xl shadow-sm">
              {/* Tender Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="tender_name" className="block font-semibold text-slate-700">
                    Tender Name *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {isNameManuallyEdited ? "✏️ Manually edited" : "🔄 Auto-generated"}
                    </span>
                    {isNameManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNameManuallyEdited(false);
                          const autoName = generateAutoTenderName(formData, renovationTypes, branches);
                          if (autoName) {
                            setFormData((prev) => prev ? { ...prev, tender_name: autoName } : null);
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Reset to auto
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    id="tender_name"
                    name="tender_name"
                    value={formData.tender_name || ""}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {!isNameManuallyEdited && branches.length > 0 && renovationTypes.length > 0 && (
                    <div className="text-xs text-slate-400 mt-1">
                      Auto-generated: <span className="font-medium text-slate-600">{generateAutoTenderName(formData, renovationTypes, branches)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="tender_description" className="block font-semibold mb-1 text-slate-700">
                  Description
                </label>
                <textarea
                  id="tender_description"
                  name="tender_description"
                  value={formData.tender_description || ""}
                  onChange={handleChange}
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="status_id" className="block font-semibold mb-1 text-slate-700">
                    Status
                  </label>
                  <select
                    id="status_id"
                    name="status_id"
                    value={formData.status_id || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select status</option>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="branch_id" className="block font-semibold mb-1 text-slate-700">
                    Branch
                  </label>
                  <select
                    id="branch_id"
                    name="branch_id"
                    value={formData.branch_id || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="renovation_type_id" className="block font-semibold mb-1 text-slate-700">
                    Renovation Type
                  </label>
                  <select
                    id="renovation_type_id"
                    name="renovation_type_id"
                    value={formData.renovation_type_id || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select type</option>
                    {renovationTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Project Manager */}
              <div className="border-t border-slate-200 pt-4 mt-2">
                <h3 className="text-md font-semibold text-slate-700 mb-3">Project Manager</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="project_manager_id" className="block font-semibold mb-1 text-slate-700">
                      Select Manager
                    </label>
                    <select
                      id="project_manager_id"
                      name="project_manager_id"
                      value={formData.project_manager_id ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const pmId = val ? parseInt(val, 10) : null;
                        handlePMChange(pmId);
                      }}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">None</option>
                      {projectManagerOptions.map((pm) => (
                        <option key={pm.id} value={pm.id}>
                          {pm.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      Select a manager to pre‑fill the fields below, or type manually.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="project_manager_name" className="block font-semibold mb-1 text-slate-700">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="project_manager_name"
                      name="project_manager_name"
                      value={formData.project_manager_name || ""}
                      onChange={handleChange}
                      placeholder="e.g. Mr. Jack Puan"
                      className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="project_manager_email" className="block font-semibold mb-1 text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      id="project_manager_email"
                      name="project_manager_email"
                      value={formData.project_manager_email || ""}
                      onChange={handleChange}
                      placeholder="e.g. jack@company.com"
                      className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="project_manager_phone" className="block font-semibold mb-1 text-slate-700">
                      Phone / Mobile
                    </label>
                    <input
                      type="text"
                      id="project_manager_phone"
                      name="project_manager_phone"
                      value={formData.project_manager_phone || ""}
                      onChange={handleChange}
                      placeholder="e.g. 8139 0348"
                      className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.tender_date !== undefined && (
                  <DateTimePicker
                    label="Tender Start"
                    name="tender_date"
                    value={isoToLocalDateTime(formData.tender_date)}
                    onChange={handleChange}
                  />
                )}
                {formData.closing_date !== undefined && (
                  <DateTimePicker
                    label="Closing Date"
                    name="closing_date"
                    value={isoToLocalDateTime(formData.closing_date)}
                    onChange={handleChange}
                  />
                )}
                {formData.renovation_start_date !== undefined && (
                  <DateTimePicker
                    label="Renovation Start"
                    name="renovation_start_date"
                    value={isoToLocalDateTime(formData.renovation_start_date)}
                    onChange={handleChange}
                  />
                )}
                {formData.renovation_end_date !== undefined && (
                  <DateTimePicker
                    label="Renovation End"
                    name="renovation_end_date"
                    value={isoToLocalDateTime(formData.renovation_end_date)}
                    onChange={handleChange}
                  />
                )}
                {formData.expected_handover_date !== undefined && (
                  <DatePicker
                    label={<>Expected Handover Date <span className="font-normal text-slate-400">(planning estimate)</span></>}
                    name="expected_handover_date"
                    value={formData.expected_handover_date ? formData.expected_handover_date.slice(0, 10) : ""}
                    onChange={handleChange}
                  />
                )}
                {formData.defect_liability_months !== undefined && (
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
                      value={formData.defect_liability_months ?? ""}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Briefing Dates Editor */}
              <div className="border-t border-slate-200 pt-4">
                <BriefingDatesEditor
                  briefingDates={formData.briefing_dates || []}
                  onChange={(dates) => setFormData({ ...formData, briefing_dates: dates })}
                />
              </div>
            </div>
          )}

          {/* ===== CONTENT TAB ===== */}
          {activeTab === "content" && canEditContent && (
            <div className="flex flex-col md:flex-row gap-6">
              {/* Sidebar */}
              <div className="md:w-56 flex-shrink-0">
                <div className="md:sticky md:top-24">
                  <div className="md:hidden mb-3">
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
                    >
                      {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                      {sidebarOpen ? "Close" : "Navigation"}
                    </button>
                  </div>
                  <nav className={`${sidebarOpen ? "block" : "hidden"} md:block bg-white rounded-xl shadow-sm border border-slate-200 p-3`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 px-2">Sections</p>
                    <ul className="space-y-1">
                      {CONTENT_SECTIONS.map((section) => (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => scrollToSection(section.id)}
                            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            {section.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <hr className="my-3 border-slate-200" />
                    <div className="px-2 text-xs text-slate-400">
                      <p>💡 Empty descriptions show as <span className="font-mono">—</span></p>
                    </div>
                  </nav>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm">
                  <p className="flex items-start gap-2">
                    <span className="text-lg">ℹ️</span>
                    <span>
                      <strong>Note:</strong> Any field left empty will display a dash <span className="font-mono bg-blue-100 px-1 rounded">—</span> in the final tender document.
                    </span>
                  </p>
                </div>

                {/* CRITICAL CONSIDERATIONS */}
                <div ref={criticalRef} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">SCHEDULE OF CRITICAL PROJECT CONSIDERATIONS</h2>
                  <p className="text-sm text-slate-500 mt-1 mb-4">Edit the critical clauses. Dynamic clauses (2 & 4) are auto‑filled from metadata – you can edit or reset them.</p>
                  <div className="space-y-4">
                    {criticalClauses.map((clause, idx) => {
                      const isDynamic = clause.title === "2) CRITICAL DATES" || clause.title === "4) TENDER ENQUIRIES";
                      const canEditThisClause = !isDynamic || canEditDynamicClauses;

                      return (
                        <div key={idx} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex gap-2 mb-2 items-center">
                            <input
                              value={clause.title || ""}
                              onChange={(e) => updateCriticalClause(idx, "title", e.target.value)}
                              placeholder="Title (e.g. 1) TENDER DOCUMENTS)"
                              className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                              readOnly={!canEditThisClause}
                            />
                            {isDynamic && canEditDynamicClauses && (
                              <button
                                type="button"
                                onClick={() => resetDynamicClause(clause.title)}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 whitespace-nowrap"
                                title="Reset to auto-filled content from metadata"
                              >
                                <RotateCw className="w-3 h-3" />
                                Reset
                              </button>
                            )}
                            {(canEditThisClause || isAdmin) && (
                              <button
                                type="button"
                                onClick={() => removeCriticalClause(idx)}
                                className="text-red-500 hover:text-red-700 transition-colors px-2"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <textarea
                            value={clause.description || ""}
                            onChange={(e) => updateCriticalClause(idx, "description", e.target.value)}
                            placeholder="Type the description here..."
                            rows={6}
                            style={{ minHeight: "120px" }}
                            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            readOnly={!canEditThisClause}
                          />
                          {isDynamic && (
                            <div className="text-xs text-slate-400 mt-1">
                              {canEditDynamicClauses
                                ? "Auto‑filled from metadata – you can edit or reset."
                                : "Auto‑filled from metadata – only Administrators can modify this clause."}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={addCriticalClause}
                    className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    + Add Clause
                  </button>
                  <div className="mt-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={criticalClauses.some((c) => c.title === "Refurbishment period")}
                        onChange={(e) => handleNightWorkToggle(e.target.checked)}
                      />
                      Include night‑work note (only for night projects)
                    </label>
                  </div>
                </div>

                {/* SCOPE OF CONTRACT */}
                <div ref={scopeRef} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">SCOPE OF CONTRACT</h2>
                  <p className="text-sm text-slate-500 mt-1 mb-4">Edit the scope clauses.</p>
                  <div className="space-y-4">
                    {scopeClauses.map((clause, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex gap-2 mb-2">
                          <input
                            value={clause.title || ""}
                            onChange={(e) => updateScopeClause(idx, "title", e.target.value)}
                            placeholder="Title (e.g. 1) SCOPE OF WORKS)"
                            className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeScopeClause(idx)}
                            className="text-red-500 hover:text-red-700 transition-colors px-2"
                          >
                            ✕
                          </button>
                        </div>
                        <textarea
                          value={clause.description || ""}
                          onChange={(e) => updateScopeClause(idx, "description", e.target.value)}
                          placeholder="Type the description here..."
                          rows={6}
                          style={{ minHeight: "120px" }}
                          className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addScopeClause}
                    className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    + Add Clause
                  </button>
                </div>

                {/* TERMS AND CONDITIONS */}
                <div ref={termsRef} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">TERMS AND CONDITIONS OF TENDER</h2>
                  <p className="text-sm text-slate-500 mt-1 mb-4">Edit the terms and conditions.</p>
                  <div className="space-y-4">
                    {termsClauses.map((clause, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex gap-2 mb-2">
                          <input
                            value={clause.header || ""}
                            onChange={(e) => updateTermsClause(idx, "header", e.target.value)}
                            placeholder="Header (e.g. 1) General)"
                            className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeTermsClause(idx)}
                            className="text-red-500 hover:text-red-700 transition-colors px-2"
                          >
                            ✕
                          </button>
                        </div>
                        <textarea
                          value={clause.text || ""}
                          onChange={(e) => updateTermsClause(idx, "text", e.target.value)}
                          placeholder="Type the text here..."
                          rows={6}
                          style={{ minHeight: "120px" }}
                          className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addTermsClause}
                    className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    + Add Clause
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}