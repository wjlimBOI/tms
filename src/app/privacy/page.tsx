// app/privacy/page.tsx
"use client";

import Link from 'next/link';
import {
  DocumentHeader,
  TableOfContents,
  SectionHeader,
  Clause,
} from '@/components/privacy';

export default function PrivacyPage() {
  const tocItems = [
    { id: 'section1', label: '1. Collection of Personal Data' },
    { id: 'section2', label: '2. Purposes of Collection, Use and Disclosure' },
    { id: 'section3', label: '3. Cookies, Account Information and Electronic Communications' },
    { id: 'section4', label: '4. Access, Correction, Disclosure and Retention' },
    { id: 'section5', label: '5. Protection and Security of Personal Data' },
    { id: 'section6', label: '6. Consent and Third-Party Services' },
    { id: 'section7', label: "7. Age Requirements and Children's Privacy" },
    { id: 'section8', label: '8. Changes to this Privacy Policy' },
    { id: 'section9', label: '9. Contact and Enquiries' },
    { id: 'section10', label: '10. Data Retention Periods' },
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#f7f4ee] font-sans text-slate-900 py-12 px-4 sm:px-6 lg:px-8 print:py-6 print:px-4 print:bg-white print:text-black">
      <div className="max-w-6xl mx-auto relative">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-[#15406a] print:hidden"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>

        {/* Print Button */}
        <div className="absolute top-0 right-0 z-10 print:hidden">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-md bg-[#15406a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d2d4a]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>

        <div className="mt-10 max-w-3xl">
          <DocumentHeader
            title="Privacy Policy"
            effectiveDate="19 June 2026"
            version="2.1"
            lastUpdated="14 August 2026"
          />
        </div>

        <div className="flex flex-col gap-8 md:flex-row">
          {/* Sidebar */}
          <div className="flex-shrink-0 md:w-64 print:hidden">
            <div className="md:sticky md:top-8">
              <TableOfContents items={tocItems} />
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 max-w-3xl">
            <div className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-slate-700 prose-p:leading-relaxed prose-p:text-base prose-a:text-[#15406a] print:prose-p:text-black print:prose-headings:text-black print:prose-a:text-black print:prose-strong:text-black">

              <p className="lead text-slate-600 text-lg">
                <strong>Privacy Commitment.</strong> At Beauty One International Pte Ltd., we value the privacy of our users and are committed to protecting the personal data entrusted to us. This Privacy Policy explains how we collect, use, store, disclose and protect personal data when you access or use the Tender Management System (&quot;TMS&quot; or the &quot;Platform&quot;). This Policy should be read together with our <a href="/terms" className="text-[#15406a] hover:underline">Terms of Use</a>.
              </p>

              <SectionHeader id="section1" level={2}>1. Collection of Personal Data</SectionHeader>
              <Clause number="1.1">
                We may collect personal data that you provide when your account is set up, when you use TMS, communicate with other Users, submit information through the Platform, contact us or otherwise interact with our services.
              </Clause>
              <Clause number="1.2">
                Depending on how you use TMS, the information we collect may include your name, email address, telephone number, company or organisation details, account credentials, business information, communications, documents and other information you choose to provide through the Platform.
              </Clause>
              <Clause number="1.3">
                We may also automatically collect certain technical and usage information when you use TMS, such as your IP address, browser type, device information, login activity, access times and information about how you interact with the Platform.
              </Clause>
              <Clause number="1.4">
                You are responsible for ensuring that personal data you provide through TMS is accurate and that you have the necessary authority or permission to provide personal data relating to another individual.
              </Clause>

              <SectionHeader id="section2" level={2}>2. Purposes of Collection, Use and Disclosure</SectionHeader>
              <Clause number="2.1">
                We collect and use personal data where reasonably necessary to provide, operate and maintain TMS, including creating and managing accounts, authenticating Users, facilitating Platform activities, processing submissions, providing communications and notifications, and supporting Users.
              </Clause>
              <Clause number="2.2">
                We may also use personal data to maintain security, prevent fraud and misuse, investigate incidents, maintain electronic records, improve the Platform, provide support, administer our business and comply with applicable laws, regulations or lawful requests.
              </Clause>
              <Clause number="2.3">
                Where you have chosen to receive optional communications, we may use your email address to send relevant Platform updates, alerts and other communications. You may disable optional email notifications through your account settings where this feature is available.
              </Clause>
              <Clause number="2.4">
                We will not use your personal data for purposes that are incompatible with the purposes described in this Privacy Policy unless permitted or required by applicable law or where we have obtained the appropriate consent.
              </Clause>

              <SectionHeader id="section3" level={2}>3. Cookies, Account Information and Electronic Communications</SectionHeader>
              <Clause number="3.1">
                TMS uses only strictly necessary cookies — session authentication and security (for example, CSRF protection) — to keep you signed in, maintain your session and protect your account. We do not use analytics, advertising or tracking cookies.
              </Clause>
              <Clause number="3.2">
                Because TMS uses only strictly necessary cookies, there are no optional cookies for you to manage or disable. You can block cookies entirely through your browser settings, but doing so will prevent you from logging in or using TMS.
              </Clause>
              <Clause number="3.3">
                When your account is created, we use your email address to deliver your welcome email and temporary credentials, verify account‑related actions such as password resets, and send security notices and Platform notifications.
              </Clause>
              <Clause number="3.4">
                You may enable or disable optional notification categories through your account settings where available. Disabling optional notifications does not prevent us from sending essential account, security, legal or service‑related communications.
              </Clause>
              <Clause number="3.5">
                We do not guarantee that emails or other electronic communications will always be successfully delivered, received or read.
              </Clause>

              <SectionHeader id="section4" level={2}>4. Access, Correction, Disclosure and Retention of Personal Data</SectionHeader>
              <Clause number="4.1">
                You may request access to or correction of personal data that we hold about you, subject to applicable law and our ability to verify your identity and authority.
              </Clause>
              <Clause number="4.2">
                Where appropriate and permitted by law, you may also request that your personal data be deleted or that consent previously provided be withdrawn. Withdrawal of consent may affect our ability to provide certain features or services, and we may continue to retain or process information where permitted or required by law.
              </Clause>
              <Clause number="4.3">
                Access to personal data within TMS is limited to authorised persons who require the information for legitimate business, operational, administrative, security or legal purposes.
              </Clause>
              <Clause number="4.4">
                We may disclose personal data to our authorised service providers, contractors, technology providers and other parties where reasonably necessary to operate and support TMS, provide services, maintain security, process information on our behalf or comply with applicable law.
              </Clause>
              <Clause number="4.5">
                We may also disclose personal data where required or permitted by law, regulation, court order, governmental authority or other lawful request, or where reasonably necessary to protect our rights, property, Users or the security of TMS.
              </Clause>
              <Clause number="4.6">
                We retain personal data for as long as reasonably necessary for the purposes for which it was collected, including account administration, business and operational requirements, security, dispute management, audit purposes and legal or regulatory obligations — see <a href="#section10" className="text-[#15406a] hover:underline">Section 10</a> for our retention periods by data category. When personal data is no longer required, we may securely delete, anonymise or otherwise dispose of it in accordance with our retention practices and applicable law.
              </Clause>
              <Clause number="4.7">
                Where personal data is processed by third‑party service providers on our behalf, we take reasonable steps to require appropriate handling and protection of that data.
              </Clause>

              <SectionHeader id="section5" level={2}>5. Protection and Security of Personal Data</SectionHeader>
              <Clause number="5.1">
                We take reasonable and appropriate measures to protect personal data against unauthorised access, collection, use, disclosure, alteration, loss or destruction.
              </Clause>
              <Clause number="5.2">
                These measures may include access controls, authentication mechanisms, encryption, system monitoring, secure storage, backups and other technical or organisational safeguards appropriate to the nature of the information and the risks involved.
              </Clause>
              <Clause number="5.3">
                However, no electronic system or method of transmission over the Internet can be guaranteed to be completely secure. You should take reasonable steps to protect your account credentials and devices.
              </Clause>
              <Clause number="5.4">
                If we become aware of a data breach or security incident affecting personal data, we will take appropriate steps to investigate, contain and address the incident and make any notifications required by applicable law.
              </Clause>

              <SectionHeader id="section6" level={2}>6. Consent and Third‑Party Services</SectionHeader>
              <Clause number="6.1">
                By using TMS, providing personal data to us or submitting information through the Platform, you acknowledge that your personal data may be collected, used and processed in accordance with this Privacy Policy, subject to applicable law.
              </Clause>
              <Clause number="6.2">
                Where consent is required by applicable law, we will seek the appropriate consent before collecting, using or disclosing personal data for the relevant purpose. You may withdraw consent where permitted by law, although doing so may affect our ability to provide certain services or features.
              </Clause>
              <Clause number="6.3">
                TMS may contain links to or integrations with third‑party websites, applications or services — for example, TMS loads map tiles directly from OpenStreetMap when displaying project or outlet locations, which may receive your IP address as part of that request. These third parties may have their own privacy policies and practices.
              </Clause>
              <Clause number="6.4">
                We are not responsible for the privacy, security or data‑handling practices of third‑party websites or services that we do not control. You should review the privacy policy of any third‑party service before providing personal data to it.
              </Clause>

              <SectionHeader id="section7" level={2}>7. Age Requirements and Children&apos;s Privacy</SectionHeader>
              <Clause number="7.1">
                TMS is intended only for individuals who are 18 years of age or older.
              </Clause>
              <Clause number="7.2">
                You must be at least 18 years old to hold or use a TMS account. By using TMS, you represent that you meet this requirement.
              </Clause>
              <Clause number="7.3">
                TMS is not intended for children or persons below 18 years of age, and we do not knowingly permit persons below 18 to hold or use an account.
              </Clause>
              <Clause number="7.4">
                If we become aware that an account has been created or maintained by a person below 18 years of age, we may suspend or terminate the account and take reasonable steps to delete the associated personal data, subject to any legal or operational requirement to retain such information.
              </Clause>

              <SectionHeader id="section8" level={2}>8. Changes to this Privacy Policy</SectionHeader>
              <Clause number="8.1">
                We may update this Privacy Policy from time to time to reflect changes to TMS, our practices, applicable laws or regulatory requirements.
              </Clause>
              <Clause number="8.2">
                Where material changes are made, we may notify Users through TMS, email or other reasonable means.
              </Clause>
              <Clause number="8.3">
                The latest version of this Privacy Policy will be published on TMS with the updated &quot;Last Updated&quot; date.
              </Clause>
              <Clause number="8.4">
                Your continued use of TMS after an updated Privacy Policy takes effect constitutes acknowledgement of the updated Policy. If you do not agree with the changes, you should stop using TMS and may contact us regarding your account and personal data.
              </Clause>

              <SectionHeader id="section9" level={2}>9. Contact and Enquiries</SectionHeader>
              <Clause number="9.1">
                If you have questions, concerns, requests relating to your personal data, or feedback regarding this Privacy Policy, please contact us at:
                <br /><br />
                <strong>Beauty One International Pte Ltd.</strong><br />
                Attn: Data Protection Officer<br />
                2 Venture Drive, #21‑01, VISION EXCHANGE, Singapore 608526<br />
                Email: dpo@beautyone.com.sg<br />
                Data subject requests: tender_enquiries@beautyone.com.sg
              </Clause>
              <Clause number="9.2">
                When making an access, correction, deletion or other personal data request, we may need to verify your identity before processing the request.
              </Clause>

              <SectionHeader id="section10" level={2}>10. Data Retention Periods</SectionHeader>
              <Clause number="10.1">
                In addition to the general retention principle in Section 4.6, the table below sets out the specific retention periods we apply to the main categories of data processed through TMS.
              </Clause>
              <div className="overflow-x-auto my-6">
                <table className="min-w-full text-sm border border-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">Data Category</th>
                      <th className="px-5 py-3 text-left font-semibold">Retention Period</th>
                      <th className="px-5 py-3 text-left font-semibold">Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-200"><td className="px-5 py-3">Financial Audit Records</td><td className="px-5 py-3">7 years from end of financial year</td><td className="px-5 py-3">Statutory audit and regulatory compliance</td></tr>
                    <tr className="border-t border-slate-200 bg-slate-50/50"><td className="px-5 py-3">Commercial &amp; Pricing Data (BQ)</td><td className="px-5 py-3">7 years</td><td className="px-5 py-3">Tax and financial audit compliance</td></tr>
                    <tr className="border-t border-slate-200"><td className="px-5 py-3">Contractual Documents</td><td className="px-5 py-3">7 years from contract expiry/termination</td><td className="px-5 py-3">Legal claims limitation periods</td></tr>
                    <tr className="border-t border-slate-200 bg-slate-50/50"><td className="px-5 py-3">Contractor / Bidder Profiles</td><td className="px-5 py-3">5 years</td><td className="px-5 py-3">Maintain historical contractor profiles for future procurement cycles</td></tr>
                    <tr className="border-t border-slate-200"><td className="px-5 py-3">Active Tender Records</td><td className="px-5 py-3">Duration of tender process + 3 years</td><td className="px-5 py-3">Facilitate post‑tender queries, audits, historical reference</td></tr>
                    <tr className="border-t border-slate-200 bg-slate-50/50"><td className="px-5 py-3">Access &amp; Technical Logs</td><td className="px-5 py-3">2 years</td><td className="px-5 py-3">Security monitoring, incident investigation, forensic analysis</td></tr>
                    <tr className="border-t border-slate-200"><td className="px-5 py-3">Declined Tender Data</td><td className="px-5 py-3">2 years (post‑closing)</td><td className="px-5 py-3">Permit fair challenge processes and historical analysis</td></tr>
                  </tbody>
                </table>
              </div>
              <Clause number="10.2">
                Data may be retained longer if required to establish, exercise, or defend a legal claim, or where mandated by applicable law.
              </Clause>

              <p className="mt-14 text-xs text-slate-400 border-t border-slate-200 pt-6">
                This Privacy Policy is provided for informational purposes and does not constitute legal advice. Copyright © 2026 Beauty One International Pte Ltd. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
