// components/tenders/TenderDetailClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getBrandColor } from "@/lib/brandColors";
import { getTenderStatusBadgeStyle, getTenderStatusLabel } from "@/lib/statusColors";
import { getLogoPath } from "@/lib/brandLogos";
import { getCompanyDetailsByBrand } from "@/lib/companyMapping";

interface BriefingDate {
  id: number;
  briefing_date: string;
  description: string | null;
}

interface TenderDetail {
  tender_id: number;
  tender_name: string;
  tender_description: string;
  branch_name: string;
  branch_building_name?: string | null;
  branch_full_address?: string | null;
  brand_name: string;
  renovation_type: string;
  status_label: string;
  status_code?: string;
  tender_date?: string;
  closing_date?: string;
  renovation_start_date?: string;
  renovation_end_date?: string;
  estimated_budget?: number;
  created_at?: string;
  updated_at?: string;
  project_manager_name?: string;
  project_manager_email?: string;
  project_manager_phone?: string;
  briefing_dates?: BriefingDate[];
}

// === Date formatting helpers ===
const formatDate = (isoString?: string): string => {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
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

const formatDateRange = (start?: string, end?: string): string => {
  if (!start && !end) return "—";
  const startStr = formatDate(start);
  const endStr = formatDate(end);
  if (startStr === "—" && endStr === "—") return "—";
  return `${startStr} – ${endStr}`;
};

const formatCurrency = (value?: number): string => {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(value);
};

const formatPhoneForDisplay = (phone: string | null | undefined): string => {
  if (!phone) return "—";
  if (phone.startsWith("+65") && phone.length === 11) {
    return `+65 ${phone.slice(3, 7)} ${phone.slice(7)}`;
  }
  if (phone.startsWith("+") && phone.length >= 4) {
    const countryCode = phone.slice(1, 3);
    const rest = phone.slice(3);
    return `+${countryCode} ${rest}`;
  }
  return phone;
};

export default function TenderDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tenders/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Tender not found");
        return res.json();
      })
      .then((data) => {
        setTender(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Could not load tender");
        setLoading(false);
      });
  }, [id]);

  const isInternalTeam = (session?.user as any)?.role_id === 1;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading tender details…</p>
        </div>
      </div>
    );
  }

  if (error || !tender) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-red-100 border border-red-300 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-800">{error || "Tender not found"}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const companyDetails = tender.brand_name ? getCompanyDetailsByBrand(tender.brand_name) : null;
  const fullBrandName = companyDetails?.companyName || tender.brand_name || "Brand";

  const brandColor = getBrandColor(tender.brand_name);
  const statusBadgeClass = getTenderStatusBadgeStyle(tender.status_label);
  const statusLabel = getTenderStatusLabel(tender.status_label);
  const logoPath = getLogoPath(tender.brand_name);

  const displayTitle = `${tender.renovation_type} at ${tender.branch_building_name || tender.branch_name} for ${fullBrandName}`;
  const fullAddress = tender.branch_full_address || tender.branch_name || "Address not provided";

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-50">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[35vw] max-w-[540px] max-h-[280px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative z-10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <button
              onClick={() => router.back()}
              className="text-cyan-600 hover:text-cyan-700 flex items-center gap-1 transition"
            >
              ← Back to list
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/tenders/${tender.tender_id}`}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-cyan-600 text-cyan-600 hover:bg-cyan-50 transition"
              >
                View Document
              </Link>
              {isInternalTeam && (
                <Link
                  href={`/admin/tenders/${tender.tender_id}`}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white transition"
                >
                  Edit Tender
                </Link>
              )}
            </div>
          </div>

          <div
            className="bg-white backdrop-blur-sm rounded-xl border border-gray-200 overflow-hidden shadow-sm"
            style={{ borderLeftColor: brandColor.borderColor, borderLeftWidth: "4px" }}
          >
            <div className="p-6 space-y-6">
              {/* Header with logo and display title */}
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div className="flex items-center gap-4">
                  {logoPath && (
                    <img
                      src={logoPath}
                      alt={fullBrandName}
                      className="h-12 w-auto object-contain"
                    />
                  )}
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{displayTitle}</h1>
                    <p className="text-gray-600 text-sm mt-1">
                      {fullBrandName} – {tender.branch_name}
                    </p>
                    {tender.branch_building_name && tender.branch_building_name !== tender.branch_name && (
                      <p className="text-gray-500 text-xs mt-0.5">
                        Building: {tender.branch_building_name}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass}`}>
                  {statusLabel}
                </span>
              </div>

              {/* Address */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-gray-500 text-xs uppercase tracking-wide">Location</h3>
                <p className="text-gray-900 text-sm mt-1">{fullAddress}</p>
              </div>

              {/* Description */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-gray-600 text-sm font-medium mb-2">Description</h3>
                <p className="text-gray-700 text-sm">
                  {tender.tender_description || "No description provided."}
                </p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-wide">Brand</h3>
                  <p className="text-gray-900 text-sm mt-1">{fullBrandName}</p>
                </div>
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-wide">Branch</h3>
                  <p className="text-gray-900 text-sm mt-1">{tender.branch_name}</p>
                </div>
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-wide">Building</h3>
                  <p className="text-gray-900 text-sm mt-1">{tender.branch_building_name || "—"}</p>
                </div>
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-wide">Work Type</h3>
                  <p className="text-gray-900 text-sm mt-1">{tender.renovation_type}</p>
                </div>
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-wide">Tender ID</h3>
                  <p className="text-gray-900 text-sm mt-1">#{String(tender.tender_id).padStart(4, "0")}</p>
                </div>
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-wide">Tender Period</h3>
                  <p className="text-gray-900 text-sm mt-1">
                    {formatDateRange(tender.tender_date, tender.closing_date)}
                  </p>
                </div>
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-wide">Renovation Period</h3>
                  <p className="text-gray-900 text-sm mt-1">
                    {formatDateRange(tender.renovation_start_date, tender.renovation_end_date)}
                  </p>
                </div>

                {isInternalTeam && (
                  <div>
                    <h3 className="text-gray-500 text-xs uppercase tracking-wide">Budget Forecast</h3>
                    <p className="text-gray-900 text-sm mt-1">{formatCurrency(tender.estimated_budget)}</p>
                  </div>
                )}

                {/* Project Manager section */}
                {(tender.project_manager_name || tender.project_manager_email || tender.project_manager_phone) && (
                  <div className="sm:col-span-2 border-t border-gray-200 pt-4 mt-2">
                    <h3 className="text-gray-600 text-sm font-medium mb-3">Project Manager</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {tender.project_manager_name && (
                        <div>
                          <span className="text-gray-500 text-xs uppercase tracking-wide">Name</span>
                          <p className="text-gray-900 text-sm mt-1">{tender.project_manager_name}</p>
                        </div>
                      )}
                      {tender.project_manager_email && (
                        <div>
                          <span className="text-gray-500 text-xs uppercase tracking-wide">Email</span>
                          <p className="text-gray-900 text-sm mt-1">
                            <a href={`mailto:${tender.project_manager_email}`} className="hover:underline">
                              {tender.project_manager_email}
                            </a>
                          </p>
                        </div>
                      )}
                      {tender.project_manager_phone && (
                        <div>
                          <span className="text-gray-500 text-xs uppercase tracking-wide">Phone</span>
                          <p className="text-gray-900 text-sm mt-1">
                            <a href={`tel:${tender.project_manager_phone}`} className="hover:underline">
                              {formatPhoneForDisplay(tender.project_manager_phone)}
                            </a>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Briefing Dates Section */}
              {tender.briefing_dates && tender.briefing_dates.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-gray-600 text-sm font-medium mb-3">Briefing Dates</h3>
                  <div className="space-y-2">
                    {tender.briefing_dates.map((briefing, index) => (
                      <div key={briefing.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                        <span className="text-gray-500 min-w-[180px]">
                          {formatDate(briefing.briefing_date)}
                        </span>
                        {briefing.description && (
                          <span className="text-gray-700">
                            {briefing.description}
                          </span>
                        )}
                        {index === 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-medium">
                            Primary
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-gray-400 text-xs text-right pt-2 border-t border-gray-200">
                Created: {formatDate(tender.created_at)}
                {tender.updated_at && ` • Updated: ${formatDate(tender.updated_at)}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}