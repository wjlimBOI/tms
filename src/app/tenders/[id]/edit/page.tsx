// app/tenders/[id]/edit/page.tsx

"use client";

import { useEffect, useState, useRef, useCallback, memo, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useNotify } from "@/components/ui/notification-provider";
import "./tender-edit-print.css";
import {
  Printer,
  X,
  ArrowLeft,
} from "lucide-react";
import dynamic from "next/dynamic";
import { getCompanyDetailsByBrand } from "@/lib/companyMapping";
import { DEFAULT_CRITICAL, DEFAULT_SCOPE, DEFAULT_TERMS } from "@/lib/tenderClauses";
import {
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_TEL,
  DEFAULT_COMPANY_FAX,
  DEFAULT_PM_NAME,
  DEFAULT_PM_EMAIL,
  DEFAULT_PM_PHONE,
  DEFAULT_SUBMISSION_EMAIL,
} from "@/lib/tenderConstants";
import { DATE_LABELS, EXTRA_DATE_NOTES } from "@/lib/tenderDateConfig";
import { FORM_OF_TENDER_ITEMS } from "@/lib/tenderFormItems";
import { numberToWords } from "@/lib/numberToWords";
import { formatTenderDate, formatTenderDateTime, formatTenderDateLong } from "@/lib/dateUtils";
import { SignaturePad } from "@/components/tenders/SignaturePad";
import { CompanyStampUpload } from "@/components/tenders/CompanyStampUpload";
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
  brand_name: string;
  brand_address?: string | null;
  brand_attn_person?: string | null;
  brand_attn_email?: string | null;
  brand_phone?: string | null;
  renovation_type: string;
  status_label: string;
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
  project_manager_email?: string | null;
  project_manager_phone?: string | null;
  clauses?: {
    critical: { title: string; description: string }[];
    scope: { title: string; description: string }[];
    terms: { header: string; text: string }[];
  };
}

