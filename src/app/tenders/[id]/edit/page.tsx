// app/tenders/[id]/edit/page.tsx

"use client";

import { useEffect, useState, useRef, DragEvent, ChangeEvent, useCallback, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileSignature,
  Printer,
  Upload,
  X,
  File,
  ArrowLeft,
  CheckCircle,
  ShieldCheck,
  AlertCircle,
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
} from "@/lib/tenderConstants";
import { DATE_LABELS, EXTRA_DATE_NOTES } from "@/lib/tenderDateConfig";
import { FORM_OF_TENDER_ITEMS } from "@/lib/tenderFormItems";

const PrintDateCleanup = dynamic(() => import("@/components/PrintDateCleanup"), { ssr: false });

// ========== Alert Modal State ==========
interface AlertState {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  details?: string;
}

// ========== Number to Words ==========
const numberToWords = (num: number): string => {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const thousands = ["", "Thousand", "Million", "Billion"];
  const convertChunk = (n: number): string => {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convertChunk(n % 100) : "");
  };
  let remaining = Math.floor(num);
  let result = "";
  let group = 0;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk !== 0) {
      result = convertChunk(chunk) + (thousands[group] ? " " + thousands[group] : "") + (result ? " " + result : "");
    }
    remaining = Math.floor(remaining / 1000);
    group++;
  }
  const cents = Math.round((num - Math.floor(num)) * 100);
  if (cents > 0) result += " and " + convertChunk(cents) + " Cents";
  return result.trim();
};

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
interface SignaturePadProps {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  className?: string;
  disabled?: boolean;
}
const SignaturePad: React.FC<SignaturePadProps> = ({ label, value, onChange, className, disabled = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!value);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const hasDrawn = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctxRef.current = ctx;
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasSignature(true);
      };
      img.src = value;
    }
  }, [value]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDrawing(true);
    hasDrawn.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled || !isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctxRef.current?.lineTo(x, y);
    ctxRef.current?.stroke();
    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(x, y);
    hasDrawn.current = true;
  };

  const endDrawing = () => {
    if (disabled) return;
    setIsDrawing(false);
    if (hasDrawn.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL();
      onChange(dataUrl);
      setHasSignature(true);
    }
  };

  const clearSignature = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    onChange(null);
    setHasSignature(false);
    hasDrawn.current = false;
  };

  return (
    <div className={className}>
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <div className="print:hidden">
        <div className="border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 p-1" style={{ width: "100%", maxWidth: "300px" }}>
          <canvas
            ref={canvasRef}
            width={300}
            height={120}
            style={{ width: "100%", height: "auto", minHeight: "80px", cursor: disabled ? "default" : "crosshair" }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={endDrawing}
            className="touch-none"
          />
        </div>
        {!disabled && (
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={clearSignature} className="text-xs text-red-600 dark:text-red-400 hover:underline">Clear</button>
            {hasSignature && <span className="text-xs text-green-600 dark:text-green-400">✓ Signature saved</span>}
          </div>
        )}
      </div>
      <div className="hidden print:block">
        {value ? (
          <img src={value} alt="Signature" className="max-w-full max-h-16 object-contain mt-1" />
        ) : (
          <div className="print-signature-line" style={{ borderBottom: '1.5px solid #000', minHeight: '0.5cm', marginTop: '0.5cm' }} />
        )}
      </div>
      <style jsx>{`
        @media print {
          .print-signature-line {
            display: block !important;
            margin-top: 10mm !important;
            border-bottom: 1.5px solid #000000 !important;
            width: auto !important;
            min-width: 250px !important;
            max-width: 300px !important;
            min-height: 5mm !important;
          }
        }
      `}</style>
    </div>
  );
};

