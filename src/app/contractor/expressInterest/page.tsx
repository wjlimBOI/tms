"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const EMAIL = "tender_enquiries@beautyone.com.sg";
const EMAIL_HREF = `mailto:${EMAIL}?subject=Expression%20of%20Interest%20-%20Renovation%20Contract`;

type ReferenceTab =
  | { id: string; label: string; kind: "text"; body: string }
  | { id: string; label: string; kind: "pdf"; body: string; href: string }
  | { id: string; label: string; kind: "steps" };

interface FlowStep {
  title: string;
  description: string;
}

// The real end-to-end path from this application to an awarded contract —
// see docs/system-workflow.md §3 ("The Contractor Journey") for the source
// of truth this is kept in sync with. Steps 1-2 happen outside the platform
// (this form, reviewed by the FM team over email); step 3 onward happens
// once a contractor has a live account.
const FLOW_STEPS: FlowStep[] = [
  {
    title: "Submit your Expression of Interest",
    description:
      "Complete this form and email the required company, personnel, financial, and project-experience documents to our Facilities Management team.",
  },
  {
    title: "Application review",
    description:
      "Our Facilities Management team reviews your company profile, compliance documentation, and track record against the requirements above.",
  },
  {
    title: "Account setup",
    description:
      "Approved contractors are registered on the platform and receive login access to view and respond to tenders.",
  },
  {
    title: "Register interest in open tenders",
    description:
      "Browse open tenders on the platform and register interest to unlock full project details, contact information, and tender documents.",
  },
  {
    title: "Submit your Bill of Quantities (BQ)",
    description:
      "Acknowledge the Form of Tender, then build and submit your itemised pricing before the tender closes. You can revise a submission at any point while the tender is still open.",
  },
  {
    title: "Evaluation",
    description:
      "Our team compares submissions from all participating contractors. You may occasionally be asked for a revised quote — you'll be notified by email and in-app if so, with a clear deadline.",
  },
  {
    title: "Award outcome",
    description:
      "Every participant receives a decision by email. The winning contractor proceeds to contract handover and Defects Liability Period tracking; all other participants retain a record of the tender.",
  },
];

const REFERENCE_TABS: ReferenceTab[] = [
  {
    id: "terms",
    label: "Terms & Conditions",
    kind: "text",
    body: "Sample Terms & Conditions document — this is a reference sample for review purposes only. The final Terms & Conditions will be provided upon successful selection.",
  },
  {
    id: "payment",
    label: "Payment Procedure",
    kind: "text",
    body: "Sample Payment Procedure document — this is a reference sample for review purposes only. The final payment procedure will be provided upon successful selection.",
  },
  {
    id: "dlp",
    label: "Defects Liability Period",
    kind: "text",
    body: "Sample Defects Liability Period (DLP) document — this is a reference sample for review purposes only. The final DLP document will be provided upon successful selection.",
  },
  {
    id: "contract",
    label: "Contract Document",
    kind: "pdf",
    href: "/documents/Refurb_Template.pdf",
    body: "This is a reference sample for review purposes only. The final contract document will be provided upon successful selection.",
  },
  {
    id: "process",
    label: "Tender Process",
    kind: "text",
    body: "Sample Tender Process overview — this is a reference sample for review purposes only. The final tender process will be provided upon successful selection.",
  },
  {
    id: "flow",
    label: "Flow of Events",
    kind: "steps",
  },
];

const PROJECT_ROWS = ["Current Project 1", "Current Project 2", "Past Project 1", "Past Project 2"];
const PROJECT_FIELDS = [
  { label: "Contract Period", value: "[Start – End Date]" },
  { label: "Site Description", value: "[Location, Size]" },
  { label: "Contract Sum (SGD)", value: "[1,250,000]" },
  { label: "Client / Developer", value: "[Client Name]" },
];

interface Row {
  label: string;
  value: string;
  required?: boolean;
}

