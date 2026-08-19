// app/terms/page.tsx
"use client";

import Link from 'next/link';
import { DocumentHeader, TableOfContents, SectionHeader, Clause } from '@/components/privacy';
import { CURRENT_TERMS_VERSION } from '@/lib/legal';

export default function TermsPage() {
  const tocItems = [
    { id: 'section1', label: '1. About TMS' },
    { id: 'section2', label: '2. Acceptance of Terms' },
    { id: 'section3', label: '3. Accounts and Access' },
    { id: 'section4', label: '4. User Responsibilities' },
    { id: 'section5', label: '5. User Content' },
    { id: 'section6', label: '6. Proprietary Rights' },
    { id: 'section7', label: '7. Restrictions on Use' },
    { id: 'section8', label: '8. Privacy and Personal Data' },
    { id: 'section9', label: '9. Messaging and Communications' },
    { id: 'section10', label: '10. Third-Party Websites and Links' },
    { id: 'section11', label: '11. Electronic Records and Notifications' },
    { id: 'section12', label: '12. Availability, Security and Suspension' },
    { id: 'section13', label: '13. Disclaimer of Liability' },
    { id: 'section14', label: '14. Limitation of Liability and Indemnity' },
    { id: 'section15', label: '15. Amendments to These Terms' },
    { id: 'section16', label: '16. Governing Law and General' },
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

        <div className="mt-10">
          <DocumentHeader
            title="Terms of Use"
            effectiveDate="19 June 2026"
            version={CURRENT_TERMS_VERSION}
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
          <div className="min-w-0 flex-1">
            <div className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-slate-700 prose-p:leading-relaxed prose-p:text-base prose-a:text-[#15406a] print:prose-p:text-black print:prose-headings:text-black print:prose-a:text-black print:prose-strong:text-black">

              <p className="lead text-slate-600 text-lg">
                These Terms of Use (&quot;Terms&quot;) govern your access to and use of the Tender Management System (&quot;TMS&quot;, &quot;Platform&quot;, &quot;we&quot;, &quot;us&quot; or &quot;our&quot;), operated by Beauty One International Pte Ltd. (the &quot;Company&quot;), including the TMS website, application, features and related services.
              </p>
              <p>
                By accessing or using TMS, you acknowledge that you have read, understood and agree to be bound by these Terms. If you do not agree to these Terms, you must not access or use TMS.
              </p>

              <SectionHeader id="section1" level={2}>1. About TMS</SectionHeader>
              <Clause number="1.1">
                TMS is a digital platform that facilitates the administration and management of tenders and related activities. TMS provides technology and administrative tools only and does not guarantee any tender, commercial or contractual outcome or act as a party to agreements between Users.
              </Clause>

              <SectionHeader id="section2" level={2}>2. Acceptance of Terms</SectionHeader>
              <Clause number="2.1">
                By accessing or using TMS, you agree to these Terms and any applicable policies or requirements made available through the Platform. If you use TMS on behalf of an organisation, you confirm that you have authority to accept these Terms on its behalf.
              </Clause>
              <Clause number="2.2">
                If you do not agree to these Terms, you must not access or use TMS.
              </Clause>

              <SectionHeader id="section3" level={2}>3. Accounts and Access</SectionHeader>
              <Clause number="3.1">
                TMS is intended for individuals aged 18 years and above. You must be at least 18 years old to hold or use a TMS account. By using TMS, you represent and warrant that you are at least 18 years old.
              </Clause>
              <Clause number="3.2">
                TMS is not directed to or intended for children or persons below 18 years of age. We do not knowingly permit persons below 18 to hold or use an account on TMS.
              </Clause>
              <Clause number="3.3">
                TMS accounts are not self‑registered. Accounts are created for you by an Admin user, who issues an initial welcome email and temporary credentials. You must keep the information associated with your account accurate, current and complete, and update it where it changes. You are responsible for maintaining the confidentiality of your credentials, protecting your account and all activity conducted through it, except to the extent otherwise required by applicable law.
              </Clause>
              <Clause number="3.4">
                You must notify us promptly of suspected unauthorised access. You must not use another person&rsquo;s account without appropriate authorisation or create multiple accounts to circumvent Platform restrictions or access controls. We may suspend, deactivate or restrict accounts where reasonably necessary for security, compliance, investigation, maintenance or protection of TMS or its Users.
              </Clause>

              <SectionHeader id="section4" level={2}>4. User Responsibilities</SectionHeader>
              <Clause number="4.1">
                You are responsible for your use of TMS and for ensuring that information you provide through the Platform is accurate, lawful and submitted with the necessary authority.
              </Clause>
              <Clause number="4.2">
                You are responsible for reviewing information before submission, maintaining your own copies of important documents and information, and making your own commercial, contractual and business decisions. TMS is a facilitation tool and does not replace your own review or judgment.
              </Clause>

              <SectionHeader id="section5" level={2}>5. User Content</SectionHeader>
              <Clause number="5.1">
                User Content includes documents, files, messages, comments, pricing, Bills of Quantities, submissions and other materials you upload, submit or transmit through TMS.
              </Clause>
              <Clause number="5.2">
                You retain ownership of User Content that you lawfully own and are responsible for having the necessary rights and permissions to provide it.
              </Clause>
              <Clause number="5.3">
                You grant us a non‑exclusive, worldwide, royalty‑free licence to host, store, process, transmit, reproduce and otherwise use User Content only as reasonably necessary to operate, maintain, secure and provide TMS, administer activities conducted through the Platform, maintain backups, investigate misuse, comply with law and enforce these Terms.
              </Clause>
              <Clause number="5.4">
                You must not submit unlawful, fraudulent, malicious, defamatory, misleading or infringing content. We may remove, restrict or retain User Content where reasonably necessary for security, legal compliance, investigation, system operation or enforcement of these Terms.
              </Clause>

              <SectionHeader id="section6" level={2}>6. Proprietary Rights</SectionHeader>
              <Clause number="6.1">
                TMS, including its software, source code, interfaces, designs, databases, functionality, trademarks, logos, documentation and other Platform materials, is owned by or licensed to us and protected by applicable intellectual property laws.
              </Clause>
              <Clause number="6.2">
                Except as expressly permitted by these Terms or applicable law, you must not copy, modify, reproduce, reverse engineer, decompile, distribute, commercially exploit or use TMS to develop a competing service, or remove proprietary notices. Nothing in these Terms transfers ownership of TMS or our intellectual property to you.
              </Clause>

              <SectionHeader id="section7" level={2}>7. Restrictions on Use</SectionHeader>
              <Clause number="7.1">
                You must not use TMS for unlawful activity, impersonation, fraud, unauthorised access, interference with the Platform, introduction of malicious code, circumvention of security controls, unauthorised scraping or extraction, manipulation of Platform records, infringement of another person&rsquo;s rights, or any activity that could reasonably cause harm to TMS, its Users or our business.
              </Clause>
              <Clause number="7.2">
                We may take reasonable action where we believe TMS is being misused or these Terms have been breached.
              </Clause>

              <SectionHeader id="section8" level={2}>8. Privacy and Personal Data</SectionHeader>
              <Clause number="8.1">
                Personal data collected or processed through TMS will be handled in accordance with our Privacy Policy and applicable data protection laws. TMS may process personal data for account administration, authentication, Platform operation, business administration, communications, security, auditing, service improvement and legal compliance.
              </Clause>
              <Clause number="8.2">
                Users are responsible for ensuring that personal information they provide through TMS may lawfully be provided for the relevant purpose. Our Privacy Policy forms part of these Terms.
              </Clause>
              <Clause number="8.3">
                Privacy Policy: <a href="/privacy" className="text-[#15406a] hover:underline">https://tms.beautyone.com.sg/privacy</a>
              </Clause>

              <SectionHeader id="section9" level={2}>9. Messaging and Communications</SectionHeader>
              <Clause number="9.1">
                TMS may provide messaging and communication features for authorised Users. Users are responsible for the content and accuracy of their communications and must not use these features for unlawful, abusive, fraudulent, misleading or unauthorised purposes.
              </Clause>
              <Clause number="9.2">
                TMS may provide email alerts and notifications relating to account activity, Platform activity, messages, updates and other relevant events. Where available, Users may enable or disable optional email notifications through their account settings.
              </Clause>
              <Clause number="9.3">
                Disabling optional email notifications does not prevent TMS from sending essential service, security, account, legal or other communications that we consider necessary. We do not guarantee that any email or notification will be delivered, received, read or available at all times. Users remain responsible for monitoring their TMS account.
              </Clause>

              <SectionHeader id="section10" level={2}>10. Third‑Party Websites and Links</SectionHeader>
              <Clause number="10.1">
                TMS may contain links to, references to or integrations with third‑party websites, applications or services (for example, map views of tender or project locations). Unless expressly stated otherwise, such services are outside our control and we are not responsible for their availability, content, security, privacy practices, accuracy or functionality.
              </Clause>
              <Clause number="10.2">
                Your use of third‑party websites or services is subject to their own terms and policies. You must not create a link, frame or other connection to TMS in a manner that falsely suggests an association with us, is misleading, infringes our rights or is unlawful.
              </Clause>

              <SectionHeader id="section11" level={2}>11. Electronic Records and Notifications</SectionHeader>
              <Clause number="11.1">
                TMS may maintain electronic records of Platform activity, including User activity, submissions, changes, approvals, account activity, notifications, dates, times and other significant events.
              </Clause>
              <Clause number="11.2">
                Such records may be used for administration, security, auditing, investigation, dispute management and compliance. To the extent permitted by applicable law, TMS records may be relied upon as evidence of activity conducted through the Platform.
              </Clause>
              <Clause number="11.3">
                Failure to receive, read or respond to an email or notification does not necessarily invalidate an action, status, deadline or other information recorded in TMS.
              </Clause>

              <SectionHeader id="section12" level={2}>12. Availability, Security and Suspension</SectionHeader>
              <Clause number="12.1">
                We will use reasonable efforts to operate and maintain TMS, but do not guarantee that it will always be available, uninterrupted, error‑free, secure, compatible with every device or browser, or free from defects or harmful components.
              </Clause>
              <Clause number="12.2">
                TMS may be unavailable due to maintenance, upgrades, technical or telecommunications failures, third‑party services, cyber incidents, security measures, force majeure events or other circumstances beyond our reasonable control. We may modify, suspend or discontinue features where reasonably necessary.
              </Clause>
              <Clause number="12.3">
                We take reasonable measures to protect TMS and information processed through it, but no internet‑connected system can be guaranteed completely secure. We may suspend, restrict or terminate access where reasonably necessary for security, compliance, investigation, protection of TMS or its Users, or where these Terms have been breached. We may act immediately where necessary to protect our legal or operational interests.
              </Clause>

              <SectionHeader id="section13" level={2}>13. Disclaimer of Liability</SectionHeader>
              <Clause number="13.1">
                To the fullest extent permitted by applicable law, TMS is provided on an &quot;as is&quot; and &quot;as available&quot; basis.
              </Clause>
              <Clause number="13.2">
                We do not guarantee the accuracy, completeness or reliability of information provided by Users; uninterrupted or error‑free operation; continuous availability; delivery of notifications; suitability for a particular purpose; or any commercial, contractual, procurement or business outcome resulting from use of TMS.
              </Clause>
              <Clause number="13.3">
                We are not responsible for decisions, actions, omissions or disputes between Users or other parties using TMS.
              </Clause>

              <SectionHeader id="section14" level={2}>14. Limitation of Liability and Indemnity</SectionHeader>
              <Clause number="14.1">
                To the fullest extent permitted by applicable law, we will not be responsible for indirect, incidental, special or consequential loss, loss of business opportunity, anticipated profits, revenue or savings, or loss arising from inaccurate User information, User decisions, missed deadlines, notification failures, User devices or networks, third‑party services, Platform interruptions, actions of other Users or circumstances beyond our reasonable control.
              </Clause>
              <Clause number="14.2">
                To the fullest extent permitted by law, our total liability arising from or relating to your use of TMS will be limited to the amount actually paid by you to us for use of TMS during the twelve (12) months immediately preceding the event giving rise to the claim.
              </Clause>
              <Clause number="14.3">
                To the fullest extent permitted by law, you agree to indemnify and hold harmless us, our officers, employees, contractors and service providers against claims, losses, liabilities, costs and expenses arising from your breach of these Terms, unlawful use of TMS, User Content, infringement of another person&rsquo;s rights, misuse of confidential or commercial information, or acts or omissions in connection with your use of TMS.
              </Clause>
              <Clause number="14.4">
                Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited.
              </Clause>

              <SectionHeader id="section15" level={2}>15. Amendments to These Terms</SectionHeader>
              <Clause number="15.1">
                We may amend these Terms from time to time. Where we make material changes, we may notify Users through TMS, email or other reasonable means.
              </Clause>
              <Clause number="15.2">
                Updated Terms will be published with a revised &quot;Last Updated&quot; date. Continued use of TMS after the updated Terms take effect constitutes acceptance of the updated Terms. If you do not agree, you must stop using TMS.
              </Clause>

              <SectionHeader id="section16" level={2}>16. Governing Law and General</SectionHeader>
              <Clause number="16.1">
                These Terms are governed by the laws of the Republic of Singapore. Subject to mandatory legal requirements, the courts of Singapore shall have exclusive jurisdiction over disputes arising out of or in connection with these Terms or your use of TMS.
              </Clause>
              <Clause number="16.2">
                If any provision is invalid or unenforceable, the remaining provisions continue to apply. Failure to enforce a provision is not a waiver of our rights.
              </Clause>
              <Clause number="16.3">
                These Terms, together with policies or agreements expressly incorporated into them, constitute the terms governing your use of TMS. No User may transfer rights or obligations under these Terms without our prior written consent, except where permitted by law.
              </Clause>
              <Clause number="16.4">
                Questions regarding these Terms or TMS may be directed to:
                <br /><br />
                <strong>Beauty One International Pte Ltd.</strong><br />
                2 Venture Drive, #21‑01, VISION EXCHANGE, Singapore 608526<br />
                Email: tender_enquiries@beautyone.com.sg
              </Clause>

              <p className="mt-14 text-xs text-slate-400 border-t border-slate-200 pt-6">
                Copyright © 2026 Beauty One International Pte Ltd. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
