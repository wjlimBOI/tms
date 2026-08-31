"use client";

import { Fragment } from "react";
import { Printer } from "lucide-react";
import { DEFAULT_CRITICAL, DEFAULT_SCOPE, DEFAULT_TERMS } from "@/lib/tenderClauses";
import { FORM_OF_TENDER_ITEMS } from "@/lib/tenderFormItems";
import {
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_TEL,
  DEFAULT_COMPANY_FAX,
  DEFAULT_PM_NAME,
  DEFAULT_PM_EMAIL,
  DEFAULT_PM_PHONE,
  DEFAULT_SUBMISSION_EMAIL,
} from "@/lib/tenderConstants";

const PLACEHOLDER_TENDER_TITLE = "[Tender Title]";
const PLACEHOLDER_DATE = "[Closing Date]";
const PLACEHOLDER_CLIENT = "[Client Company Name]";
const BLANK_EXPERIENCE_ROWS = 5;
const BLANK_COMMITMENT_ROWS = 5;

function substitutePlaceholders(description: string): string {
  return description
    .replace(/<tender title>/g, PLACEHOLDER_TENDER_TITLE)
    .replace(/<date>/g, PLACEHOLDER_DATE);
}

export default function BlankTenderTemplatePreview() {
  const handlePrint = () => window.print();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex justify-between items-center mb-4 print:hidden">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Blank Tender Template</h2>
          <p className="text-sm text-gray-500 mt-1">
            A complete reference copy of the standard tender document — every section, table and
            signature block a real tender document has — with tender-specific fields left blank.
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-[#15406a] rounded-md bg-white text-[#15406a] hover:bg-[#15406a] hover:text-white transition-colors shrink-0"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          Print
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl p-6 sm:p-8 print:border-none print:p-0 print:shadow-none space-y-10 print:space-y-8">
        {/* Title */}
        <div className="text-center">
          <p className="text-3xl sm:text-4xl font-extrabold uppercase tracking-wider text-slate-800">
            Tender Document
          </p>
          <p className="text-sm font-medium text-amber-600 mt-1">Blank Template — For Reference Only</p>
          <hr className="border-t-2 border-amber-600 w-24 mx-auto my-4" />
          <p className="text-xl sm:text-2xl font-light text-slate-800">{PLACEHOLDER_TENDER_TITLE}</p>
        </div>

        {/* Project Team */}
        <div className="border border-slate-200/80 bg-slate-50/30 rounded-xl p-4 sm:p-6 print:border-none print:bg-white">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Project Team</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Field label="Company" value={PLACEHOLDER_CLIENT} />
              <Field label="Address" value={DEFAULT_COMPANY_ADDRESS} />
              <Field label="Attention" value={DEFAULT_PM_NAME} />
              <Field label="Email" value={DEFAULT_PM_EMAIL} />
            </div>
            <div className="space-y-4">
              <Field label="Mobile" value={DEFAULT_PM_PHONE} />
              <Field label="Telephone" value={DEFAULT_COMPANY_TEL} />
              <Field label="Fax" value={DEFAULT_COMPANY_FAX} />
            </div>
          </div>
        </div>

        {/* Critical Considerations */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">SCHEDULE OF CRITICAL PROJECT CONSIDERATIONS</h2>
          <div className="space-y-3">
            {DEFAULT_CRITICAL.map((clause, idx) => {
              if (clause.title === "2) CRITICAL DATES") {
                return (
                  <div key={idx} className="break-inside-avoid-page">
                    <div className="font-bold text-slate-800">{clause.title}</div>
                    <div className="ml-4 text-slate-500 italic text-sm">
                      Filled in automatically from the tender&apos;s schedule once a real tender is created.
                    </div>
                  </div>
                );
              }
              if (clause.title === "3) SUBMISSION OF TENDER") {
                const parts = substitutePlaceholders(clause.description).split("<submission email>");
                return (
                  <div key={idx} className="break-inside-avoid-page">
                    <div className="font-bold text-slate-800">{clause.title}</div>
                    <div className="ml-4 text-slate-700 whitespace-pre-wrap">
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
                return (
                  <div key={idx} className="break-inside-avoid-page">
                    <div className="font-bold text-slate-800">{clause.title}</div>
                    <div className="ml-4 text-slate-700 space-y-1">
                      <p>Any enquiries regarding the Tender Documents should be referred to in writing to:</p>
                      <p><strong>{DEFAULT_PM_NAME}</strong></p>
                      <p><strong>Project Manager</strong></p>
                      <p><strong style={{ whiteSpace: "pre-line" }}>{DEFAULT_COMPANY_ADDRESS}</strong></p>
                      <p><strong>Tel: {DEFAULT_COMPANY_TEL}</strong></p>
                      <p><strong>Email: {DEFAULT_PM_EMAIL}</strong></p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={idx} className="break-inside-avoid-page">
                  <div className="font-bold text-slate-800">{clause.title}</div>
                  <div className="ml-4 text-slate-700 whitespace-pre-wrap">
                    {substitutePlaceholders(clause.description)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scope of Contract */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">SCOPE OF CONTRACT</h2>
          <div className="space-y-3">
            {DEFAULT_SCOPE.map((clause, idx) => (
              <div key={idx} className="break-inside-avoid-page">
                <div className="font-bold text-slate-800">{clause.title}</div>
                <div className="ml-4 text-slate-700 whitespace-pre-wrap">{clause.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Agreed and Confirmed By */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">AGREED AND CONFIRMED BY</h2>
          <div className="space-y-4 max-w-xl">
            <BlankLine label="Name of Contractor / Tenderer" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <BlankBox label="Signature" />
              <BlankBox label="Company Stamp" />
            </div>
            <BlankLine label="Date" />
          </div>
        </div>

        {/* Terms & Conditions */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">TERMS AND CONDITIONS OF TENDER</h2>
          <div className="space-y-3">
            {DEFAULT_TERMS.map((clause, idx) => (
              <div key={idx} className="break-inside-avoid-page">
                <div className="font-bold text-slate-800">{clause.header}</div>
                <div className="ml-4 text-slate-700 whitespace-pre-wrap">
                  {clause.header === "2) TERMINOLOGIES"
                    ? `The Term "Company" in the contract shall mean ${PLACEHOLDER_CLIENT}.`
                    : clause.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Form of Tender */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">FORM OF TENDER</h2>
          <div className="space-y-3 text-sm">
            <p className="font-medium text-slate-700">
              <strong>To:</strong> {PLACEHOLDER_CLIENT}
              <br />
              <strong style={{ whiteSpace: "pre-line" }}>{DEFAULT_COMPANY_ADDRESS}</strong>
            </p>
            <p className="text-slate-700">Dear Sir / Madam</p>
            <p className="text-slate-700">
              1. Having inspected the site, and examined the Tender Documents, we submit a total sum quoted for
              Singapore Dollars:
            </p>
            <p className="font-semibold text-slate-800">
              TOTAL LUMP SUM{" "}
              <span className="border-b border-slate-400 inline-block w-40 text-right">&nbsp;</span> SGD
            </p>
            {FORM_OF_TENDER_ITEMS.map((text, i) => (
              <p key={i} className="text-slate-700">
                {text}
              </p>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 max-w-3xl mt-6">
            <div className="space-y-4">
              <BlankLine label="Signature of Tenderer" />
              <BlankLine label="Full Name" />
              <BlankLine label="Position in Company" />
              <BlankLine label="Name of Company" />
              <BlankLine label="Address of Company" />
              <BlankLine label="Company Stamp" />
              <BlankLine label="Date" />
            </div>
            <div className="space-y-4">
              <BlankLine label="Signature of Witness" />
              <BlankLine label="Full Name" />
              <BlankLine label="Address of Witness" />
              <BlankLine label="Date" />
            </div>
          </div>
        </div>

        {/* Contractor's Declaration */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">CONTRACTOR&apos;S DECLARATION</h2>
          <p className="text-sm text-slate-600 mb-4">
            This page confirms understanding and irrevocable acceptance of the Tender Documents and Drawings.
          </p>
          <div className="space-y-4 max-w-xl">
            <BlankLine label="I," />
            <BlankLine label="on behalf of" />
            <p className="italic text-slate-700">have fully examined the Tender Documents and irrevocably agree.</p>
            <BlankLine label="Name of Tenderer" />
            <BlankLine label="Address of Tenderer" />
            <BlankLine label="Date" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <BlankBox label="Signature of Tenderer" />
              <BlankBox label="Company Stamp" />
            </div>
          </div>
        </div>

        {/* Relevant Project Experience */}
        <div>
          <h3 className="text-xl font-bold text-slate-800 tracking-wide mb-2 uppercase">Relevant Project Experience</h3>
          <p className="text-xs text-slate-500 mb-4">Provide at least 5 projects of similar nature.</p>
          <BlankTable
            columns={["Project Name", "Value (SGD)", "Date", "Designer"]}
            rowCount={BLANK_EXPERIENCE_ROWS}
          />
        </div>

        {/* Current Project Commitment */}
        <div>
          <h3 className="text-xl font-bold text-slate-800 tracking-wide mb-2 uppercase">Current Project Commitment</h3>
          <p className="text-xs text-slate-500 mb-4">Provide particulars of projects presently engaged in.</p>
          <BlankTable
            columns={["Project Name", "Value (SGD)", "Percentage Completed", "Designer"]}
            rowCount={BLANK_COMMITMENT_ROWS}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col space-y-1">
      <label className="text-xs font-bold tracking-wider text-slate-800 uppercase">{label}</label>
      <span className="text-sm sm:text-base text-slate-700 whitespace-pre-line">{value}</span>
    </div>
  );
}

function BlankLine({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-3">
      <label className="text-sm font-medium text-slate-700 shrink-0">{label}</label>
      <span className="flex-1 border-b border-slate-400 h-5" aria-hidden="true" />
    </div>
  );
}

function BlankBox({ label }: { label: string }) {
  return (
    <div className="flex flex-col space-y-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="h-20 border border-dashed border-slate-300 rounded-md bg-slate-50/50" aria-hidden="true" />
    </div>
  );
}

function BlankTable({ columns, rowCount }: { columns: string[]; rowCount: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse border border-slate-200">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 divide-x divide-slate-200">
            {columns.map((col) => (
              <th key={col} className="p-3 text-xs font-bold text-slate-600 uppercase text-center border border-slate-300">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: rowCount }).map((_, rowIdx) => (
            <tr key={rowIdx} className="divide-x divide-slate-100">
              {columns.map((col) => (
                <td key={col} className="p-3 border border-slate-300 h-10">
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