// A single, imperfect brushstroke — the page's recurring hand-drawn divider.
function BrushDivider({ className = "" }: { className?: string }) {
  return (
    <svg width="88" height="10" viewBox="0 0 88 10" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 6C9 2 16 8.5 23 5C30 1.5 37 8 44 4.5C51 1 58 7.5 65 4C70 2 76 4.5 86 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RequiredMark() {
  return (
    <span className="ml-0.5 text-red-600" aria-hidden="true">
      *
    </span>
  );
}

// A single label / value line — reads as a document field, not a form input.
function InfoRow({ label, value, required }: Row) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-6">
      <span className="min-w-[200px] shrink-0 text-sm font-medium text-slate-900">
        {label}
        {required && <RequiredMark />}
      </span>
      <span className="text-sm text-slate-500">{value}</span>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-slate-200 py-10 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-2xl font-bold text-slate-900 sm:text-[26px]">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function FlowOfEvents({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, i) => (
        <li key={step.title} className="relative flex gap-4 pb-8 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px bg-[#15406a]/20"
            />
          )}
          <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#15406a] bg-[#f7f4ee] text-sm font-bold text-[#15406a]">
            {i + 1}
          </span>
          <div className="pt-0.5">
            <p className="text-base font-bold text-slate-900">{step.title}</p>
            <p className="mt-1 text-sm leading-[1.7] text-slate-600">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function isReferenceTabId(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_TABS.some((t) => t.id === value);
}

