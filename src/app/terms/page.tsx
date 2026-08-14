// app/terms/page.tsx
"use client";

import Link from 'next/link';
import { DocumentHeader, TableOfContents, SectionHeader, LegalList } from '@/components/privacy';

export default function TermsPage() {
  const tocItems = [
    { id: 'section1', label: '1. Acceptance of Terms' },
    { id: 'section2', label: '2. User Accounts and Access' },
    { id: 'section3', label: '3. Acceptable Use' },
    { id: 'section4', label: '4. Intellectual Property' },
    { id: 'section5', label: '5. User Content' },
    { id: 'section6', label: '6. Privacy and Data Protection' },
    { id: 'section7', label: '7. Disclaimer of Warranties' },
    { id: 'section8', label: '8. Limitation of Liability' },
    { id: 'section9', label: '9. Indemnification' },
    { id: 'section10', label: '10. Third-Party Links' },
    { id: 'section11', label: '11. Termination' },
    { id: 'section12', label: '12. Governing Law' },
    { id: 'section13', label: '13. Modifications to Terms' },
    { id: 'section14', label: '14. Severability' },
    { id: 'section15', label: '15. Entire Agreement' },
    { id: 'section16', label: '16. Contact Information' },
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
            version="1.0"
            lastUpdated="19 June 2026"
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
                Welcome to Tender Management System (&quot;TMS&quot;), operated by Beauty One International Pte Ltd. (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). By accessing or using the TMS, you agree to be bound by these Terms of Service (the &quot;Terms&quot;) — a legally binding agreement between you and the Company. If you do not agree to these Terms, please do not use the TMS.
              </p>

              <SectionHeader id="section1" level={2}>1. Acceptance of Terms</SectionHeader>
              <p>By using TMS, you confirm that you have read, understood, and accepted these Terms, and that you agree to comply with all applicable laws and regulations. If you are acting on behalf of an organisation, you represent that you have the authority to bind that organisation to these Terms.</p>

              <SectionHeader id="section2" level={2}>2. User Accounts and Access</SectionHeader>
              <LegalList
                items={[
                  <span key="2-1"><strong>Account Registration:</strong> You must register for an account to access certain features. You agree to provide accurate, current, and complete information during registration.</span>,
                  <span key="2-2"><strong>Credentials:</strong> You are responsible for safeguarding your login credentials. You must not share your account with others.</span>,
                  <span key="2-3"><strong>Unauthorised Access:</strong> You must notify us immediately of any unauthorised access or breach of security.</span>,
                  <span key="2-4"><strong>Account Termination:</strong> We reserve the right to suspend or terminate accounts that violate these Terms or applicable laws.</span>,
                ]}
              />

              <SectionHeader id="section3" level={2}>3. Acceptable Use</SectionHeader>
              <p>You agree to use the TMS only for lawful purposes and in a manner that does not infringe the rights of others or restrict or inhibit their use of the TMS. You must not:</p>
              <LegalList
                items={[
                  <span key="3-1">Use the TMS to submit false, misleading, or fraudulent information.</span>,
                  <span key="3-2">Attempt to gain unauthorised access to any system or data.</span>,
                  <span key="3-3">Distribute malware, viruses, or other harmful code.</span>,
                  <span key="3-4">Engage in any activity that could damage, disable, overburden, or impair the TMS.</span>,
                  <span key="3-5">Use the TMS to harass, abuse, or harm others.</span>,
                ]}
              />

              <SectionHeader id="section4" level={2}>4. Intellectual Property</SectionHeader>
              <p>All content, features, and functionality of the TMS, including but not limited to text, graphics, logos, icons, images, audio clips, video clips, data compilations, and software, are the exclusive property of Beauty One International Pte Ltd. or its licensors and are protected by copyright, trademark, patent, and other intellectual property laws.</p>
              <p>You are granted a limited, non‑transferable, revocable licence to access and use the TMS for your internal business purposes. You may not reproduce, modify, distribute, or create derivative works based on the TMS or its content without our prior written consent.</p>

              <SectionHeader id="section5" level={2}>5. User Content</SectionHeader>
              <p>You retain ownership of any content you submit to the TMS (e.g., tender proposals, BQ data, project details). By submitting content, you grant us a worldwide, royalty‑free, non‑exclusive licence to use, store, and process that content as necessary to provide the TMS&rsquo;s services and to comply with legal obligations.</p>
              <p>You represent and warrant that you have all rights necessary to submit such content, and that it does not infringe any third‑party rights.</p>

              <SectionHeader id="section6" level={2}>6. Privacy and Data Protection</SectionHeader>
              <p>Our <a href="/privacy" className="text-[#15406a] hover:underline">Privacy Policy</a> explains how we collect, use, and protect your data. By using the TMS, you consent to the data practices described in that policy.</p>

              <SectionHeader id="section7" level={2}>7. Disclaimer of Warranties</SectionHeader>
              <p className="text-sm">THE PLATFORM IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. WE MAKE NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, REGARDING THE OPERATION OR AVAILABILITY OF THE PLATFORM, OR THE INFORMATION, CONTENT, MATERIALS, OR PRODUCTS INCLUDED ON THE PLATFORM. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON‑INFRINGEMENT.</p>

              <SectionHeader id="section8" level={2}>8. Limitation of Liability</SectionHeader>
              <p className="text-sm">TO THE MAXIMUM EXTENT PERMITTED BY LAW, BEAUTY ONE INTERNATIONAL PTE LTD. AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE PLATFORM, WHETHER BASED ON CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
              <p>In no event shall our total liability to you for all claims arising out of or relating to these Terms or your use of the TMS exceed the amount you have paid to us, if any, in the twelve (12) months preceding the event giving rise to the liability.</p>

              <SectionHeader id="section9" level={2}>9. Indemnification</SectionHeader>
              <p>You agree to indemnify, defend, and hold harmless Beauty One International Pte Ltd., its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable legal fees) arising out of or in connection with your use of the TMS, your violation of these Terms, or your infringement of any third‑party rights.</p>

              <SectionHeader id="section10" level={2}>10. Third‑Party Links</SectionHeader>
              <p>The TMS may contain links to third‑party websites or services. We do not control or endorse those sites and are not responsible for their content, privacy policies, or practices. Your use of such sites is at your own risk.</p>

              <SectionHeader id="section11" level={2}>11. Termination</SectionHeader>
              <p>We may suspend or terminate your access to the TMS at any time, with or without cause, with or without notice. Upon termination, your right to use the TMS will cease immediately, and we may delete or archive your data in accordance with our Privacy Policy and applicable law.</p>

              <SectionHeader id="section12" level={2}>12. Governing Law and Dispute Resolution</SectionHeader>
              <p>These Terms shall be governed by and construed in accordance with the laws of the Republic of Singapore, without regard to its conflict of laws principles. Any dispute arising out of or relating to these Terms or the TMS shall be resolved exclusively in the courts of Singapore. Both parties consent to the personal jurisdiction of those courts.</p>

              <SectionHeader id="section13" level={2}>13. Modifications to Terms</SectionHeader>
              <p>We reserve the right to update or modify these Terms at any time without prior notice. The revised Terms will be posted on this page with an updated effective date. Your continued use of the TMS after any such changes constitutes your acceptance of the new Terms.</p>

              <SectionHeader id="section14" level={2}>14. Severability</SectionHeader>
              <p>If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.</p>

              <SectionHeader id="section15" level={2}>15. Entire Agreement</SectionHeader>
              <p>These Terms constitute the entire agreement between you and Beauty One International Pte Ltd. regarding your use of the TMS and supersede all prior agreements, understandings, or representations, whether written or oral.</p>

              <SectionHeader id="section16" level={2}>16. Contact Information</SectionHeader>
              <p>
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
