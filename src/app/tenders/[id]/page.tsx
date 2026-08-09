"use client";

import { useEffect, useState, useRef, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useNotify } from "@/components/ui/notification-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  FileSignature,
  Printer,
  X,
  ArrowLeft,
  Pencil,
  Clock,
} from "lucide-react";
import dynamic from "next/dynamic";
import { getLogoPath } from "@/lib/brandLogos";
import { getCompanyDetailsByBrand } from "@/lib/companyMapping";
import { DEFAULT_CRITICAL, DEFAULT_SCOPE, DEFAULT_TERMS } from "@/lib/tenderClauses";
import {
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_TEL,
  DEFAULT_COMPANY_FAX,
  DEFAULT_PM_NAME,
  DEFAULT_PM_EMAIL,
  DEFAULT_PM_PHONE,
} from "@/lib/tenderConstants";
import { DATE_LABELS, EXTRA_DATE_NOTES } from "@/lib/tenderDateConfig";
import { FORM_OF_TENDER_ITEMS } from "@/lib/tenderFormItems";
import { ROLE_IDS } from "@/lib/roles";
import { numberToWords } from "@/lib/numberToWords";
import { formatTenderDate, formatTenderDateTime, formatTenderDateLong } from "@/lib/dateUtils";
import { computeDlpExpiry, getDlpStatus } from "@/lib/dlp";
import { getDlpStatusBadgeStyle, getDlpStatusLabel } from "@/lib/statusColors";
import { SignaturePad } from "@/components/tenders/SignaturePad";
import { CompanyStampUpload } from "@/components/tenders/CompanyStampUpload";
import TenderMessagesPanel from "@/components/tenders/TenderMessagesPanel";
import AlertModal, { AlertModalData } from "@/components/ui/AlertModal";

const PrintDateCleanup = dynamic(() => import("@/components/PrintDateCleanup"), { ssr: false });

// ========== Types ==========
interface ProjectRow {
  id: string;
  projectName: string;
  value: string;
  date: string;
  designer: string;
}
interface CommitmentRow {
  id: string;
  projectName: string;
  value: string;
  percentage: string;
  designer: string;
}
interface TenderData {
  tender_id: number;
  tender_name: string;
  tender_description: string;
  branch_name: string;
  branch_address?: string | null;
  branch_full_address?: string | null;
  branch_building_name?: string | null;
  branch_postal_code?: string | null;
  branch_city?: string | null;
  branch_country?: string | null;
  brand_name: string;
  brand_address?: string | null;
  brand_attn_person?: string | null;
  brand_attn_email?: string | null;
  brand_phone?: string | null;
  renovation_type: string;
  status_label: string;
  status_id?: number;
  technical_opening_time?: string | null;
  commercial_opening_time?: string | null;
  tender_date?: string | null;
  closing_date?: string | null;
  renovation_start_date?: string | null;
  renovation_end_date?: string | null;
  download_start?: string | null;
  download_end?: string | null;
  briefing_date?: string | null;
  submission_start?: string | null;
  submission_end?: string | null;
  project_manager_name?: string | null;
  project_manager_phone?: string | null;
  project_manager_email?: string | null;
  expected_handover_date?: string | null;
  handover_date?: string | null;
  defect_liability_months?: number | null;
  handover_by_name?: string | null;
  handover_notes?: string | null;
  clauses?: {
    critical: { title: string; description: string }[];
    scope: { title: string; description: string }[];
    terms: { header: string; text: string }[];
  };
  stage: number;
  stage_updated_at?: string;
}

// ========== STAGE HELPERS ==========
const STAGES = ["Upcoming", "Open", "Closed", "Awarded"];

const getStageName = (stage: number): string => {
  if (stage < 0 || stage >= STAGES.length) return "Unknown";
  return STAGES[stage];
};

// ========== Read-only document field renderers ==========
// This page only ever renders in read-only mode (see `readOnly` in the main
// component below) — these always show the static text/print-friendly
// display rather than an editable input.
const renderStaticOrInput = (value: string, placeholder?: string) => (
  <span className="block text-slate-800 py-1 text-sm sm:text-base print:border-b print:border-black print:pb-1 print:min-w-[200px]">
    {value || placeholder || "—"}
  </span>
);

const renderStaticTextarea = (value: string, placeholder?: string) => (
  <div className="text-slate-800 py-1 whitespace-pre-wrap text-sm sm:text-base print:border-b print:border-black print:pb-1">
    {value || placeholder || "—"}
  </div>
);

const singleLineLabelClass = "font-bold block mb-1 text-slate-800 text-sm sm:text-base";

const SingleLineInput = memo(
  ({
    label,
    value,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange?: (val: string) => void;
    type?: string;
    placeholder?: string;
  }) => (
    <div className="print-field-row flex flex-col space-y-1 w-full">
      <label className={singleLineLabelClass}>{label}</label>
      {renderStaticOrInput(value, placeholder)}
    </div>
  )
);
SingleLineInput.displayName = "SingleLineInput";

const FillableAddress = memo(
  ({
    label,
    value,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange?: (val: string) => void;
    placeholder?: string;
  }) => (
    <div className="print-field-row flex flex-col space-y-1 w-full mt-4 print:mt-6">
      <label className="text-xs font-bold text-slate-800 uppercase print:text-black print:text-xs">{label}</label>
      {renderStaticTextarea(value, placeholder)}
      <div className="hidden print:block">
        <div className="w-full print-address-line" style={{ height: "18pt", marginBottom: "2pt" }} />
        <div className="w-full print-address-line" style={{ height: "18pt" }} />
      </div>
    </div>
  )
);
FillableAddress.displayName = "FillableAddress";