// ========== Company Stamp Upload ==========
interface CompanyStampUploadProps {
  label?: string;
  preview: string | null;
  onFileSelect: (file: File | null, previewUrl: string | null) => void;
  className?: string;
  disabled?: boolean;
}
const CompanyStampUpload: React.FC<CompanyStampUploadProps> = ({ label, preview, onFileSelect, className, disabled = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const simulateProgress = (cb: () => void) => {
    setUploadProgress(0);
    setIsUploading(true);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          cb();
          return 100;
        }
        return prev + 10;
      });
    }, 30);
  };
  const processFile = (file: File) => {
    if (disabled) return;
    const valid = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
    if (!valid.includes(file.type)) return alert("Please upload PNG, JPG, or PDF.");
    if (file.size > 5 * 1024 * 1024) return alert("File must be <5MB.");
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(0) + " KB");
    simulateProgress(() => {
      const reader = new FileReader();
      reader.onloadend = () => {
        onFileSelect(file, reader.result as string);
        setIsUploading(false);
        setUploadProgress(100);
      };
      reader.readAsDataURL(file);
    });
  };
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0] && !disabled) processFile(e.target.files[0]);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };
  const handleRemove = () => {
    if (!disabled) onFileSelect(null, null);
  };

  return (
    <div className={className}>
      <label className="font-bold block text-sm text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <div className="print:hidden">
        {!preview ? (
          <div
            onClick={() => !disabled && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300
              ${disabled ? "cursor-default opacity-60" : ""}
              ${
                isDragging
                  ? "border-blue-500 dark:border-blue-400 bg-blue-50/20 dark:bg-blue-950/20"
                  : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50/80 dark:hover:bg-slate-800/80"
              }`}
          >
            <div className="flex flex-col items-center gap-2">
              <Upload
                className={`w-8 h-8 transition-transform ${
                  isDragging ? "scale-105 text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"
                }`}
              />
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Drag & drop your stamp, or <span className="text-blue-600 dark:text-blue-400">click to browse</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, PDF up to 5MB</p>
            </div>
            {isUploading && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 dark:bg-blue-400 transition-all duration-100" style={{ width: `${uploadProgress}%` }} />
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" onChange={handleFileSelect} className="hidden" disabled={disabled} />
          </div>
        ) : (
          <div className="border rounded-xl p-4 bg-white/50 dark:bg-slate-800/50">
            <div className="flex items-start gap-3">
              {preview.startsWith("data:image") ? (
                <img src={preview} alt="Stamp" className="w-16 h-16 object-contain border rounded dark:border-slate-700" />
              ) : (
                <div className="w-16 h-16 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded border dark:border-slate-600">
                  <File className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-slate-700 dark:text-slate-300">{fileName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{fileSize}</p>
                {isUploading && <div className="mt-2 h-1 bg-emerald-500 rounded-full" style={{ width: `${uploadProgress}%` }} />}
              </div>
              {!disabled && (
                <button onClick={handleRemove} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="hidden print:block">
        {preview ? (
          <img src={preview} alt="Company Stamp" className="max-w-full max-h-20 object-contain mt-1" />
        ) : (
          <div className="print-stamp-line" style={{ borderBottom: '1.5px solid #000', minHeight: '0.5cm', marginTop: '0.5cm' }} />
        )}
      </div>
      <style jsx>{`
        @media print {
          .print-stamp-line {
            display: block !important;
            margin-top: 10mm !important;
            border-bottom: 1.5px solid #000000 !important;
            width: auto !important;
            min-width: 200px !important;
            max-width: 250px !important;
            min-height: 5mm !important;
          }
        }
      `}</style>
    </div>
  );
};

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
      "w-full min-w-0 border-b border-gray-300 dark:border-gray-600 pt-1 pb-3 text-black dark:text-white bg-transparent focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400 transition-colors";
    const labelClass = "font-bold block mb-1 text-slate-800 dark:text-white text-sm sm:text-base";
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
      "w-full border-b border-gray-300 dark:border-gray-600 min-h-[80px] pt-1 pb-3 resize-y print:hidden text-black dark:text-white bg-transparent focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400 transition-colors";
    return (
      <div className="print-field-row flex flex-col space-y-1 w-full mt-4 print:mt-6">
        <label className="text-xs font-bold text-slate-800 dark:text-white uppercase print:text-black print:text-xs">{label}</label>
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

// ========== FORMATTING HELPERS ==========
const formatDate = (isoString: string | null | undefined): string => {
  if (!isoString) return "To be confirmed";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "To be confirmed";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTime = (isoString: string | null | undefined): string => {
  if (!isoString) return "To be confirmed";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "To be confirmed";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (hours === "00" && minutes === "00") {
    return `${day}/${month}/${year}`;
  }
  return `${day}/${month}/${year}, ${hours}:${minutes} Hrs`;
};

const formatDateLong = (isoString: string | null | undefined): string => {
  if (!isoString) return "To be confirmed";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "To be confirmed";
  const day = date.getDate();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

// ========== Main Component ==========
export default function TenderEditPage() {
  const router = useRouter();
  const { id } = useParams();
  const { data: session, status: sessionStatus } = useSession();

  const [tender, setTender] = useState<TenderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("project-team");

  // ---- Alert modal state ----
  const [alert, setAlert] = useState<AlertState | null>(null);

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

  // Modals
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const [submittedTenderName, setSubmittedTenderName] = useState("");
  const [submittedContractor, setSubmittedContractor] = useState("");
  const [submittedAmount, setSubmittedAmount] = useState("");

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

  // ===== Submit logic =====
  const performSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSubmittedTenderName(tender?.tender_name || "this tender");
      setSubmittedContractor(agreedName);
      setSubmittedAmount(lumpSumRaw);
      setShowDisclaimerModal(false);
      setShowSuccessModal(true);
    } catch (err) {
      setAlert({
        type: "error",
        title: "Submission Failed",
        message: "Unable to submit your tender. Please try again.",
        details: "If the problem persists, contact support.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [tender, agreedName, lumpSumRaw]);

  const handleSubmit = useCallback(async () => {
    const missing: string[] = [];
    if (!agreedName.trim()) missing.push("Name of Contractor / Tenderer");
    if (!lumpSumRaw.trim()) missing.push("Total Lump Sum (SGD)");
    if (!declaration.iName.trim()) missing.push("Declaration: I, (your name)");
    if (!declaration.onBehalfOf.trim()) missing.push("Declaration: on behalf of (company name)");
    if (!declaration.name.trim()) missing.push("Declaration: Name of Tenderer");
    if (!declaration.date.trim()) missing.push("Declaration: Date");
    if (!declarationSignature) missing.push("Declaration: Signature of Tenderer");
    if (!tendererAddress.trim()) missing.push("Declaration: Address of Tenderer");

    if (missing.length > 0) {
      setErrorMessages(missing);
      setShowErrorModal(true);
      return;
    }

    setShowDisclaimerModal(true);
    setDisclaimerAgreed(false);
  }, [agreedName, lumpSumRaw, declaration, declarationSignature, tendererAddress]);

  // ===== Alert Modal renderer =====
  const renderAlertModal = () => {
    if (!alert) return null;
    const { type, title, message, details } = alert;
    let bgColor, borderColor, icon;
    switch (type) {
      case "success":
        bgColor = "bg-emerald-50 dark:bg-emerald-900/20";
        borderColor = "border-emerald-500";
        icon = "✅";
        break;
      case "error":
        bgColor = "bg-red-50 dark:bg-red-900/20";
        borderColor = "border-red-500";
        icon = "⚠️";
        break;
      case "warning":
        bgColor = "bg-amber-50 dark:bg-amber-900/20";
        borderColor = "border-amber-500";
        icon = "⚠️";
        break;
      case "info":
      default:
        bgColor = "bg-blue-50 dark:bg-blue-900/20";
        borderColor = "border-blue-500";
        icon = "ℹ️";
        break;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className={`w-full max-w-md ${bgColor} border-l-4 ${borderColor} rounded-2xl shadow-2xl p-6`}>
          <div className="flex items-start gap-4">
            <span className="text-3xl">{icon}</span>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{message}</p>
              {details && <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{details}</p>}
            </div>
            <button
              onClick={() => setAlert(null)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setAlert(null)}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===== Loading & error states =====
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading tender…</p>
        </div>
      </div>
    );
  }
  // If error and no tender, show fallback (modal is rendered separately)
  if (error || !tender) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        {renderAlertModal()}
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-6 rounded-xl max-w-md w-full">
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
          formatted = formatDateTime(value as string);
        } else {
          formatted = formatDate(value as string);
        }
        lines.push(`<div><span class='font-semibold'>• ${label}:</span> ${formatted}</div>`);
      }
    });

    lines.push(`<div><span class='font-semibold'>• Anticipated Award of Contract:</span> To be confirmed</div>`);

    EXTRA_DATE_NOTES.forEach((note) => {
      const className = note.includes("*") ? "text-amber-700 dark:text-amber-500 mt-2" : "text-slate-700 dark:text-gray-300 mt-2";
      lines.push(`<div class='${className}'>${note}</div>`);
    });

    return `<div class='grid grid-cols-1 gap-2 mt-2 text-slate-800 dark:text-gray-200'>${lines.join("")}</div>`;
  };

  // ========== TENDER ENQUIRIES (clause 4) ==========
  const renderTenderEnquiries = () => (
    <div className="critical-clause mb-3 break-inside-avoid-page">
      <div className="font-bold text-slate-800 dark:text-white">4) TENDER ENQUIRIES</div>
      <div className="ml-4 text-slate-700 dark:text-gray-300 space-y-1">
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
      <div className="font-bold text-slate-800 dark:text-white">2) TERMINOLOGIES</div>
      <div className="ml-4 text-slate-700 dark:text-gray-300">The Terms “Company” in the contract shall mean {clientName}.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white print:bg-white">
      {renderAlertModal()}
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
        <div className="print:hidden flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium uppercase tracking-wide">Back</span>
            </button>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>

        {/* --- Document Content --- */}
        <div className="flex flex-col md:flex-row gap-8 print:block">
          {/* Sidebar */}
          <aside className="hidden md:block w-64 flex-shrink-0 sticky top-24 self-start print:hidden">
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-lg">
              <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-3">Contents</h3>
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
                        ? "bg-cyan-50 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 font-medium"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                <p className="text-5xl sm:text-6xl font-extrabold uppercase tracking-wider text-slate-800 dark:text-white">
                  TENDER DOCUMENT
                </p>
                <p className="text-lg font-medium text-slate-600 dark:text-slate-400 mt-1">Tender Reference: {tenderRef}</p>
                <hr className="border-t-2 border-amber-600 w-24 mx-auto my-4" />
                <div className="text-2xl sm:text-3xl font-light text-slate-800 dark:text-white">
                  <p>Project: {renovationType}</p>
                  <p>For {clientName}</p>
                </div>
                <div className="text-base sm:text-lg font-medium text-slate-600 dark:text-slate-300 mt-2">
                  <p>Location:</p>
                  <p className="whitespace-pre-line">{branchAddress}</p>
                </div>
              </div>
            </div>

            {/* PROJECT TEAM */}
            <div
              id="project-team-card"
              className="border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-900/30 rounded-xl p-4 sm:p-6 lg:p-8 shadow-sm print:border-none print:bg-white print:shadow-none"
            >
              <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-6 print:text-xl print:mb-6">PROJECT TEAM</h2>
              <div className="project-team-grid-wrapper grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 print:grid-cols-2 print:gap-4">
                <div className="space-y-4 print:space-y-2">
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 dark:text-white uppercase print:text-black print:font-bold print:text-[9pt]">
                      Company
                    </label>
                    <span className="text-sm sm:text-base font-semibold text-slate-800 dark:text-white print:text-[10.5pt] print:font-normal">
                      {clientName}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 dark:text-white uppercase print:text-black print:font-bold print:text-[9pt]">
                      Address
                    </label>
                    <span className="text-sm sm:text-base text-slate-800 dark:text-white print:text-[10.5pt]">{companyAddress}</span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 dark:text-white uppercase print:text-black print:font-bold print:text-[9pt]">
                      Attention
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 dark:text-gray-300 print:text-[10.5pt] print:text-black break-words">
                      {pmName}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 dark:text-white uppercase print:text-black print:font-bold print:text-[9pt]">
                      Email
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 dark:text-gray-300 print:text-[10.5pt] print:text-black break-words">
                      {pmEmail}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 print:space-y-2">
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 dark:text-white uppercase print:text-black print:font-bold print:text-[9pt]">
                      Mobile
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 dark:text-gray-300 print:text-[10.5pt] print:text-black">
                      {pmPhone}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 dark:text-white uppercase print:text-black print:font-bold print:text-[9pt]">
                      Telephone
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 dark:text-gray-300 print:text-[10.5pt] print:text-black">
                      {companyTel}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-1 print:space-y-0.5">
                    <label className="text-xs font-bold tracking-wider text-slate-800 dark:text-white uppercase print:text-black print:font-bold print:text-[9pt]">
                      Fax
                    </label>
                    <span className="text-sm sm:text-base text-slate-700 dark:text-gray-300 print:text-[10.5pt] print:text-black">
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
              className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print:border-none print:bg-white print:shadow-none bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
            >
              <button
                onClick={() => setAccordionOpen(!accordionOpen)}
                className="w-full flex justify-between items-center p-4 font-bold text-lg text-slate-800 dark:text-white print:hidden"
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
                          <div className="font-bold text-slate-800 dark:text-white">2) CRITICAL DATES</div>
                          <div className="ml-4" dangerouslySetInnerHTML={{ __html: generateCriticalDatesHtml(tender) }} />
                        </div>
                      );
                    }
                    if (clause.title === "3) SUBMISSION OF TENDER") {
                      const tenderName = tender?.tender_name || "TENDER";
                      const closingDate = formatDateLong(tender?.closing_date);
                      const description = clause.description.replace(/<tender title>/g, tenderName).replace(/<date>/g, closingDate);
                      return (
                        <div key={idx} className="critical-clause mb-3 break-inside-avoid-page">
                          <div className="font-bold text-slate-800 dark:text-white">3) SUBMISSION OF TENDER</div>
                          <div className="ml-4 text-slate-700 dark:text-gray-300" style={{ whiteSpace: "pre-wrap" }}>
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
                        <div className="font-bold text-slate-800 dark:text-white">{clause.title}</div>
                        <div className="ml-4 text-slate-700 dark:text-gray-300 whitespace-pre-wrap">{clause.description}</div>
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
              className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 print:text-xl">SCOPE OF CONTRACT</h2>
              {scopeClauses.map((clause, i) => (
                <div key={i} className="mb-3 break-inside-avoid-page">
                  <div className="font-bold text-slate-800 dark:text-white">{clause.title}</div>
                  <div className="ml-4 text-slate-700 dark:text-gray-300">{clause.description}</div>
                </div>
              ))}
            </div>

            {/* Agreed and Confirmed By */}
            <div
              id="agreed-confirmed-by-section"
              className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 print:text-xl">Agreed and Confirmed By</h2>
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
              className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 print:text-xl print-section-heading">
                TERMS AND CONDITIONS OF TENDER
              </h2>
              <div className="space-y-3 text-sm">
                {termsConditions.map((term, i) => {
                  if (i === 1) {
                    return <div key={i}>{renderTerminologies()}</div>;
                  }
                  return (
                    <div key={i} className="mb-2 break-inside-avoid-page">
                      <div className="font-bold text-slate-800 dark:text-white">{term.header}</div>
                      <div className="ml-4 text-slate-700 dark:text-gray-300">{term.text}</div>
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
              className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
            >
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 print:text-2xl">FORM OF TENDER</h2>
              <div className="space-y-3 text-sm">
                <p className="font-medium text-slate-700 dark:text-gray-300">
                  <strong>To:</strong> {clientName}
                  <br />
                  <strong style={{ whiteSpace: "pre-line" }}>{fixedAddress}</strong>
                </p>
                <p className="text-slate-700 dark:text-gray-300">Dear Sir / Madam</p>
                <p className="text-slate-700 dark:text-gray-300">
                  1. Having inspected the site, and examined the Tender Documents, we submit a total sum quoted for Singapore Dollars:
                </p>
                <div className="my-3 p-3 bg-slate-50 dark:bg-slate-800 rounded print:bg-transparent print:p-0">
                  <p className="font-semibold text-slate-800 dark:text-white flex flex-wrap items-center gap-2">
                    <span>TOTAL LUMP SUM</span>
                    <input
                      type="text"
                      value={lumpSumRaw}
                      onChange={handleLumpSumChange}
                      className="w-36 sm:w-44 border-b border-gray-400 dark:border-gray-500 bg-transparent text-right px-1 focus:outline-none focus:border-cyan-500 text-sm sm:text-base text-black dark:text-white print:inline-block print:w-[110pt] print:border-b print:border-black print:text-right"
                      readOnly={readOnly}
                      placeholder="0.00"
                    />
                    <span>SGD</span>
                  </p>
                  {amountInWords && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 italic">{amountInWords} Singapore Dollars</p>}
                  <div className="hidden print:block mt-4">
                    <div className="print-address-line" style={{ height: "18pt", marginBottom: "2pt" }} />
                    <div className="print-address-line" style={{ height: "18pt" }} />
                  </div>
                </div>
                {FORM_OF_TENDER_ITEMS.map((text, i) => (
                  <p key={i} className="text-slate-700 dark:text-gray-300">
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
                className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
              >
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4 print:text-lg">Main Tenderer Sign‑Off</h3>
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
                className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
              >
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4 print:text-lg">Independent Witness Sign‑Off</h3>
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
                className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 print:border-none print:bg-white print:shadow-none print:p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm"
              >
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 print:text-xl">CONTRACTOR'S DECLARATION</h2>
                <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">Tenderer’s Confirmation of Comprehension of Tender Document</p>
                <p className="text-sm text-slate-600 dark:text-gray-400 mb-4">
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
                  <p className="italic text-slate-700 dark:text-gray-300">have fully examined the Tender Documents and irrevocably agree.</p>
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
                <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-wide mb-2 uppercase print:text-base">
                  RELEVANT PROJECT EXPERIENCE
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 print:hidden">Provide at least 5 projects of similar nature.</p>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-left border-collapse print:border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 print:bg-transparent print:border-b">
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Project Name
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Value (SGD)
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Date
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Designer
                        </th>
                        <th className="p-3 print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 print:border-none">
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.projectName}
                              onChange={(e) => updateProjectRow(row.id, "projectName", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) => updateProjectRow(row.id, "value", e.target.value)}
                              className="w-32 border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              placeholder="YYYY-MM-DD"
                              value={row.date}
                              onChange={(e) => updateProjectRow(row.id, "date", e.target.value)}
                              className="w-36 border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.designer}
                              onChange={(e) => updateProjectRow(row.id, "designer", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:hidden">
                            <button onClick={() => deleteProjectRow(row.id)} className="text-red-500 dark:text-red-400 text-xs" disabled={readOnly}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={addProjectRow} className="mt-2 text-sm text-blue-600 dark:text-blue-400 print:hidden" disabled={readOnly}>
                  + Add Row
                </button>
              </div>

              {/* CURRENT PROJECT COMMITMENT */}
              <div id="current-commitment-table-section" className="mt-6 print:mt-4">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-wide mb-2 uppercase print:text-base">
                  CURRENT PROJECT COMMITMENT
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 print:hidden">
                  Provide particulars of projects presently engaged in.
                </p>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-left border-collapse print:border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 print:bg-transparent print:border-b">
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Project Name
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Value (SGD)
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Percentage Completed
                        </th>
                        <th className="p-3 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase print:border print:border-slate-300 print:bg-gray-50">
                          Designer
                        </th>
                        <th className="p-3 print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {commitmentRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 print:border-none">
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.projectName}
                              onChange={(e) => updateCommitmentRow(row.id, "projectName", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) => updateCommitmentRow(row.id, "value", e.target.value)}
                              className="w-32 border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.percentage}
                              onChange={(e) => updateCommitmentRow(row.id, "percentage", e.target.value)}
                              className="w-20 border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              placeholder="0-100"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:border print:border-slate-300">
                            <input
                              type="text"
                              value={row.designer}
                              onChange={(e) => updateCommitmentRow(row.id, "designer", e.target.value)}
                              className="w-full border-0 focus:ring-0 focus:outline-none print:border-0 text-black dark:text-white bg-transparent"
                              readOnly={readOnly}
                            />
                          </td>
                          <td className="p-3 print:hidden">
                            <button onClick={() => deleteCommitmentRow(row.id)} className="text-red-500 dark:text-red-400 text-xs" disabled={readOnly}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={addCommitmentRow} className="mt-2 text-sm text-blue-600 dark:text-blue-400 print:hidden" disabled={readOnly}>
                  + Add Row
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4 print:hidden">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-8 py-3 rounded bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FileSignature className="w-4 h-4" />
                {isSubmitting ? "Submitting..." : "Submit Tender"}
              </button>
            </div>
          </div>
        </div>

        {/* Floating print button */}
        <div className="fixed bottom-6 right-6 z-50 md:hidden print:hidden">
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-3 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-full shadow-lg transition-all duration-300">
            <Printer className="w-5 h-5" />
            <span className="text-sm font-medium">Print / PDF</span>
          </button>
        </div>
      </div>

      {/* ===== ERROR MODAL (missing fields) ===== */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Missing Required Fields</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-4">Please complete the following before submitting:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300">
              {errorMessages.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
            <button
              onClick={() => setShowErrorModal(false)}
              className="mt-6 w-full px-6 py-2.5 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
            >
              OK, I'll fix that
            </button>
          </div>
        </div>
      )}

      {/* ===== DISCLAIMER MODAL ===== */}
      {showDisclaimerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm print:hidden p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 relative">
            <div className="flex items-center gap-3 mb-6">
              <ShieldCheck className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">CONTRACTOR'S DECLARATION</h2>
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-slate-700 dark:text-slate-300 font-medium">
                By submitting this tender, I/we, the undersigned, hereby confirm and declare the following:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300">
                <li>
                  We have thoroughly read, understood, and accepted all the terms, conditions, and requirements stated in the
                  Tender Documents, Drawings, and all accompanying appendices.
                </li>
                <li>We have inspected the site and are fully aware of the scope of works, site conditions, and all constraints.</li>
                <li>All information provided in this submission is true, complete, and accurate to the best of our knowledge.</li>
                <li>We irrevocably agree to be bound by the contract if our tender is accepted by the Company.</li>
                <li>
                  We acknowledge that the Company is not obliged to accept the lowest or any tender and reserves the right to
                  reject any tender without assigning any reason.
                </li>
                <li>We agree to the validity period of the tender as stipulated in the Tender Documents.</li>
              </ul>
              <p className="text-slate-700 dark:text-slate-300 mt-4 font-semibold">
                We understand that this declaration forms a material part of the tender and that any false statement may result in
                disqualification or legal action.
              </p>
            </div>

            {/* Submission details */}
            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Tender:</span>
                <span className="text-slate-800 dark:text-white">{tender?.tender_name}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">Contractor:</span>
                <span className="text-slate-800 dark:text-white">{agreedName}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">Total Lump Sum:</span>
                <span className="text-slate-800 dark:text-white font-medium">SGD {lumpSumRaw}</span>
              </div>
            </div>

            {/* Agreement checkbox */}
            <div className="mt-6 flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <input
                type="checkbox"
                id="disclaimerAgreed"
                checked={disclaimerAgreed}
                onChange={(e) => setDisclaimerAgreed(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="disclaimerAgreed" className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                I/we agree to the above declaration and confirm that all information provided is true and accurate.
              </label>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowDisclaimerModal(false);
                  setDisclaimerAgreed(false);
                }}
                className="px-6 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={performSubmit}
                disabled={!disclaimerAgreed || isSubmitting}
                className={`px-6 py-2.5 rounded-lg text-white font-medium transition-colors ${
                  !disclaimerAgreed || isSubmitting
                    ? "bg-gray-400 dark:bg-gray-600 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                }`}
              >
                {isSubmitting ? "Submitting..." : "Confirm & Submit Tender"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SUCCESS MODAL ===== */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center relative">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Tender Submitted Successfully</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-6">Your submission has been received.</p>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm border-b border-slate-200 dark:border-slate-600 pb-2">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Tender</span>
                  <span className="text-slate-800 dark:text-white font-medium">{submittedTenderName}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-b border-slate-200 dark:border-slate-600 pb-2">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Contractor</span>
                  <span className="text-slate-800 dark:text-white font-medium">{submittedContractor}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Total Lump Sum</span>
                  <span className="text-slate-800 dark:text-white font-medium">SGD {submittedAmount}</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">A confirmation email will be sent to you shortly.</p>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                router.push(`/tenders/${id}`);
              }}
              className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors"
            >
              View Tender
            </button>
          </div>
        </div>
      )}

      {/* ===== PRINT STYLES ===== */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
            @bottom-center {
              content: "Page " counter(page);
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

          .print-field-row {
            display: block !important;
            width: 100% !important;
            margin-bottom: 10pt !important;
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
          .print-single-input,
          .print-field-row input[type="text"],
          .print-field-row input[type="date"] {
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