// ========== Signature Pad ==========
// ========== Memoized Input Components ==========
const SingleLineInput = memo(
  ({
    label,
    value,
    onChange,
    type = "text",
    placeholder,
    readOnly = false,
  }: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    type?: string;
    placeholder?: string;
    readOnly?: boolean;
  }) => {
    const inputClass =
      "w-full min-w-0 border-b border-gray-300 pt-1 pb-3 text-black bg-transparent focus:outline-none focus:border-cyan-500 transition-colors";
    const labelClass = "font-bold block mb-1 text-slate-800 text-sm sm:text-base";
    return (
      <div className="print-field-row flex flex-col space-y-1 w-full">
        <label className={labelClass}>{label}</label>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} print-single-input`}
          placeholder={placeholder}
          readOnly={readOnly}
        />
      </div>
    );
  }
);
SingleLineInput.displayName = "SingleLineInput";

const FillableAddress = memo(
  ({
    label,
    value,
    onChange,
    placeholder,
    readOnly = false,
  }: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    readOnly?: boolean;
  }) => {
    const textareaClass =
      "w-full border-b border-gray-300 min-h-[80px] pt-1 pb-3 resize-y print:hidden text-black bg-transparent focus:outline-none focus:border-cyan-500 transition-colors";
    return (
      <div className="print-field-row flex flex-col space-y-1 w-full mt-4 print:mt-6">
        <label className="text-xs font-bold text-slate-800 uppercase print:text-black print:text-xs">{label}</label>
        <textarea
          className={textareaClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Enter address here..."}
          rows={2}
          readOnly={readOnly}
        />
        <div className="hidden print:block">
          <div className="w-full print-address-line" style={{ height: "18pt", marginBottom: "2pt" }} />
          <div className="w-full print-address-line" style={{ height: "18pt" }} />
        </div>
      </div>
    );
  }
);
FillableAddress.displayName = "FillableAddress";

// ========== Main Component ==========
export default function TenderEditPage() {
  const router = useRouter();
  const { id } = useParams();
  const { data: session, status: sessionStatus } = useSession();
  const toast = useNotify();

  const [tender, setTender] = useState<TenderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accordionOpen, setAccordionOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("project-team");

  // ---- Alert modal state ----
  const [alert, setAlert] = useState<AlertModalData | null>(null);

  // Form fields
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
  const readOnly = false; // contractor can edit

  // ===== Fetch tender data =====
  useEffect(() => {
    if (!id) return;
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    fetch(`/api/tenders/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load tender");
        }
        return res.json();
      })
      .then((data) => {
        setTender(data);
        fetchMySubmission();
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setAlert({
          type: "error",
          title: "Unable to Load Tender",
          message: "We couldn't retrieve the tender details. Please refresh the page or try again later.",
          details: "If the problem persists, contact your system administrator.",
        });
        setLoading(false);
      });
  }, [id, sessionStatus, router]);

  // Preload whatever the contractor already submitted, so reopening this
  // form to fix one field doesn't start from blank and overwrite/destroy
  // everything else on the next submit.
  const fetchMySubmission = async () => {
    try {
      const res = await fetch(`/api/tenders/${id}/my-submission`);
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

  // ===== Handlers =====
  const handleLumpSumChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (readOnly) return;
      const raw = e.target.value;
      setLumpSumRaw(raw);
      const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) setAmountInWords(numberToWords(num));
      else setAmountInWords("");
    },
    [readOnly]
  );

  const addProjectRow = useCallback(() => {
    if (!readOnly) setProjectRows((prev) => [...prev, { id: crypto.randomUUID(), projectName: "", value: "", date: "", designer: "" }]);
  }, [readOnly]);
  const updateProjectRow = useCallback(
    (id: string, field: keyof ProjectRow, val: string) => {
      if (readOnly) return;
      setProjectRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
    },
    [readOnly]
  );
  const deleteProjectRow = useCallback(
    (id: string) => {
      if (!readOnly) setProjectRows((prev) => prev.filter((r) => r.id !== id));
    },
    [readOnly]
  );

  const addCommitmentRow = useCallback(() => {
    if (!readOnly) setCommitmentRows((prev) => [...prev, { id: crypto.randomUUID(), projectName: "", value: "", percentage: "", designer: "" }]);
  }, [readOnly]);
  const updateCommitmentRow = useCallback(
    (id: string, field: keyof CommitmentRow, val: string) => {
      if (readOnly) return;
      setCommitmentRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
    },
    [readOnly]
  );
  const deleteCommitmentRow = useCallback(
    (id: string) => {
      if (!readOnly) setCommitmentRows((prev) => prev.filter((r) => r.id !== id));
    },
    [readOnly]
  );

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

  // Signing the Form of Tender is what unlocks BQ submission (the backend
  // requires a tender_acknowledgment row before Draft -> Submitted). It
  // does not submit anything itself - actual bid submission happens by
  // email - so this only persists the form and records the signature.
  const [saving, setSaving] = useState(false);
  const handleSaveAndSign = async () => {
    if (!mainSignature || !declarationSignature) {
      setAlert({
        type: "error",
        title: "Signature Required",
        message: "Please sign both the Main Tenderer Sign-Off and the Declaration sections before saving.",
      });
      return;
    }
    if (!lumpSumRaw.trim()) {
      setAlert({
        type: "error",
        title: "Lump Sum Required",
        message: "Please enter the lump sum amount before saving.",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tenders/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreedName,
          agreedDate,
          agreedSignature,
          agreedStampPreview,
          stampPreview: mainStampPreview,
          lumpSumRaw,
          amountInWords,
          mainTenderer: { ...mainTenderer, signature: mainSignature, address: mainAddress },
          witness: { ...witness, signature: witnessSignature, address: witnessAddress },
          declaration: { ...declaration, signature: declarationSignature, address: tendererAddress },
          declarationStampPreview,
          projectExperience: projectRows,
          currentCommitment: commitmentRows,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save the Form of Tender");
      }
      toast.success("Form of Tender saved and signed.");
    } catch (err) {
      setAlert({
        type: "error",
        title: "Unable to Save",
        message: err instanceof Error ? err.message : "We couldn't save your Form of Tender. Please try again.",
        details: "Nothing you entered was lost - it's still on this page.",
      });
    } finally {
      setSaving(false);
    }
  };


  // ===== Loading & error states =====
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading tender…</p>
        </div>
      </div>
    );
  }
  // If error and no tender, show fallback (modal is rendered separately)
  if (error || !tender) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <AlertModal alert={alert} onClose={() => setAlert(null)} />
        <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-xl max-w-md w-full">
          <p className="font-bold mb-1">Error</p>
          <p className="text-sm">{error || "Tender not found"}</p>
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors">
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

  const branchAddress = tender?.branch_address || tender?.branch_name || "Address not provided";
  const fixedAddress = companyAddress;
  const contactPerson = pmName;
  const contactPosition = "Project Manager";
  const contactPhone = companyTel;
  const contactEmail = pmEmail;

  const tenderRef = tender?.tender_id ? `TEN-${String(tender.tender_id).padStart(4, "0")}` : "TEN-XXXX";
  const renovationType = tender?.renovation_type || "Interior Renovation";

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
      <div className="ml-4 text-slate-700">The Terms “Company” in the contract shall mean {clientName}.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 print:bg-white">
      <AlertModal alert={alert} onClose={() => setAlert(null)} />
      <PrintDateCleanup />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 print:py-0">
        {/* ========== COVER PAGE (print only) – matches view page ========== */}
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
              <p className="print:text-3xl print:font-bold print:text-black">Project: {renovationType}</p>
              <p className="print:text-3xl print:font-bold print:text-black print:mt-1">For {clientName}</p>
            </div>
            <hr className="print:border-t-2 print:border-black print:my-6 print:w-1/2 print:mx-auto" />
            <div className="print:mb-6">
              <p className="print:text-xl print:font-medium print:text-black">Location:</p>
              <p className="print:text-xl print:font-medium print:text-black print:mt-1">
                {branchAddress.split("\n").map((line, i) => (
                  <span key={i} className="print:block">
                    {line}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>

        {/* --- TOP ACTION BAR --- */}
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
        </div>

        {/* --- Document Content --- */}
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
            {/* ========== SCREEN HEADER ========== */}
            <div className="print:hidden mb-8">
              <div className="text-center">
                <p className="text-5xl sm:text-6xl font-extrabold uppercase tracking-wider text-slate-800">
                  TENDER DOCUMENT
                </p>
                <p className="text-lg font-medium text-slate-600 mt-1">Tender Reference: {tenderRef}</p>
                <hr className="border-t-2 border-amber-600 w-24 mx-auto my-4" />
                <div className="text-2xl sm:text-3xl font-light text-slate-800">
                  <p>Project: {renovationType}</p>
                  <p>For {clientName}</p>
                </div>
                <div className="text-base sm:text-lg font-medium text-slate-600 mt-2">
                  <p>Location:</p>
                  <p className="whitespace-pre-line">{branchAddress}</p>
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
                    <span className="text-sm sm:text-base text-slate-800 print:text-[10.5pt]">{companyAddress}</span>
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
                      const parts = description.split("<submission email>");
                      return (
                        <div key={idx} className="critical-clause mb-3 break-inside-avoid-page">
                          <div className="font-bold text-slate-800">3) SUBMISSION OF TENDER</div>
                          <div className="ml-4 text-slate-700" style={{ whiteSpace: "pre-wrap" }}>
                            {parts.map((part, i) => (
                              <Fragment key={i}>
                                {part}
                                {i < parts.length - 1 && <u>{DEFAULT_SUBMISSION_EMAIL}</u>}
                              </Fragment>
                            ))}
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
                  <div className="ml-4 text-slate-700 whitespace-pre-wrap">{clause.description}</div>
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
                <SingleLineInput label="Name of Contractor / Tenderer" value={agreedName} onChange={setAgreedName} readOnly={readOnly} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <SignaturePad label="Signature" value={agreedSignature} onChange={setAgreedSignature} disabled={readOnly} />
                  <CompanyStampUpload
                    label="Company Stamp"
                    preview={agreedStampPreview}
                    onFileSelect={(f, p) => setAgreedStampPreview(p)}
                    disabled={readOnly}
                  />
                </div>
                <SingleLineInput label="Date" value={agreedDate} onChange={setAgreedDate} type="date" readOnly={readOnly} />
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
                      <div className="ml-4 text-slate-700 whitespace-pre-wrap">{term.text}</div>
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
                  1. Having inspected the site, and examined the Tender Documents, we submit a total sum quoted for Singapore Dollars:
                </p>
                <div className="my-3 p-3 bg-slate-50 rounded print:bg-transparent print:p-0">
                  <p className="font-semibold text-slate-800 flex flex-wrap items-center gap-2">
                    <span>TOTAL LUMP SUM</span>
                    <input
                      type="text"
                      value={lumpSumRaw}
                      onChange={handleLumpSumChange}
                      className="w-36 sm:w-44 border-b border-gray-400 bg-transparent text-right px-1 focus:outline-none focus:border-cyan-500 text-sm sm:text-base text-black print:inline-block print:w-[110pt] print:border-b print:border-black print:text-right"
                      readOnly={readOnly}
                      placeholder="0.00"
                    />
                    <span>SGD</span>
                  </p>
                  {amountInWords && <p className="mt-2 text-sm text-slate-600 italic">{amountInWords} Singapore Dollars</p>}
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
                    readOnly={readOnly}
                  />
                  <SingleLineInput
                    label="Position in Company"
                    value={mainTenderer.position}
                    onChange={(val) => setMainTenderer((p) => ({ ...p, position: val }))}
                    readOnly={readOnly}
                  />
                  <SingleLineInput
                    label="Name of Company"
                    value={mainTenderer.companyName}
                    onChange={(val) => setMainTenderer((p) => ({ ...p, companyName: val }))}
                    readOnly={readOnly}
                  />
                  <FillableAddress label="Address of Company" value={mainAddress} onChange={setMainAddress} readOnly={readOnly} />
                  <SingleLineInput
                    label="Date"
                    value={mainTenderer.date}
                    onChange={(val) => setMainTenderer((p) => ({ ...p, date: val }))}
                    type="date"
                    readOnly={readOnly}
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
                    readOnly={readOnly}
                  />
                  <FillableAddress label="Address of Witness" value={witnessAddress} onChange={setWitnessAddress} readOnly={readOnly} />
                  <SingleLineInput
                    label="Date"
                    value={witness.date}
                    onChange={(val) => setWitness((p) => ({ ...p, date: val }))}
                    type="date"
                    readOnly={readOnly}
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
                <p className="text-sm text-slate-600 mt-1">Tenderer’s Confirmation of Comprehension of Tender Document</p>
                <p className="text-sm text-slate-600 mb-4">
                  This page confirms understanding and irrevocable acceptance of the Tender Documents and Drawings.
                </p>
                <div className="space-y-4">
                  <SingleLineInput
                    label="I,"
                    value={declaration.iName}
                    onChange={(val) => setDeclaration((p) => ({ ...p, iName: val }))}
                    readOnly={readOnly}
                  />
                  <SingleLineInput
                    label="on behalf of"
                    value={declaration.onBehalfOf}
                    onChange={(val) => setDeclaration((p) => ({ ...p, onBehalfOf: val }))}
                    readOnly={readOnly}
                  />
                  <p className="italic text-slate-700">have fully examined the Tender Documents and irrevocably agree.</p>
                  <div className="space-y-4">
                    <SingleLineInput
                      label="Name of Tenderer"
                      value={declaration.name}
                      onChange={(val) => setDeclaration((p) => ({ ...p, name: val }))}
                      readOnly={readOnly}
                    />
                    <FillableAddress
                      label="Address of Tenderer"
                      value={tendererAddress}
                      onChange={setTendererAddress}
                      readOnly={readOnly}
                    />
                    <SingleLineInput
                      label="Date"
                      value={declaration.date}
                      onChange={(val) => setDeclaration((p) => ({ ...p, date: val }))}
                      type="date"
                      readOnly={readOnly}
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
                  <table className="w-full text-left border-collapse print:border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 print:bg-transparent print:border-b">
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Project Name
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Value (SGD)
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Date
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Designer
                        </th>
                        <th className="p-3 print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 print:border-none">
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.projectName}
                              onChange={(e) => updateProjectRow(row.id, "projectName", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) => updateProjectRow(row.id, "value", e.target.value)}
                              className="w-32 border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              placeholder="YYYY-MM-DD"
                              value={row.date}
                              onChange={(e) => updateProjectRow(row.id, "date", e.target.value)}
                              className="w-36 border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.designer}
                              onChange={(e) => updateProjectRow(row.id, "designer", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:hidden">
                            <button onClick={() => deleteProjectRow(row.id)} className="text-red-500 text-xs" disabled={readOnly}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={addProjectRow} className="mt-2 text-sm text-blue-600 print:hidden" disabled={readOnly}>
                  + Add Row
                </button>
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
                  <table className="w-full text-left border-collapse print:border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 print:bg-transparent print:border-b">
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Project Name
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Value (SGD)
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Percentage Completed
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Designer
                        </th>
                        <th className="p-3 print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {commitmentRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 print:border-none">
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.projectName}
                              onChange={(e) => updateCommitmentRow(row.id, "projectName", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) => updateCommitmentRow(row.id, "value", e.target.value)}
                              className="w-32 border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.percentage}
                              onChange={(e) => updateCommitmentRow(row.id, "percentage", e.target.value)}
                              className="w-20 border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              placeholder="0-100"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.designer}
                              onChange={(e) => updateCommitmentRow(row.id, "designer", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:hidden">
                            <button onClick={() => deleteCommitmentRow(row.id)} className="text-red-500 text-xs" disabled={readOnly}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={addCommitmentRow} className="mt-2 text-sm text-blue-600 print:hidden" disabled={readOnly}>
                  + Add Row
                </button>
              </div>
            </div>

            {/* Bid submission now happens by email, not through this form - Save
                & Sign only records the signature (unlocks BQ submission) and
                keeps a copy for print/reference. */}
            <div className="flex flex-wrap justify-end gap-3 pt-4 print:hidden">
              <button
                onClick={handlePrint}
                className="px-6 py-3 rounded border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Now
              </button>
              <button
                onClick={handleSaveAndSign}
                disabled={saving}
                className="px-6 py-3 rounded bg-cyan-600 text-white font-medium hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save & Sign"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
