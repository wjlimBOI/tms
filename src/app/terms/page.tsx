// app/terms/page.tsx
"use client";

import Link from 'next/link';
import { DocumentHeader, TableOfContents, SectionHeader, LegalList } from '@/components/privacy';

export default function TermsPage() {
  const tocItems = [
    { id: 'section1', label: '1. About TMS and Acceptance of Terms' },
    { id: 'section2', label: '2. User Accounts and Access' },
    { id: 'section3', label: '3. User Responsibilities' },
    { id: 'section4', label: '4. Acceptable Use' },
    { id: 'section5', label: '5. User Content' },
    { id: 'section6', label: '6. Intellectual Property' },
    { id: 'section7', label: '7. Privacy and Data Protection' },
    { id: 'section8', label: '8. Messaging and Notifications' },
    { id: 'section9', label: '9. Third-Party Links' },
    { id: 'section10', label: '10. Electronic Records' },
    { id: 'section11', label: '11. Availability, Security and Suspension' },
    { id: 'section12', label: '12. Disclaimer of Warranties' },
    { id: 'section13', label: '13. Limitation of Liability' },
    { id: 'section14', label: '14. Indemnification' },
    { id: 'section15', label: '15. Termination' },
    { id: 'section16', label: '16. Governing Law' },
    { id: 'section17', label: '17. Modifications to These Terms' },
    { id: 'section18', label: '18. General Provisions' },
    { id: 'section19', label: '19. Contact Information' },
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
            title="Terms of Service"
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
                These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Tender Management System (&quot;TMS&quot;, &quot;Platform&quot;, &quot;we&quot;, &quot;our&quot; or &quot;us&quot;), operated by Beauty One International Pte Ltd. (the &quot;Company&quot;), including the TMS website, application, features and related services. By accessing, registering for or using TMS, you acknowledge that you have read, understood and agree to be bound by these Terms. If you do not agree to these Terms, you must not access or use TMS.
              </p>

              <SectionHeader id="section1" level={2}>1. About TMS and Acceptance of Terms</SectionHeader>
              <p>TMS is a digital platform that facilitates the administration and management of tenders and related procurement activities, including tender publication, expressions of interest, Bill of Quantities (BQ) submission and comparison, award decisions, and related communications between Beauty One International Pte Ltd. and its contractors. TMS provides technology and administrative tools only — it does not guarantee any tender, commercial or contractual outcome, and is not itself a party to any agreement formed between the Company and a contractor.</p>
              <p>By accessing or using TMS, you confirm that you have read, understood, and accepted these Terms, and that you agree to comply with all applicable laws and regulations. If you are accessing TMS on behalf of an organisation (for example, as a contractor&rsquo;s authorised representative), you represent that you have the authority to bind that organisation to these Terms. If you do not agree to these Terms, you must not access or use TMS.</p>

              <SectionHeader id="section2" level={2}>2. User Accounts and Access</SectionHeader>
              <p>TMS accounts are not self‑registered. Internal accounts (Admin, Finance GM, FM Regional Director and other internal roles) and contractor accounts are created by our Admin users, who issue an initial welcome email and temporary credentials to the user&rsquo;s registered email address.</p>
              <LegalList
                items={[
                  <span key="2-1"><strong>Accurate Information:</strong> You must ensure the information associated with your account (company details, contact information, role) is accurate and kept up to date, and promptly change any temporary password issued to you on first login.</span>,
                  <span key="2-2"><strong>Credentials:</strong> You are responsible for safeguarding your login credentials and for all activity conducted through your account. You must not share your account or allow another person to use it.</span>,
                  <span key="2-3"><strong>Role‑Based Access:</strong> Your access to tenders, BQ data, approvals and other features is determined by the role assigned to your account. You must not attempt to access features or data outside your assigned role.</span>,
                  <span key="2-4"><strong>Unauthorised Access:</strong> You must notify us promptly of any suspected unauthorised access to your account or breach of security.</span>,
                  <span key="2-5"><strong>Account Suspension:</strong> We may suspend, deactivate or restrict an account where reasonably necessary for security, compliance, investigation, or where these Terms have been breached.</span>,
                ]}
              />

              <SectionHeader id="section3" level={2}>3. User Responsibilities</SectionHeader>
              <p>You are responsible for your use of TMS and for ensuring that information you submit through the Platform — including tender submissions, BQ pricing, extension‑of‑time requests and supporting documents — is accurate, lawful and submitted with the necessary authority. You are responsible for reviewing information before submission, retaining your own copies of important documents, and making your own commercial and business decisions; TMS is a facilitation tool and does not replace your own review or judgment.</p>

              <SectionHeader id="section4" level={2}>4. Acceptable Use</SectionHeader>
              <p>You agree to use TMS only for lawful purposes and in a manner that does not infringe the rights of others or restrict or inhibit their use of TMS. You must not:</p>
              <LegalList
                items={[
                  <span key="4-1">Use TMS to submit false, misleading, or fraudulent information, including in tender submissions or BQ pricing.</span>,
                  <span key="4-2">Attempt to gain unauthorised access to any account, system, tender or data you are not entitled to view.</span>,
                  <span key="4-3">Distribute malware, viruses, or other harmful code, including through uploaded files or attachments.</span>,
                  <span key="4-4">Engage in any activity that could damage, disable, overburden, or impair TMS, or attempt to circumvent file, size or format restrictions on uploads.</span>,
                  <span key="4-5">Use the messaging features of TMS to harass, abuse, or send unlawful or misleading communications to other users.</span>,
                ]}
              />

              <SectionHeader id="section5" level={2}>5. User Content</SectionHeader>
              <p>User Content includes tender submissions, BQ line items and pricing, extension‑of‑time requests, messages, comments, and documents you upload, submit or transmit through TMS. You retain ownership of User Content that you lawfully own and are responsible for having the necessary rights and permissions to provide it.</p>
              <p>You grant us a non‑exclusive, worldwide, royalty‑free licence to host, store, process, transmit and reproduce User Content only as reasonably necessary to operate TMS, administer the tender and BQ workflows conducted through the Platform, maintain backups, investigate misuse, comply with law and enforce these Terms. You represent and warrant that you have all rights necessary to submit such content and that it does not infringe any third‑party rights.</p>

              <SectionHeader id="section6" level={2}>6. Intellectual Property</SectionHeader>
              <p>TMS, including its software, source code, interfaces, designs, databases, functionality, trademarks, logos, documentation and other Platform materials, is owned by or licensed to Beauty One International Pte Ltd. and protected by applicable intellectual property laws.</p>
              <p>You are granted a limited, non‑transferable, revocable licence to access and use TMS for your internal business purposes in connection with tenders you participate in. Except as expressly permitted by these Terms or applicable law, you must not copy, modify, reproduce, reverse engineer, decompile, distribute, commercially exploit TMS, use it to develop a competing service, or remove proprietary notices.</p>

              <SectionHeader id="section7" level={2}>7. Privacy and Data Protection</SectionHeader>
              <p>Personal and corporate data collected or processed through TMS is handled in accordance with our <a href="/privacy" className="text-[#15406a] hover:underline">Privacy Policy</a> and the Singapore Personal Data Protection Act (PDPA), which forms part of these Terms. You are responsible for ensuring that any personal information you provide through TMS about yourself or others (for example, colleagues named in a submission) may lawfully be provided for that purpose. By using TMS, you consent to the data practices described in the Privacy Policy.</p>

              <SectionHeader id="section8" level={2}>8. Messaging and Notifications</SectionHeader>
              <p>TMS provides in‑tender messaging between Admin, internal reviewers and contractors, and an in‑app and email notification system covering tender activity, submission deadlines, approvals and account activity. Users are responsible for the content and accuracy of their own messages and must not use messaging features for unlawful, abusive, fraudulent or misleading purposes.</p>
              <p>Registered users may enable or disable optional notification categories through their notification preferences settings. Disabling optional notifications does not prevent TMS from sending essential account, security or service communications (such as welcome emails or password resets) that we consider necessary. We do not guarantee that any email or in‑app notification will be delivered, received or read; you remain responsible for monitoring your TMS account directly, including submission deadlines and closing dates.</p>

              <SectionHeader id="section9" level={2}>9. Third‑Party Links</SectionHeader>
              <p>TMS may display links to or embed third‑party services (for example, map views of tender or project locations). Unless expressly stated otherwise, such services are outside our control and we are not responsible for their availability, content, security or privacy practices. Your use of any linked third‑party service is subject to that service&rsquo;s own terms and is at your own risk.</p>

              <SectionHeader id="section10" level={2}>10. Electronic Records</SectionHeader>
              <p>TMS maintains electronic and audit‑trail records of Platform activity, including tender stage changes, submissions, approvals, extension requests, messages, notifications, and login activity, together with the dates and times these occurred. Such records may be used for administration, security, auditing, investigation, dispute management and compliance, and, to the extent permitted by applicable law, may be relied upon as evidence of activity conducted through TMS.</p>
              <p>Failure to receive, read or respond to an email or notification does not itself invalidate a tender stage, deadline, approval, or other status recorded in TMS.</p>

              <SectionHeader id="section11" level={2}>11. Availability, Security and Suspension</SectionHeader>
              <p>We use reasonable efforts to operate and maintain TMS, but do not guarantee that it will always be available, uninterrupted, error‑free, or free from defects. TMS may be unavailable due to maintenance, upgrades, technical failures, cyber incidents, security measures, or other circumstances beyond our reasonable control.</p>
              <p>We take reasonable measures to protect TMS and the information processed through it, but no internet‑connected system can be guaranteed completely secure. We may suspend, restrict or terminate access where reasonably necessary for security, compliance, investigation, protection of TMS or its users, or where these Terms have been breached, and may act immediately where necessary to protect our legal or operational interests.</p>

              <SectionHeader id="section12" level={2}>12. Disclaimer of Warranties</SectionHeader>
              <p className="text-sm">TMS IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. WE MAKE NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, REGARDING THE OPERATION OR AVAILABILITY OF THE PLATFORM, OR THE ACCURACY, COMPLETENESS OR RELIABILITY OF ANY INFORMATION, TENDER, OR SUBMISSION PROCESSED THROUGH IT. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON‑INFRINGEMENT. WE ARE NOT RESPONSIBLE FOR ANY COMMERCIAL, CONTRACTUAL OR PROCUREMENT OUTCOME, OR FOR DECISIONS, ACTIONS OR DISPUTES BETWEEN USERS ARISING FROM USE OF TMS.</p>

              <SectionHeader id="section13" level={2}>13. Limitation of Liability</SectionHeader>
              <p className="text-sm">TO THE MAXIMUM EXTENT PERMITTED BY LAW, BEAUTY ONE INTERNATIONAL PTE LTD. AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, BUSINESS OPPORTUNITY, DATA, USE, OR GOODWILL, OR LOSS ARISING FROM MISSED SUBMISSION DEADLINES, NOTIFICATION FAILURES, OR INACCURATE INFORMATION SUBMITTED BY ANOTHER USER, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF TMS, WHETHER BASED ON CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
              <p>In no event shall our total liability to you for all claims arising out of or relating to these Terms or your use of TMS exceed the amount you have paid to us, if any, in the twelve (12) months preceding the event giving rise to the liability. Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited.</p>

              <SectionHeader id="section14" level={2}>14. Indemnification</SectionHeader>
              <p>You agree to indemnify, defend, and hold harmless Beauty One International Pte Ltd., its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable legal fees) arising out of or in connection with your use of TMS, your breach of these Terms, User Content you submit, or your infringement of any third‑party rights.</p>

              <SectionHeader id="section15" level={2}>15. Termination</SectionHeader>
              <p>We may suspend or terminate your access to TMS at any time, with or without cause, with or without notice, including where an account is no longer required (for example, at the end of an engagement). Upon termination, your right to use TMS will cease immediately, and we may retain, delete or archive your data in accordance with our Privacy Policy and applicable law.</p>

              <SectionHeader id="section16" level={2}>16. Governing Law and Dispute Resolution</SectionHeader>
              <p>These Terms shall be governed by and construed in accordance with the laws of the Republic of Singapore, without regard to its conflict of laws principles. Any dispute arising out of or relating to these Terms or your use of TMS shall be resolved exclusively in the courts of Singapore. Both parties consent to the personal jurisdiction of those courts.</p>

              <SectionHeader id="section17" level={2}>17. Modifications to These Terms</SectionHeader>
              <p>We may amend these Terms from time to time. Where we make material changes, we may notify users through TMS, email or other reasonable means. Updated Terms will be published on this page with a revised &quot;Last Updated&quot; date. Continued use of TMS after the updated Terms take effect constitutes acceptance of the updated Terms; if you do not agree, you must stop using TMS.</p>

              <SectionHeader id="section18" level={2}>18. General Provisions</SectionHeader>
              <LegalList
                items={[
                  <span key="18-1"><strong>Severability:</strong> If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.</span>,
                  <span key="18-2"><strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and Beauty One International Pte Ltd. regarding your use of TMS and supersede all prior agreements, understandings, or representations, whether written or oral.</span>,
                  <span key="18-3"><strong>No Waiver:</strong> Our failure to enforce a provision of these Terms is not a waiver of our right to do so later.</span>,
                  <span key="18-4"><strong>Assignment:</strong> You may not transfer your rights or obligations under these Terms without our prior written consent, except where permitted by law.</span>,
                ]}
              />

              <SectionHeader id="section19" level={2}>19. Contact Information</SectionHeader>
              <p>
                Questions regarding these Terms or TMS may be directed to:<br /><br />
                <strong>Beauty One International Pte Ltd.</strong><br />
                2 Venture Drive, #21-01, VISION EXCHANGE, Singapore 608526<br />
                Email: legal@beautyone.com.sg
              </p>

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
