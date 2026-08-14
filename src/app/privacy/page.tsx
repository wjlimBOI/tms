// app/privacy/page.tsx
"use client";

import Link from 'next/link';
import {
  DocumentHeader,
  TableOfContents,
  SectionHeader,
  LegalList,
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
    { id: 'appendix', label: 'Appendix A: Data Retention Periods' },
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
            version="1.1"
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
            <div className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-slate-700 prose-p:leading-relaxed prose-p:text-base prose-a:text-[#15406a] prose-ul:space-y-2 prose-li:marker:text-slate-500 print:prose-p:text-black print:prose-headings:text-black print:prose-a:text-black print:prose-strong:text-black">

              <p className="lead text-slate-600 text-lg">
                <strong>Privacy Commitment.</strong> At Beauty One International Pte Ltd. (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), we value the privacy of our users and are committed to protecting the personal data entrusted to us. This Privacy Policy (the &quot;Policy&quot;) explains how we collect, use, store, disclose and protect personal data when you access or use the Tender Management System (&quot;TMS&quot; or the &quot;Platform&quot;), in compliance with the Singapore Personal Data Protection Act (<strong>PDPA</strong>). This Policy should be read together with our <a href="/terms" className="text-[#15406a] hover:underline">Terms of Service</a>.
              </p>

              <p className="mt-6">This Policy applies to all users of TMS, including:</p>
              <LegalList
                items={[
                  <span key="1">
                    <strong>Internal Team Members:</strong> Admin, Finance GM, FM Regional Director, Legal Team and other authorised personnel who access TMS for project governance, tender management, and operational oversight.
                  </span>,
                  <span key="2">
                    <strong>Contractors:</strong> Third‑party contracting firms and their authorised personnel who express interest in, and submit tender bids, Bills of Quantities and related documentation through TMS.
                  </span>,
                ]}
              />

              <SectionHeader id="section1" level={2}>1. Collection of Personal Data</SectionHeader>
              <p>TMS accounts are created for you by our Admin users, not through self‑registration — but we still collect personal data at account creation and throughout your subsequent use of the Platform.</p>
              <LegalList
                items={[
                  <span key="1-1"><strong>Account &amp; Profile Data:</strong> Full name, official job title, corporate email address, telephone number, company or organisation details, and account credentials (securely hashed, never stored in plain text).</span>,
                  <span key="1-2"><strong>Platform Activity Data:</strong> Tender interest expressions, Bill of Quantities (BQ) submissions and pricing, extension‑of‑time requests, in‑tender messages sent to other Users, comments, and documents you upload.</span>,
                  <span key="1-3"><strong>Communications:</strong> Records of correspondence when you contact us, and messages exchanged with other Users through TMS&rsquo;s in‑tender messaging feature.</span>,
                  <span key="1-4"><strong>Technical &amp; Usage Data:</strong> IP address, browser type and version, device information, login activity (successful and failed attempts), access times, and audit‑trail records of actions taken within TMS.</span>,
                ]}
              />
              <p>You are responsible for ensuring that personal data you provide through TMS is accurate, and that you have the necessary authority or permission to provide personal data relating to another individual (for example, naming a colleague in a submission).</p>

              <SectionHeader id="section2" level={2}>2. Purposes of Collection, Use and Disclosure</SectionHeader>
              <LegalList
                items={[
                  <span key="2-1"><strong>Operating TMS:</strong> Creating and managing accounts, authenticating Users, facilitating tender and BQ workflows, processing submissions, and providing in‑app and email notifications.</span>,
                  <span key="2-2"><strong>Security &amp; Compliance:</strong> Maintaining security, preventing fraud and misuse, investigating incidents, maintaining audit‑trail records, and complying with applicable laws, regulations or lawful requests.</span>,
                  <span key="2-3"><strong>Business Administration:</strong> Improving the Platform, providing support, and administering our business, including financial and statutory audit requirements.</span>,
                ]}
              />
              <p>Where you have chosen to receive optional communications, we may use your email address to send relevant Platform updates, deadline reminders and other alerts. You may disable optional email notifications through your notification preferences settings. We will not use your personal data for purposes incompatible with those described in this Policy unless permitted or required by applicable law.</p>

              <SectionHeader id="section3" level={2}>3. Cookies, Account Information and Electronic Communications</SectionHeader>
              <p>TMS uses only strictly necessary cookies — session authentication and security (e.g., CSRF protection) — to keep you signed in and protect your account. We do not use analytics, advertising, or third‑party tracking cookies. You can manage or block cookies through your browser settings, though because TMS uses only essential cookies, disabling them will prevent you from logging in or using TMS.</p>
              <p>When your account is created, we use your email address to deliver your welcome email and temporary credentials, verify account‑related actions such as password resets, and send security notices (for example, alerts of a new login) and Platform notifications. You may enable or disable optional notification categories through your account settings; disabling optional notifications does not prevent us from sending essential account, security, legal or service‑related communications. We do not guarantee that emails or other electronic communications will always be successfully delivered, received or read — you remain responsible for monitoring your TMS account directly.</p>

              <SectionHeader id="section4" level={2}>4. Access, Correction, Disclosure and Retention of Personal Data</SectionHeader>
              <LegalList
                items={[
                  <span key="4-1"><strong>Access &amp; Correction:</strong> You may request access to or correction of personal data we hold about you, subject to applicable law and our ability to verify your identity and authority. Requests are handled by our Legal Team / Data Protection Officer, who can retrieve a full record of what TMS holds about a given user.</span>,
                  <span key="4-2"><strong>Deletion &amp; Withdrawal of Consent:</strong> Where appropriate and permitted by law, you may request deletion of your personal data or withdraw previously provided consent. This may affect our ability to provide certain features, and we may continue to retain information where permitted or required by law (for example, financial audit records).</span>,
                  <span key="4-3"><strong>Internal Access:</strong> Access to personal data within TMS is role‑based and limited to authorised persons who require the information for legitimate business, operational, administrative, security or legal purposes.</span>,
                  <span key="4-4"><strong>Service Providers:</strong> We disclose personal data to our authorised service providers (such as our email delivery provider and cloud hosting infrastructure) only as reasonably necessary to operate and support TMS, and we take reasonable steps to require appropriate handling and protection of that data.</span>,
                  <span key="4-5"><strong>Legal Disclosure:</strong> We may disclose personal data where required or permitted by law, regulation, court order, governmental authority or other lawful request, or where reasonably necessary to protect our rights, property, Users or the security of TMS.</span>,
                ]}
              />
              <p>We retain personal data for as long as reasonably necessary for the purposes for which it was collected, including account administration, business and operational requirements, security, dispute management, audit purposes and legal or regulatory obligations — see <a href="#appendix" className="text-[#15406a] hover:underline">Appendix A</a> for our retention periods by data category. When personal data is no longer required, we securely delete it, anonymise it for analytical purposes where beneficial, or archive it in encrypted, access‑controlled storage for legal hold purposes.</p>

              <SectionHeader id="section5" level={2}>5. Protection and Security of Personal Data</SectionHeader>
              <p>We take reasonable and appropriate technical and organisational measures to protect personal data against unauthorised access, collection, use, disclosure, alteration, loss or destruction.</p>
              <LegalList
                items={[
                  <span key="5-1"><strong>Encryption:</strong> Data transmitted between client devices and our servers is encrypted in transit (TLS), with certificate verification enforced in production. Select highly sensitive fields are encrypted at the application layer using AES‑256‑GCM before storage.</span>,
                  <span key="5-2"><strong>Access Controls:</strong> Role‑Based Access Control (RBAC) enforces access to each feature and data category per‑request based on your assigned role. Sessions expire automatically after a period of inactivity, requiring re‑authentication, and password complexity is enforced.</span>,
                  <span key="5-3"><strong>Monitoring:</strong> Login attempts (successful and failed) are recorded with IP address and device information, and account holders are alerted by email of new logins. Comprehensive audit trails record data access, modification and deletion events.</span>,
                  <span key="5-4"><strong>Backups:</strong> Regular database backups are maintained to support recovery in the event of data loss.</span>,
                ]}
              />
              <p>However, no electronic system or method of transmission over the Internet can be guaranteed to be completely secure. You should take reasonable steps to protect your account credentials and devices. If we become aware of a data breach or security incident affecting personal data, we will take appropriate steps to investigate, contain and address the incident, and notify affected data subjects and the Personal Data Protection Commission (PDPC) where the breach is notifiable under the PDPA.</p>

              <SectionHeader id="section6" level={2}>6. Consent and Third-Party Services</SectionHeader>
              <p>By using TMS, providing personal data to us or submitting information through the Platform, you acknowledge that your personal data may be collected, used and processed in accordance with this Policy, subject to applicable law. Where consent is required by applicable law, we will seek the appropriate consent before collecting, using or disclosing personal data for the relevant purpose; you may withdraw consent where permitted by law, although doing so may affect our ability to provide certain services or features.</p>
              <p>Where TMS displays a map (for example, project or outlet locations), map tiles are loaded directly from OpenStreetMap, which may receive your IP address as part of that request. Aside from this, TMS does not embed third‑party analytics, advertising, or tracking services. Where TMS links to a third‑party website or service, that service has its own privacy policy and practices, and we are not responsible for its privacy, security or data‑handling practices. You should review the privacy policy of any third‑party service before providing personal data to it.</p>

              <SectionHeader id="section7" level={2}>7. Age Requirements and Children&apos;s Privacy</SectionHeader>
              <p>TMS is a business‑to‑business platform intended only for individuals who are 18 years of age or older, accessing TMS in a professional capacity on behalf of Beauty One International Pte Ltd. or a contracting organisation. Accounts are provisioned by our Admin users, not through open self‑registration, and TMS is not intended for use by children or persons below 18 years of age. We do not knowingly permit persons below 18 to hold or use an account.</p>
              <p>If we become aware that an account has been created or maintained by a person below 18 years of age, we will suspend or terminate the account and take reasonable steps to delete the associated personal data, subject to any legal or operational requirement to retain such information.</p>

              <SectionHeader id="section8" level={2}>8. Changes to this Privacy Policy</SectionHeader>
              <p>We may update this Policy from time to time to reflect changes to TMS, our practices, applicable laws or regulatory requirements. Where material changes are made, we may notify Users through TMS, email or other reasonable means. The latest version of this Policy will be published on TMS with the updated &quot;Last Updated&quot; date shown above. Your continued use of TMS after an updated Policy takes effect constitutes acknowledgement of the updated Policy; if you do not agree with the changes, you should stop using TMS and may contact us regarding your account and personal data.</p>

              <SectionHeader id="section9" level={2}>9. Contact and Enquiries</SectionHeader>
              <p>If you have questions, concerns, or requests relating to your personal data, or feedback regarding this Policy, please contact our Data Protection Officer:</p>
              <p>
                <strong>Data Protection Officer</strong><br />
                Beauty One International Pte Ltd.<br />
                2 Venture Drive, #21‑01, VISION EXCHANGE, Singapore 608526<br />
                <strong>Email:</strong> dpo@beautyone.com.sg<br />
                <strong>For data subject requests:</strong> tender_enquiries@beautyone.com.sg
              </p>
              <p>When making an access, correction, deletion or other personal data request, we may need to verify your identity before processing the request. Requests are acknowledged within seven (7) business days and substantively responded to within thirty (30) days (or sooner if required by law), free of charge unless manifestly unfounded or excessive. You may also lodge a complaint with the Personal Data Protection Commission (PDPC).</p>

              <SectionHeader id="appendix" level={2}>Appendix A: Data Retention Periods</SectionHeader>
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
              <p>Data may be retained longer if required to establish, exercise, or defend a legal claim, or where mandated by applicable law.</p>

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