export default function ExpressInterestPage() {
  const [activeTab, setActiveTab] = useState<string>(REFERENCE_TABS[0].id);

  return (
    <div className="min-h-screen bg-[#f7f4ee] font-sans text-slate-900">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16 lg:max-w-3xl lg:px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-[#15406a]"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>

        {/* Header */}
        <div className="mt-8">
          <span className="inline-flex items-center rounded-full border border-[#15406a]/25 bg-[#15406a]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#15406a]">
            Contractor Application
          </span>
          <h1 className="mt-4 font-serif text-4xl font-bold text-slate-900 sm:text-5xl">Expression of Interest</h1>
          <p className="mt-2 text-base font-medium text-slate-600">Renovation Contract</p>

          <BrushDivider className="mt-6 text-[#15406a]/70" />

          <p className="mt-6 max-w-xl text-[15px] leading-[1.8] text-slate-600">
            Our commitment to transparency and fairness ensures every applicant receives equal consideration based
            on merit and capability. Review the requirements below, then send the requested information and
            documents by email to our Facilities Management team.
          </p>
        </div>

        {/* Required legend */}
        <p className="mb-10 mt-8 text-sm text-slate-500">
          Items marked <span className="text-red-600">*</span> are required and must be included in your submission.
        </p>

        {/* Content */}
        <div>
          <Section
            id="documents"
            title="Contract Information"
            description="Review the following reference documents before submitting your interest."
          >
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                if (isReferenceTabId(value)) setActiveTab(value);
              }}
            >
              <TabsList
                variant="line"
                className="h-auto w-full flex-wrap items-center justify-start gap-x-6 gap-y-2 rounded-none border-b border-slate-200 bg-transparent p-0 pb-3 group-data-[orientation=horizontal]/tabs:h-auto"
              >
                {REFERENCE_TABS.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="h-auto flex-none justify-start rounded-none border-transparent px-0 py-0 pb-1 text-sm font-normal text-slate-400 transition hover:text-slate-600 after:bg-[#15406a] data-active:bg-transparent data-active:text-slate-900 data-active:shadow-none"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {REFERENCE_TABS.map((t) => (
                <TabsContent key={t.id} value={t.id} className="pt-6">
                  {t.kind === "pdf" ? (
                    <>
                      <p className="mb-3 text-sm text-slate-600">
                        View the full contract document for renovation projects.
                      </p>
                      <div className="h-[65vh] min-h-[400px] w-full overflow-hidden border border-slate-200 bg-white">
                        <iframe src={t.href} title="Contract Document" className="h-full w-full border-0" />
                      </div>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-400">{t.body}</p>
                        <a
                          href={t.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: "outline" }),
                            "h-auto shrink-0 gap-2 rounded-md border-2 border-[#15406a] bg-white px-4 py-2 text-sm font-semibold text-[#15406a] shadow-sm hover:bg-[#15406a] hover:text-white"
                          )}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
                          </svg>
                          Download PDF
                        </a>
                      </div>
                    </>
                  ) : t.kind === "steps" ? (
                    <FlowOfEvents steps={FLOW_STEPS} />
                  ) : (
                    <p className="text-[15px] leading-[1.8] text-slate-600">{t.body}</p>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </Section>

          <Section
            id="company"
            title="Company Details"
            description="Company information, capabilities, and organizational structure."
          >
            <InfoRow label="Company Name" value="Full registered company name" required />
            <InfoRow label="Company Strength" value="Core competencies, key personnel, operational capabilities" required />
            <InfoRow label="Organisation Chart" value="PDF or image — max 10MB" required />
          </Section>

          <Section id="personnel" title="Authorized Personnel" description="Primary contacts from your company.">
            <p className="mb-1.5 text-base font-bold text-slate-900">Director — Primary Authority</p>
            <InfoRow label="Full Name" value="Director's name" required />
            <InfoRow label="Official Email" value="director@company.com" required />
            <InfoRow label="Phone Number" value="+65 XXXX XXXX" required />
            <p className="mb-1.5 mt-6 text-base font-bold text-slate-900">Project Manager — Operational Lead</p>
            <InfoRow label="Full Name" value="Project manager's name" required />
            <InfoRow label="Official Email" value="pm@company.com" required />
            <InfoRow label="Phone Number" value="+65 XXXX XXXX" required />
          </Section>

          <Section
            id="financial"
            title="Financial & Legal"
            description="Required documentation for compliance and evaluation."
          >
            <InfoRow label="BIZ File" value="Business registration — PDF, image, or ZIP, max 10MB" required />
            <InfoRow label="BIZ Safe Certificate" value="PDF, image, or ZIP — max 10MB" required />
            <InfoRow label="Financial Audit" value="Most recent — PDF or image, max 10MB" required />
            <InfoRow label="Bank Record Letter" value="PDF or image — max 10MB" />
            <InfoRow label="Bank Records" value="Past 2 years — PDF or image, max 10MB" required />
            <InfoRow label="Risk Verification" value="Credit reports, solvency letters, insurance — PDF or image, max 10MB" />
          </Section>

          <Section
            id="gst"
            title="GST Registration"
            description="If your company is GST-registered, please provide the following."
          >
            <InfoRow label="GST Registration Number" value="Your GST registration number" />
            <InfoRow label="GST Certificate" value="PDF or image — max 10MB" />
          </Section>

          <Section
            id="experience"
            title="Corporate Experience"
            description="Provide details of at least two current and two past projects."
          >
            {/* Cards below md — keeps every field readable with zero horizontal scrolling */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
              {PROJECT_ROWS.map((row) => (
                <div key={row} className="border border-slate-200 p-4">
                  <p className="mb-2 text-sm font-medium text-slate-900">[{row} Name]</p>
                  <div className="space-y-1.5">
                    {PROJECT_FIELDS.map((f) => (
                      <div key={f.label} className="flex flex-col text-xs">
                        <span className="text-slate-400">{f.label}</span>
                        <span className="text-slate-500">{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Table at md+ */}
            <div className="hidden overflow-hidden border border-slate-200 md:block">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {["Project Name", "Contract Period", "Site Description", "Contract Sum (SGD)", "Client / Developer"].map(
                      (col) => (
                        <th
                          key={col}
                          className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-900"
                        >
                          {col}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PROJECT_ROWS.map((row) => (
                    <tr key={row}>
                      <td className="px-4 py-2.5 text-center text-slate-500">[{row} Name]</td>
                      {PROJECT_FIELDS.map((f) => (
                        <td key={f.label} className="px-4 py-2.5 text-center text-slate-500">
                          {f.value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {/* Submit */}
        <div className="border-t border-slate-200 pt-10 text-center">
          <h2 className="font-serif text-2xl font-bold text-slate-900 sm:text-[28px]">Ready to submit?</h2>
          <BrushDivider className="mx-auto mt-4 text-[#15406a]/70" />
          <p className="mx-auto mt-6 max-w-md text-[15px] leading-[1.8] text-slate-600">
            Compile all required information and supporting documents into a single email addressed to{" "}
            <span className="text-slate-900">{EMAIL}</span>
          </p>
          <a
            href={EMAIL_HREF}
            className={cn(
              buttonVariants({ variant: "default" }),
              "mt-7 h-auto gap-2.5 rounded-md bg-[#15406a] px-9 py-4 text-base font-bold tracking-wide text-white shadow-md hover:-translate-y-0.5 hover:bg-[#0d2d4a] hover:shadow-lg"
            )}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Submit Interest via Email
          </a>
        </div>
      </div>
    </div>
  );
}