// ========== MAIN COMPONENT ==========
export default function TenderDocumentPage() {
  const router = useRouter();
  const { id } = useParams();
  const { data: session, status: sessionStatus } = useSession();

  const [tender, setTender] = useState<TenderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accordionOpen, setAccordionOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("project-team");

  // ---- form state ----
  const [agreedName, setAgreedName] = useState("");
  const [agreedDate, setAgreedDate] = useState("");
  const [agreedSignature, setAgreedSignature] = useState<string | null>(null);
  const [agreedStampPreview, setAgreedStampPreview] = useState<string | null>(null);
  const [lumpSumRaw, setLumpSumRaw] = useState("");
  const [amountInWords, setAmountInWords] = useState("");
  const [mainSignature, setMainSignature] = useState<string | null>(null);
  const [mainStampPreview, setMainStampPreview] = useState<string | null>(null);
  const [witnessSignature, setWitnessSignature] = useState<string | null>(null);
  const [declarationSignature, setDeclarationSignature] = useState<string | null>(null);
  const [declarationStampPreview, setDeclarationStampPreview] = useState<string | null>(null);

  const [mainAddress, setMainAddress] = useState("");
  const [witnessAddress, setWitnessAddress] = useState("");
  const [tendererAddress, setTendererAddress] = useState("");

  const [mainTenderer, setMainTenderer] = useState({ fullName: "", position: "", companyName: "", date: "" });
  const [witness, setWitness] = useState({ fullName: "", date: "" });
  const [declaration, setDeclaration] = useState({ iName: "", onBehalfOf: "", name: "", date: "" });

  const [projectRows, setProjectRows] = useState<ProjectRow[]>(
    Array(5)
      .fill(null)
      .map(() => ({ id: crypto.randomUUID(), projectName: "", value: "", date: "", designer: "" }))
  );
  const [commitmentRows, setCommitmentRows] = useState<CommitmentRow[]>(
    Array(5)
      .fill(null)
      .map(() => ({ id: crypto.randomUUID(), projectName: "", value: "", percentage: "", designer: "" }))
  );

  const sectionsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const [isMounted, setIsMounted] = useState(false);

  const userRoleIds = (session?.user as any)?.roleIds || [];
  const userRole = (session?.user as any)?.role_id;
  const isAdmin = userRoleIds.includes(ROLE_IDS.ADMIN);
  const isContractor = userRoleIds.includes(ROLE_IDS.CONTRACTOR);
  const canManageStage = userRole === ROLE_IDS.ADMIN;
  const readOnly = true;

  // ---- Alert modal state ----
  const [alert, setAlert] = useState<AlertModalData | null>(null);

  // ---- Extension request state ----
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionDays, setExtensionDays] = useState<number>(1);
  const [isSubmittingExtension, setIsSubmittingExtension] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<{
    status: string;
    requestedDays?: number;
    reason?: string;
    createdAt?: string;
  } | null>(null);

  // ---- Stage update state ----
  const [updatingStage, setUpdatingStage] = useState(false);

  // ---- fetch tender data ----
  const fetchTender = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tenders/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load tender");
      }
      const data = await res.json();
      setTender(data);
      if (data.tender_id) {
        fetchExtensionStatus(data.tender_id);
        if (isContractor) fetchMySubmission(data.tender_id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setAlert({
        type: "error",
        title: "Unable to Load Tender",
        message: "We couldn't retrieve the tender details. Please refresh the page.",
        details: "If the problem persists, contact your system administrator.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (id) fetchTender();
  }, [id, sessionStatus, router]);

  // ---- fetch extension status ----
  const fetchExtensionStatus = async (tenderId: number) => {
    try {
      const res = await fetch(`/api/tender-extension?tender_id=${tenderId}`);
      if (res.ok) {
        const data = await res.json();
        setExtensionStatus(data);
      }
    } catch (e) {
      // ignore
    }
  };

  // ---- fetch and populate the current contractor's own submitted data ----
  // (this page is otherwise a permanently-blank template — a contractor who
  // already submitted digitally should see what they actually submitted)
  const fetchMySubmission = async (tenderId: number) => {
    try {
      const res = await fetch(`/api/tenders/${tenderId}/my-submission`);
      if (!res.ok) return;
      const { submission } = await res.json();
      const data = submission?.data;
      if (!data) return;

      setAgreedName(data.agreedName || "");
      setAgreedDate(data.agreedDate || "");
      setAgreedSignature(data.agreedSignature || null);
      setAgreedStampPreview(data.agreedStampPreview || null);
      setLumpSumRaw(data.lumpSumRaw || "");
      setAmountInWords(data.amountInWords || "");
      setMainStampPreview(data.stampPreview || null);
      setDeclarationStampPreview(data.declarationStampPreview || null);

      if (data.mainTenderer) {
        setMainTenderer({
          fullName: data.mainTenderer.fullName || "",
          position: data.mainTenderer.position || "",
          companyName: data.mainTenderer.companyName || "",
          date: data.mainTenderer.date || "",
        });
        setMainSignature(data.mainTenderer.signature || null);
        setMainAddress(data.mainTenderer.address || "");
      }
      if (data.witness) {
        setWitness({ fullName: data.witness.fullName || "", date: data.witness.date || "" });
        setWitnessSignature(data.witness.signature || null);
        setWitnessAddress(data.witness.address || "");
      }
      if (data.declaration) {
        setDeclaration({
          iName: data.declaration.iName || "",
          onBehalfOf: data.declaration.onBehalfOf || "",
          name: data.declaration.name || "",
          date: data.declaration.date || "",
        });
        setDeclarationSignature(data.declaration.signature || null);
        setTendererAddress(data.declaration.address || "");
      }
      if (Array.isArray(data.projectExperience) && data.projectExperience.length > 0) {
        setProjectRows(
          data.projectExperience.map((r: any) => ({
            id: r.id || crypto.randomUUID(),
            projectName: r.projectName || "",
            value: r.value || "",
            date: r.date || "",
            designer: r.designer || "",
          }))
        );
      }
      if (Array.isArray(data.currentCommitment) && data.currentCommitment.length > 0) {
        setCommitmentRows(
          data.currentCommitment.map((r: any) => ({
            id: r.id || crypto.randomUUID(),
            projectName: r.projectName || "",
            value: r.value || "",
            percentage: r.percentage || "",
            designer: r.designer || "",
          }))
        );
      }
    } catch (e) {
      console.error("Failed to load submitted data:", e);
    }
  };

  // ---- can request extension? ----
  const canRequestExtension = (): boolean => {
    if (!tender) return false;
    if (!isContractor) return false;
    if (tender.status_label?.toLowerCase() !== "open") return false;
    if (!tender.closing_date) return false;
    const now = new Date();
    const closing = new Date(tender.closing_date);
    const diffHours = (closing.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours >= 1;
  };

  // ---- handle extension request submission ----
  const handleExtensionSubmit = async () => {
    if (!tender) return;
    if (!extensionReason.trim()) {
      setAlert({
        type: "error",
        title: "Missing Reason",
        message: "Please provide a reason for the extension request.",
      });
      return;
    }
    if (extensionDays < 1) {
      setAlert({
        type: "error",
        title: "Invalid Days",
        message: "The number of days must be at least 1.",
      });
      return;
    }

    setIsSubmittingExtension(true);
    try {
      const res = await fetch("/api/tender-extension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tender_id: tender.tender_id,
          requested_days: extensionDays,
          reason: extensionReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request");
      }
      setAlert({
        type: "success",
        title: "Extension Requested",
        message: "Your request has been submitted for review.",
      });
      setShowExtensionModal(false);
      setExtensionReason("");
      setExtensionDays(1);
      fetchExtensionStatus(tender.tender_id);
    } catch (err: any) {
      setAlert({
        type: "error",
        title: "Submission Failed",
        message: err.message || "Unable to submit your request. Please try again.",
        details: "If the problem persists, contact support.",
      });
    } finally {
      setIsSubmittingExtension(false);
    }
  };

  // ---- handle stage action ----
  const handleStageAction = async (action: "advance" | "revert") => {
    if (!tender) return;
    setUpdatingStage(true);
    try {
      const res = await fetch(`/api/tenders/${tender.tender_id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAlert({
          type: "error",
          title: action === "advance" ? "Advance Failed" : "Revert Failed",
          message: err.error || "Unable to complete the action. Please try again.",
          details: "If the problem persists, contact support.",
        });
      } else {
        setAlert({
          type: "success",
          title: action === "advance" ? "Stage Advanced" : "Stage Reverted",
          message: action === "advance" ? "The tender was moved to the next stage." : "The tender was moved back one stage.",
        });
        await fetchTender(); // reload
      }
    } catch {
      setAlert({
        type: "error",
        title: "Network Error",
        message: "We couldn't connect to the server. Please check your internet connection.",
        details: "Try again later or contact support if the problem continues.",
      });
    } finally {
      setUpdatingStage(false);
    }
  };

  // ---- other effects ----
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const beforePrint = () => {
      document.querySelectorAll('input[type="date"]').forEach((input) => {
        const dateInput = input as HTMLInputElement;
        if (!dateInput.value) dateInput.classList.add("date-empty");
        else dateInput.classList.remove("date-empty");
      });
    };
    const afterPrint = () => {
      document.querySelectorAll('input[type="date"]').forEach((input) => input.classList.remove("date-empty"));
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [isMounted]);

  // ---- handlers for form fields ----
  const handleLumpSumChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const raw = e.target.value;
    setLumpSumRaw(raw);
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) setAmountInWords(numberToWords(num));
    else setAmountInWords("");
  };
  useEffect(() => {
    const handleScroll = () => {
      const pos = window.scrollY + 150;
      for (const [key, ref] of Object.entries(sectionsRef.current)) {
        if (ref && pos >= ref.offsetTop && pos < ref.offsetTop + ref.offsetHeight) {
          setActiveSection(key);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const scrollTo = (id: string) => {
    const el = sectionsRef.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  };
  const handlePrint = () => window.print();

  // ---- loading & error states ----
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading tender document...
      </div>
    );
  }
  if (error || !tender) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
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

  // ========== BRAND & PROJECT MANAGER MAPPING ==========
  const brandName = tender.brand_name || "";
  const companyDetails = brandName ? getCompanyDetailsByBrand(brandName) : null;

  const clientName = companyDetails?.companyName || brandName || "Company Name";
  const companyAddress = companyDetails?.address || DEFAULT_COMPANY_ADDRESS;
  const companyTel = companyDetails?.tel || DEFAULT_COMPANY_TEL;
  const companyFax = companyDetails?.fax || DEFAULT_COMPANY_FAX;

  const pmName = tender?.project_manager_name || DEFAULT_PM_NAME;
  const pmPhone = tender?.project_manager_phone || DEFAULT_PM_PHONE;
  const pmEmail = tender?.project_manager_email || DEFAULT_PM_EMAIL;

  // ===== NEW: Build the display title =====
  const renovationType = tender?.renovation_type || "Interior Renovation";
  const buildingName = tender?.branch_building_name || tender?.branch_name || "Location";
  const brandDisplayName = companyDetails?.companyName || brandName || "Brand";
  
  // Format: "Renovation Type at Building Name for Brand Name"
  const displayTitle = `${renovationType} at ${buildingName} for ${brandDisplayName}`;

  // ===== NEW: Build the full address =====
  const fullAddress = tender?.branch_full_address || tender?.branch_address || tender?.branch_name || "Address not provided";
  const postalCode = tender?.branch_postal_code || "";
  const city = tender?.branch_city || "Singapore";
  const country = tender?.branch_country || "Singapore";

  // branch_full_address is already a complete, formatted address (postal
  // code and country included) — only append them when falling back to the
  // shorter branch_address/branch_name fields, or we get "...Singapore
  // 569933, 569933, Singapore, Singapore".
  const displayAddress = tender?.branch_full_address
    ? tender.branch_full_address
    : postalCode
    ? `${fullAddress}, ${postalCode}, ${city}, ${country}`
    : `${fullAddress}, ${city}, ${country}`;

  const branchAddress = tender?.branch_address || tender?.branch_name || "Address not provided";
  const logoPath = getLogoPath(brandName);
  const fixedAddress = companyAddress;
  const contactPerson = pmName;
  const contactPosition = "Project Manager";
  const contactPhone = companyTel;
  const contactEmail = pmEmail;

  const tenderRef = tender?.tender_id ? `TEN-${String(tender.tender_id).padStart(4, "0")}` : "TEN-XXXX";

  // ========== DYNAMIC CLAUSES ==========
  const criticalClauses = tender.clauses?.critical || DEFAULT_CRITICAL;
  const scopeClauses = tender.clauses?.scope || DEFAULT_SCOPE;
  const termsConditions = tender.clauses?.terms || DEFAULT_TERMS;

  // ========== Generate CRITICAL DATES HTML ==========
  const generateCriticalDatesHtml = (tenderData: TenderData): string => {
    const lines: string[] = [];

    Object.entries(DATE_LABELS).forEach(([field, label]) => {
      const value = tenderData[field as keyof TenderData];
      if (value !== undefined && value !== null && value !== "") {
        let formatted = "";
        if (field === "briefing_date" || field === "closing_date" || field === "renovation_end_date") {
          formatted = formatTenderDateTime(value as string);
        } else {
          formatted = formatTenderDate(value as string);
        }
        lines.push(`<div><span class='font-semibold'>• ${label}:</span> ${formatted}</div>`);
      }
    });

    lines.push(`<div><span class='font-semibold'>• Anticipated Award of Contract:</span> To be confirmed</div>`);

    EXTRA_DATE_NOTES.forEach((note) => {
      const className = note.includes("*") ? "text-amber-700 mt-2" : "text-slate-700 mt-2";
      lines.push(`<div class='${className}'>${note}</div>`);
    });

    return `<div class='grid grid-cols-1 gap-2 mt-2 text-slate-800'>${lines.join("")}</div>`;
  };

  // ========== TENDER ENQUIRIES (clause 4) ==========
  const renderTenderEnquiries = () => (
    <div className="critical-clause mb-3 break-inside-avoid-page">
      <div className="font-bold text-slate-800">4) TENDER ENQUIRIES</div>
      <div className="ml-4 text-slate-700 space-y-1">
        <p>Any enquiries regarding the Tender Documents should be referred to in writing to:</p>
        <p>
          <strong>{pmName}</strong>
        </p>
        <p>
          <strong>Project Manager</strong>
        </p>
        <p>
          <strong style={{ whiteSpace: "pre-line" }}>{companyAddress}</strong>
        </p>
        <p>
          <strong>Tel: {companyTel}</strong>
        </p>
        <p>
          <strong>Email: {pmEmail}</strong>
        </p>
        <p className="mt-2">
          Any attempt by any Contractors or by any person on his behalf to canvass, solicit or approach any officer from the
          Company and/or its subsidiaries and agent in any matter relating to or arising out of this quotation except seeking
          clarification on the specification shall render the quotation being disqualified.
        </p>
      </div>
    </div>
  );

  const renderTerminologies = () => (
    <div className="mb-2 break-inside-avoid-page">
      <div className="font-bold text-slate-800">2) TERMINOLOGIES</div>
      <div className="ml-4 text-slate-700">
        The Terms “Company” in the contract shall mean {clientName}.
      </div>
    </div>
  );

  // ========== JSX ==========
  return (
    <div className="min-h-screen bg-white text-slate-900 print:bg-white">
      <AlertModal alert={alert} onClose={() => setAlert(null)} />
      <PrintDateCleanup />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 print:py-0">
        {/* COVER PAGE (print only) */}
        <div
          className="hidden print:block print:flex print:flex-col print:items-center print:text-center"
          style={{ pageBreakAfter: "always", height: "100vh", overflow: "hidden", padding: "0 15mm" }}
        >
          <div
            className="print:px-8 print:max-w-2xl print:mx-auto print:w-full print:flex print:flex-col print:justify-center"
            style={{ height: "100%" }}
          >
            <div className="print:mb-6">
              <p className="print:text-7xl print:font-extrabold print:uppercase print:tracking-wider print:text-black">
                TENDER DOCUMENT
              </p>
              <p className="print:text-xl print:font-medium print:text-black print:mt-2">Tender Reference: {tenderRef}</p>
            </div>
            <hr className="print:border-t-2 print:border-black print:my-6 print:w-1/2 print:mx-auto" />
            <div className="print:mb-6">
              <p className="print:text-3xl print:font-bold print:text-black">{displayTitle}</p>
            </div>
            <hr className="print:border-t-2 print:border-black print:my-6 print:w-1/2 print:mx-auto" />
            <div className="print:mb-6">
              <p className="print:text-xl print:font-medium print:text-black">Location:</p>
              <p className="print:text-xl print:font-medium print:text-black print:mt-1">
                {displayAddress.split("\n").map((line, i) => (
                  <span key={i} className="print:block">
                    {line}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>

        {/* ACTION BAR */}
        <div className="print:hidden flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium uppercase tracking-wide">Back</span>
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 rounded hover:bg-slate-100 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            {isAdmin && (
              <Link
                href={`/admin/tenders/${id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-blue-500 rounded hover:bg-blue-50 text-blue-700 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit Tender
              </Link>
            )}
            {isContractor && tender.status_label?.toLowerCase() === "open" ? (
              <>
                <Link
                  href={`/tenders/${id}/edit`}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold uppercase tracking-wide bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors shadow-sm"
                >
                  <FileSignature className="w-4 h-4" />
                  Fill in Tender
                </Link>
                {/* --- Request Extension Button --- */}
                {canRequestExtension() && (
                  <button
                    onClick={() => setShowExtensionModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-blue-500 rounded hover:bg-blue-50 text-blue-700 transition-colors"
                  >
                    <Clock className="w-4 h-4" />
                    Request Extension
                  </button>
                )}
              </>
            ) : isContractor ? (
              <div className="px-4 py-2 text-sm border border-amber-200 bg-amber-50 text-amber-800 rounded">
                Status: <span className="font-mono">{tender.status_label}</span> — Not open for submission
              </div>
            ) : null}

            {/* Show extension status if any */}
            {extensionStatus && extensionStatus.status === "Pending" && (
              <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                Extension Request Pending
              </span>
            )}
            {extensionStatus && extensionStatus.status === "Approved" && (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Extension Approved
              </span>
            )}
            {extensionStatus && extensionStatus.status === "Rejected" && (
              <span className="text-xs text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200">
                Extension Rejected
              </span>
            )}
          </div>
        </div>

        {/* ===== STAGE MANAGEMENT SECTION ===== */}
        {tender && (
          <div className="print:hidden mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-slate-600">Workflow:</span>
                <div className="flex items-center gap-1">
                  {STAGES.map((label, idx) => {
                    const currentStage = tender.stage ?? 0;
                    const isComplete = idx < currentStage;
                    const isActive = idx === currentStage;
                    let dotColor = "bg-slate-300";
                    if (isComplete) dotColor = "bg-emerald-500";
                    else if (isActive) dotColor = "bg-blue-500";
                    return (
                      <div key={idx} className="flex items-center">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                        {idx < STAGES.length - 1 && (
                          <div className={`w-6 h-0.5 ${isComplete ? "bg-emerald-400" : "bg-slate-300"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {getStageName(tender.stage ?? 0)}
                </span>
              </div>
              {canManageStage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStageAction("revert")}
                    disabled={updatingStage || (tender.stage ?? 0) <= 0}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {updatingStage ? "..." : "⬅ Revert"}
                  </button>
                  {(tender.stage ?? 0) < 2 && (
                    <button
                      onClick={() => handleStageAction("advance")}
                      disabled={updatingStage}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {updatingStage ? "..." : (tender.stage === 0 ? "📢 Open Tender" : "🔒 Close Tender")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== DLP (DEFECT LIABILITY PERIOD) STATUS ===== */}
        {/* Expected handover date is a planning estimate set at creation/edit
            time and shown whenever it exists; actual DLP tracking only
            begins once the tender is Awarded and a real handover has been
            recorded — the two dates are deliberately independent. */}
        {tender?.expected_handover_date && (
          <div className="print:hidden mb-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
            Expected handover date (planning estimate): <span className="font-medium text-slate-700">{formatTenderDate(tender.expected_handover_date)}</span>
          </div>
        )}
        {tender && (tender.stage ?? 0) === 3 && (
          <div className="print:hidden mb-6 p-4 bg-white rounded-lg border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Defect Liability Period</h3>
            {!tender.handover_date ? (
              <p className="text-sm text-slate-500">Not yet handed over.</p>
            ) : (
              (() => {
                const months = tender.defect_liability_months ?? 12;
                const expiry = computeDlpExpiry(tender.handover_date, months);
                const { status, daysLeft, daysOverdue } = getDlpStatus(expiry);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Handover date:</span>{" "}
                      <span className="text-slate-900 font-medium">{formatTenderDate(tender.handover_date)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Defect liability period:</span>{" "}
                      <span className="text-slate-900 font-medium">{months} months</span>
                    </div>
                    <div>
                      <span className="text-slate-500">DLP expiry:</span>{" "}
                      <span className="text-slate-900 font-medium">{formatTenderDate(expiry.toISOString())}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Status:</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${getDlpStatusBadgeStyle(status)}`}>
                        {getDlpStatusLabel(status)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {status === "overdue" ? `${daysOverdue} days overdue` : `${daysLeft} days left`}
                      </span>
                    </div>
                    {tender.handover_by_name && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-500">Recorded by:</span>{" "}
                        <span className="text-slate-900 font-medium">{tender.handover_by_name}</span>
                      </div>
                    )}
                    {tender.handover_notes && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-500">Notes:</span>{" "}
                        <span className="text-slate-700">{tender.handover_notes}</span>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* ===== MESSAGES (contractor Q&A + staff announcements) ===== */}
        {tender && (
          <TenderMessagesPanel tenderId={tender.tender_id} tenderName={tender.tender_name} />
        )}

        {/* --- Extension Request Modal --- */}
        <Dialog open={showExtensionModal} onOpenChange={(open) => { if (!open) setShowExtensionModal(false); }}>
          <DialogContent className="max-w-lg p-6 print:hidden">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-6 h-6 text-blue-600" />
                <DialogTitle className="text-xl font-bold text-slate-900">Request Time Extension</DialogTitle>
              </div>
              <DialogDescription className="text-sm text-slate-600 mb-4">
                You are requesting an extension for <strong>{tender.tender_name}</strong>. Current closing date:{" "}
                <strong>{formatTenderDateTime(tender.closing_date)}</strong>.
              </DialogDescription>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Additional Days Required
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={extensionDays}
                    onChange={(e) => setExtensionDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Extension</label>
                  <textarea
                    rows={3}
                    value={extensionReason}
                    onChange={(e) => setExtensionReason(e.target.value)}
                    placeholder="Please provide a detailed reason..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowExtensionModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExtensionSubmit}
                  disabled={isSubmittingExtension}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmittingExtension ? "Submitting..." : "Submit Request"}
                </button>
              </div>
          </DialogContent>
        </Dialog>

        {/* DOCUMENT CONTENT */}
        <div className="flex flex-col md:flex-row gap-8 print:block">
          {/* Sidebar */}
          <aside className="hidden md:block w-64 flex-shrink-0 sticky top-24 self-start print:hidden">
            <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/50 p-4 shadow-lg">
              <h3 className="text-xs font-semibold uppercase text-slate-500 mb-3">Contents</h3>
              <nav className="space-y-1">
                {[
                  { id: "project-team", label: "Project Team" },
                  { id: "critical-considerations", label: "Critical Considerations" },
                  { id: "scope-terms", label: "Scope & Terms" },
                  { id: "form-of-tender", label: "Form of Tender" },
                  { id: "execution", label: "Execution Panels" },
                  { id: "appendix", label: "Experience Tables" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollTo(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                      activeSection === item.id
                        ? "bg-cyan-50 text-cyan-700 font-medium"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <div className="flex-1 space-y-10 print:space-y-8">
            {/* SCREEN HEADER - UPDATED with new title format */}
            <div className="print:hidden mb-8">
              <div className="text-center">
                <p className="text-5xl sm:text-6xl font-extrabold uppercase tracking-wider text-slate-800">
                  TENDER DOCUMENT
                </p>
                <p className="text-lg font-medium text-slate-600 mt-1">Tender Reference: {tenderRef}</p>
                <hr className="border-t-2 border-amber-600 w-24 mx-auto my-4" />
                <div className="text-2xl sm:text-3xl font-light text-slate-800">
                  <p>{displayTitle}</p>
                </div>
                <div className="text-base sm:text-lg font-medium text-slate-600 mt-2">
                  <p>Location:</p>
                  <p className="whitespace-pre-line">{displayAddress}</p>
                </div>
              </div>
            </div>

            {/* PROJECT TEAM */}
            <div
              id="project-team-card"
              className="border border-slate-200/80 bg-slate-50/30 rounded-xl p-4 sm:p-6 lg:p-8 shadow-sm print:border-none print:bg-white print:shadow-none"
            >
              <h2 className="text-lg font-bold text-slate-800 mb-6 print:text-xl print:mb-6">PROJECT TEAM</h2>
              <div className="project-team-grid-wrapper grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 print:grid-cols-2 print:gap-4">
                <div className="space-y-4 print:space-y-2">
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 uppercase print:text-black print:font-bold print:text-[9pt]">
                      Company
                    </label>
                    <span className="text-sm sm:text-base font-semibold text-slate-800 print:text-[10.5pt] print:font-normal">
                      {clientName}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 uppercase print:text-black print:font-bold print:text-[9pt]">
                      Address
                    </label>
                    <span className="text-sm sm:text-base text-slate-800 print:text-[10.5pt]">
                      {companyAddress}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 uppercase print:text-black print:font-bold print:text-[9pt]">
                      Attention
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 print:text-[10.5pt] print:text-black break-words">
                      {pmName}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 uppercase print:text-black print:font-bold print:text-[9pt]">
                      Email
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 print:text-[10.5pt] print:text-black break-words">
                      {pmEmail}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 print:space-y-2">
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 uppercase print:text-black print:font-bold print:text-[9pt]">
                      Mobile
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 print:text-[10.5pt] print:text-black">
                      {pmPhone}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 uppercase print:text-black print:font-bold print:text-[9pt]">
                      Telephone
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 print:text-[10.5pt] print:text-black">
                      {companyTel}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 uppercase print:text-black print:font-bold print:text-[9pt]">
                      Fax
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 print:text-[10.5pt] print:text-black">
                      {companyFax}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CRITICAL CONSIDERATIONS */}
            <div
              id="schedule-critical-considerations"
              ref={(el) => {
                sectionsRef.current["critical-considerations"] = el;
              }}
              className="border border-slate-200 rounded-xl overflow-hidden print:border-none print:bg-white print:shadow-none bg-white/60 backdrop-blur-sm"
            >
              <button
                onClick={() => setAccordionOpen(!accordionOpen)}
                className="w-full flex justify-between items-center p-4 font-bold text-lg text-slate-800 print:hidden"
              >
                <span>SCHEDULE OF CRITICAL PROJECT CONSIDERATIONS</span>
                <span className="ml-4">{accordionOpen ? "▲" : "▼"}</span>
              </button>
              <div className={`p-6 pt-0 ${accordionOpen ? "block" : "hidden"} print:block print:p-0 print:break-inside-avoid`}>
                <h2 className="hidden print:block print-section-heading text-2xl font-bold mb-4">
                  SCHEDULE OF CRITICAL PROJECT CONSIDERATIONS
                </h2>
                <div className="clauses-container">
                  {criticalClauses.map((clause, idx) => {
                    if (clause.title === "2) CRITICAL DATES") {
                      return (
                        <div key={idx} className="critical-clause mb-3 break-inside-avoid-page">
                          <div className="font-bold text-slate-800">2) CRITICAL DATES</div>
                          <div className="ml-4" dangerouslySetInnerHTML={{ __html: generateCriticalDatesHtml(tender) }} />
                        </div>
                      );
                    }
                    if (clause.title === "3) SUBMISSION OF TENDER") {
                      const tenderName = tender?.tender_name || "TENDER";
                      const closingDate = formatTenderDateLong(tender?.closing_date);
                      const description = clause.description
                        .replace(/<tender title>/g, tenderName)
                        .replace(/<date>/g, closingDate);
                      return (
                        <div key={idx} className="critical-clause mb-3 break-inside-avoid-page">
                          <div className="font-bold text-slate-800">3) SUBMISSION OF TENDER</div>
                          <div className="ml-4 text-slate-700" style={{ whiteSpace: "pre-wrap" }}>
                            {description}
                          </div>
                        </div>
                      );
                    }
                    if (clause.title === "4) TENDER ENQUIRIES") {
                      return <div key={idx}>{renderTenderEnquiries()}</div>;
                    }
                    return (
                      <div key={idx} className="critical-clause mb-3 break-inside-avoid-page">
                        <div className="font-bold text-slate-800">{clause.title}</div>
                        <div className="ml-4 text-slate-700 whitespace-pre-wrap">{clause.description}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SCOPE OF CONTRACT */}
            <div
              id="scope-contract-section"
              ref={(el) => {
                sectionsRef.current["scope-terms"] = el;
              }}
              className="border border-slate-200 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 mb-4 print:text-xl">SCOPE OF CONTRACT</h2>
              {scopeClauses.map((clause, i) => (
                <div key={i} className="mb-3 break-inside-avoid-page">
                  <div className="font-bold text-slate-800">{clause.title}</div>
                  <div className="ml-4 text-slate-700">{clause.description}</div>
                </div>
              ))}
            </div>

            {/* Agreed and Confirmed By */}
            <div
              id="agreed-confirmed-by-section"
              className="border border-slate-200 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 mb-4 print:text-xl">Agreed and Confirmed By</h2>
              <div className="space-y-4">
                <SingleLineInput label="Name of Contractor / Tenderer" value={agreedName} onChange={setAgreedName} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <SignaturePad label="Signature" value={agreedSignature} onChange={setAgreedSignature} disabled={readOnly} />
                  <CompanyStampUpload
                    label="Company Stamp"
                    preview={agreedStampPreview}
                    onFileSelect={(f, p) => setAgreedStampPreview(p)}
                    disabled={readOnly}
                  />
                </div>
                <SingleLineInput label="Date" value={agreedDate} onChange={setAgreedDate} type="date" />
              </div>
            </div>

            {/* TERMS AND CONDITIONS */}
            <div
              id="terms-conditions-tender"
              className="border border-slate-200 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 mb-4 print:text-xl print-section-heading">
                TERMS AND CONDITIONS OF TENDER
              </h2>
              <div className="space-y-3 text-sm">
                {termsConditions.map((term, i) => {
                  if (i === 1) {
                    return <div key={i}>{renderTerminologies()}</div>;
                  }
                  return (
                    <div key={i} className="mb-2 break-inside-avoid-page">
                      <div className="font-bold text-slate-800">{term.header}</div>
                      <div className="ml-4 text-slate-700">{term.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FORM OF TENDER */}
            <div
              id="form-of-tender"
              ref={(el) => {
                sectionsRef.current["form-of-tender"] = el;
              }}
              className="border border-slate-200 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 mb-4 print:text-2xl">FORM OF TENDER</h2>
              <div className="space-y-3 text-sm">
                <p className="font-medium text-slate-700">
                  <strong>To:</strong> {clientName}
                  <br />
                  <strong style={{ whiteSpace: "pre-line" }}>{fixedAddress}</strong>
                </p>
                <p className="text-slate-700">Dear Sir / Madam</p>
                <p className="text-slate-700">
                  1. Having inspected the site, and examined the Tender Documents, we submit a total sum quoted for Singapore
                  Dollars:
                </p>
                <div className="my-3 p-3 bg-slate-50 rounded print:bg-transparent print:p-0">
                  <p className="font-semibold text-slate-800 flex flex-wrap items-center gap-2">
                    <span>TOTAL LUMP SUM</span>
                    {readOnly ? (
                      <span className="inline-block w-36 sm:w-44 text-right text-slate-800 text-sm sm:text-base print:inline-block print:w-[110pt] print:text-right print:border-b print:border-black print:pb-1">
                        {lumpSumRaw || "—"}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={lumpSumRaw}
                        onChange={handleLumpSumChange}
                        className="w-36 sm:w-44 border-b border-gray-400 bg-transparent text-right px-1 focus:outline-none focus:border-cyan-500 text-sm sm:text-base text-black print:inline-block print:w-[110pt] print:border-b print:border-black print:text-right"
                        placeholder="0.00"
                      />
                    )}
                    <span>SGD</span>
                  </p>
                  {amountInWords && (
                    <p className="mt-2 text-sm text-slate-600 italic">{amountInWords} Singapore Dollars</p>
                  )}
                  <div className="hidden print:block mt-4">
                    <div className="print-address-line" style={{ height: "18pt", marginBottom: "2pt" }} />
                    <div className="print-address-line" style={{ height: "18pt" }} />
                  </div>
                </div>
                {FORM_OF_TENDER_ITEMS.map((text, i) => (
                  <p key={i} className="text-slate-700">
                    {text}
                  </p>
                ))}
              </div>
            </div>

            {/* Execution Panels */}
            <div
              id="execution"
              ref={(el) => {
                sectionsRef.current["execution"] = el;
              }}
              className="space-y-10 print:space-y-8 print:mt-8 print:break-inside-avoid"
            >
              <div
                id="main-tenderer-sign-off"
                className="border border-slate-200 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 backdrop-blur-sm"
              >
                <h3 className="text-xl font-bold text-slate-800 mb-4 print:text-lg">Main Tenderer Sign‑Off</h3>
                <div className="space-y-4 mt-4">
                  <SingleLineInput
                    label="Full Name"
                    value={mainTenderer.fullName}
                    onChange={(val) => setMainTenderer((p) => ({ ...p, fullName: val }))}
                  />
                  <SingleLineInput
                    label="Position in Company"
                    value={mainTenderer.position}
                    onChange={(val) => setMainTenderer((p) => ({ ...p, position: val }))}
                  />
                  <SingleLineInput
                    label="Name of Company"
                    value={mainTenderer.companyName}
                    onChange={(val) => setMainTenderer((p) => ({ ...p, companyName: val }))}
                  />
                  <FillableAddress
                    label="Address of Company"
                    value={mainAddress}
                    onChange={setMainAddress}
                    placeholder="Enter company address..."
                  />
                  <SingleLineInput
                    label="Date"
                    value={mainTenderer.date}
                    onChange={(val) => setMainTenderer((p) => ({ ...p, date: val }))}
                    type="date"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <SignaturePad label="Signature" value={mainSignature} onChange={setMainSignature} disabled={readOnly} />
                    <CompanyStampUpload
                      label="Company Stamp"
                      preview={mainStampPreview}
                      onFileSelect={(f, p) => setMainStampPreview(p)}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </div>

              <div
                id="witness-sign-off-panel"
                className="border border-slate-200 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 backdrop-blur-sm"
              >
                <h3 className="text-xl font-bold text-slate-800 mb-4 print:text-lg">Independent Witness Sign‑Off</h3>
                <div className="space-y-4 mt-4">
                  <SingleLineInput
                    label="Full Name of Witness"
                    value={witness.fullName}
                    onChange={(val) => setWitness((p) => ({ ...p, fullName: val }))}
                  />
                  <FillableAddress
                    label="Address of Witness"
                    value={witnessAddress}
                    onChange={setWitnessAddress}
                    placeholder="Enter witness address..."
                  />
                  <SingleLineInput
                    label="Date"
                    value={witness.date}
                    onChange={(val) => setWitness((p) => ({ ...p, date: val }))}
                    type="date"
                  />
                  <SignaturePad label="Signature of Witness" value={witnessSignature} onChange={setWitnessSignature} disabled={readOnly} />
                </div>
              </div>
            </div>

            {/* Appendix (Tables) */}
            <div
              id="appendix"
              ref={(el) => {
                sectionsRef.current["appendix"] = el;
              }}
              className="space-y-10 print:space-y-8 print:break-inside-avoid"
            >
              <div
                id="contractors-declaration-section"
                className="border border-slate-200 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 backdrop-blur-sm"
              >
                <h2 className="text-2xl font-bold text-slate-800 mb-4 print:text-xl">CONTRACTOR'S DECLARATION</h2>
                <p className="text-sm text-slate-600 mt-1">Tenderer's Confirmation of Comprehension of Tender Document</p>
                <p className="text-sm text-slate-600 mb-4">
                  This page confirms understanding and irrevocable acceptance of the Tender Documents and Drawings.
                </p>
                <div className="space-y-4">
                  <SingleLineInput
                    label="I,"
                    value={declaration.iName}
                    onChange={(val) => setDeclaration((p) => ({ ...p, iName: val }))}
                  />
                  <SingleLineInput
                    label="on behalf of"
                    value={declaration.onBehalfOf}
                    onChange={(val) => setDeclaration((p) => ({ ...p, onBehalfOf: val }))}
                  />
                  <p className="italic text-slate-700">have fully examined the Tender Documents and irrevocably agree.</p>
                  <div className="space-y-4">
                    <SingleLineInput
                      label="Name of Tenderer"
                      value={declaration.name}
                      onChange={(val) => setDeclaration((p) => ({ ...p, name: val }))}
                    />
                    <FillableAddress
                      label="Address of Tenderer"
                      value={tendererAddress}
                      onChange={setTendererAddress}
                      placeholder="Enter tenderer address..."
                    />
                    <SingleLineInput
                      label="Date"
                      value={declaration.date}
                      onChange={(val) => setDeclaration((p) => ({ ...p, date: val }))}
                      type="date"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <SignaturePad
                        label="Signature of Tenderer"
                        value={declarationSignature}
                        onChange={setDeclarationSignature}
                        disabled={readOnly}
                      />
                      <CompanyStampUpload
                        label="Company Stamp"
                        preview={declarationStampPreview}
                        onFileSelect={(f, p) => setDeclarationStampPreview(p)}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* RELEVANT PROJECT EXPERIENCE */}
              <div id="relevant-experience-table-section" className="mt-6 print:mt-4">
                <h3 className="text-xl font-bold text-slate-800 tracking-wide mb-2 uppercase print:text-base">
                  RELEVANT PROJECT EXPERIENCE
                </h3>
                <p className="text-xs text-slate-500 mb-4 print:hidden">Provide at least 5 projects of similar nature.</p>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-left border-collapse print:border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 divide-x divide-slate-200 print:bg-transparent print:border-b">
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Project Name
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Value (SGD)
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Date
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Designer
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projectRows.map((row) => (
                        <tr key={row.id} className="divide-x divide-slate-100 print:border-none">
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.projectName}</span>
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.value}</span>
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.date}</span>
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.designer}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CURRENT PROJECT COMMITMENT */}
              <div id="current-commitment-table-section" className="mt-6 print:mt-4">
                <h3 className="text-xl font-bold text-slate-800 tracking-wide mb-2 uppercase print:text-base">
                  CURRENT PROJECT COMMITMENT
                </h3>
                <p className="text-xs text-slate-500 mb-4 print:hidden">
                  Provide particulars of projects presently engaged in.
                </p>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-left border-collapse print:border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 divide-x divide-slate-200 print:bg-transparent print:border-b">
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Project Name
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Value (SGD)
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Percentage Completed
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase text-center print:border print:border-slate-300 print:bg-gray-50">
                          Designer
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commitmentRows.map((row) => (
                        <tr key={row.id} className="divide-x divide-slate-100 print:border-none">
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.projectName}</span>
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.value}</span>
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.percentage}</span>
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <span className="text-slate-800">{row.designer}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating print button */}
        <div className="fixed bottom-6 right-6 z-50 md:hidden print:hidden">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full shadow-lg transition-all duration-300"
          >
            <Printer className="w-5 h-5" />
            <span className="text-sm font-medium">Print / PDF</span>
          </button>
        </div>
      </div>

      {/* ===== PRINT STYLES – unchanged ===== */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
            @bottom-center {
              content: "Page " counter(page) " of " counter(pages);
              font-size: 9pt;
              color: #000;
            }
          }

          html,
          body,
          main,
          #__next,
          .min-h-screen,
          .flex-1 {
            color: #000000 !important;
            background: white !important;
            font-family: "Times New Roman", Times, serif !important;
            font-size: 11pt !important;
            line-height: 1.6 !important;
            letter-spacing: 0.01em !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            background: transparent !important;
            background-color: transparent !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
            border: none !important;
            color: #000 !important;
          }

          .print-only-cover {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: center !important;
            min-height: 100vh !important;
            text-align: center !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          h1 {
            font-size: 22pt !important;
            font-weight: 800 !important;
            line-height: 1.2 !important;
            text-align: center !important;
            margin-bottom: 6pt !important;
          }
          h2 {
            font-size: 14pt !important;
            font-weight: 700 !important;
            line-height: 1.3 !important;
            text-align: center !important;
            margin-top: 2pt !important;
            margin-bottom: 12pt !important;
          }
          h3 {
            font-size: 12pt !important;
            font-weight: 700 !important;
            margin-top: 8pt !important;
            margin-bottom: 4pt !important;
          }

          .critical-clause .font-bold,
          .mb-2 .font-bold,
          .clauses-container .font-bold {
            font-size: 11pt !important;
            font-weight: 700 !important;
          }

          .print-field-row label,
          .print-field-row > label {
            display: block !important;
            font-size: 7.5pt !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.06em !important;
            color: #000 !important;
            margin-bottom: 2pt !important;
          }

          .print-section-heading {
            display: table-header-group;
            font-size: 14pt !important;
            font-weight: 700 !important;
            text-align: center !important;
            margin-top: 2pt !important;
            margin-bottom: 12pt !important;
            color: #000 !important;
          }

          .clauses-container {
            display: table;
            width: 100%;
            page-break-inside: avoid;
          }
          .critical-clause {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          #terms-conditions-tender .mb-2 {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          #form-of-tender strong {
            font-weight: 700 !important;
          }

          .print-single-input,
          .print-field-row input[type="text"],
          .print-field-row input[type="date"],
          .print-field-row span {
            display: block !important;
            width: 260pt !important;
            max-width: 100% !important;
            border: none !important;
            border-bottom: 1pt solid #000 !important;
            padding: 1pt 0 3pt !important;
            font-size: 10.5pt !important;
            background: transparent !important;
            color: #000 !important;
          }
          .print-field-row input[type="date"] {
            width: 130pt !important;
          }
          .print-field-row textarea {
            display: none !important;
          }

          .print-address-line {
            border-bottom: 1pt solid #000 !important;
            display: block !important;
            height: 18pt !important;
            margin-bottom: 2pt !important;
            width: 100% !important;
          }

          #form-of-tender input[type="text"] {
            display: inline-block !important;
            width: 110pt !important;
            border: none !important;
            border-bottom: 1pt solid #000 !important;
            text-align: right !important;
            background: transparent !important;
            color: #000 !important;
          }

          td input,
          th input {
            display: block !important;
            width: 100% !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 9pt !important;
            color: #000 !important;
            background: transparent !important;
          }
          input::placeholder {
            color: transparent !important;
            opacity: 0 !important;
          }
          input[type="date"].date-empty {
            color: transparent !important;
          }
          input[type="date"].date-empty::-webkit-calendar-picker-indicator {
            display: none !important;
          }

          #relevant-experience-table-section,
          #current-commitment-table-section {
            width: 100% !important;
            max-width: 100% !important;
            display: block !important;
            clear: both !important;
            overflow: hidden !important;
          }
          #relevant-experience-table-section table,
          #current-commitment-table-section table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            margin-top: 12pt !important;
          }
          #relevant-experience-table-section th:nth-child(1),
          #relevant-experience-table-section td:nth-child(1) {
            width: 35% !important;
          }
          #relevant-experience-table-section th:nth-child(2),
          #relevant-experience-table-section td:nth-child(2) {
            width: 20% !important;
          }
          #relevant-experience-table-section th:nth-child(3),
          #relevant-experience-table-section td:nth-child(3) {
            width: 25% !important;
            white-space: nowrap !important;
          }
          #relevant-experience-table-section th:nth-child(4),
          #relevant-experience-table-section td:nth-child(4) {
            width: 20% !important;
          }
          #current-commitment-table-section th:nth-child(1),
          #current-commitment-table-section td:nth-child(1) {
            width: 33% !important;
          }
          #current-commitment-table-section th:nth-child(2),
          #current-commitment-table-section td:nth-child(2) {
            width: 15% !important;
          }
          #current-commitment-table-section th:nth-child(3),
          #current-commitment-table-section td:nth-child(3) {
            width: 32% !important;
            word-wrap: break-word !important;
          }
          #current-commitment-table-section th:nth-child(4),
          #current-commitment-table-section td:nth-child(4) {
            width: 20% !important;
          }

          th,
          td {
            border: 1px solid #d1d5db !important;
            padding: 6pt 8pt !important;
            font-size: 9.5pt !important;
            word-wrap: break-word !important;
          }
          td input,
          th input,
          #relevant-experience-table-section td input,
          #current-commitment-table-section td input {
            border: none !important;
            border-bottom: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            text-decoration: none !important;
            outline: none !important;
            box-shadow: none !important;
          }

          nav,
          footer,
          header,
          .navbar,
          .site-footer,
          #global-nav,
          #global-footer,
          [class*="navbar"],
          [class*="footer"],
          aside,
          .print\\:hidden,
          .print\\:hidden * {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
          }

          #schedule-critical-considerations {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          #schedule-critical-considerations .clauses-container {
            orphans: 2 !important;
            widows: 2 !important;
          }
          .critical-clause {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #schedule-critical-considerations h2 {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }
          #terms-conditions-tender {
            page-break-inside: auto !important;
            break-inside: auto !important;
            margin-top: 18pt !important;
            margin-bottom: 18pt !important;
          }
          #terms-conditions-tender .mb-2 {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            padding-top: 4pt !important;
            padding-bottom: 4pt !important;
          }

          #project-team-card,
          #schedule-critical-considerations,
          #scope-contract-section,
          #terms-conditions-tender,
          #form-of-tender,
          #contractors-declaration-section,
          #relevant-experience-table-section,
          #current-commitment-table-section,
          #main-tenderer-sign-off,
          #witness-sign-off-panel,
          #agreed-confirmed-by-section {
            display: block !important;
            position: relative !important;
            margin-top: 12pt !important;
            margin-bottom: 18pt !important;
            padding: 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #project-team-card {
            margin-top: 12pt !important;
            margin-bottom: 24pt !important;
            padding: 16pt !important;
            border: 1px solid #d1d5db !important;
            border-radius: 6px !important;
          }
          .project-team-grid-wrapper {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16pt !important;
          }
          #schedule-critical-considerations,
          #terms-conditions-tender {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 2rem !important;
          }
          .grid-cols-1 {
            grid-template-columns: 1fr !important;
          }
          .whitespace-nowrap {
            white-space: nowrap !important;
          }
          .overflow-x-auto {
            overflow: visible !important;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          #form-of-tender,
          #contractors-declaration-section {
            page-break-before: always !important;
            break-before: page !important;
            margin-top: 0 !important;
          }

          #project-team-card .print\\:space-y-0\\.5 > * + * {
            margin-top: 0.5pt !important;
          }
          #project-team-card .print\\:space-y-2 > * + * {
            margin-top: 2pt !important;
          }
        }
      `}</style>
    </div>
  );
}