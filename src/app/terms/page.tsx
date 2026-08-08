// app/terms/page.tsx
"use client";

import { DocumentHeader, SectionHeader, LegalList, CalloutBox } from '@/components/privacy';

export default function TermsPage() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 print:py-6 print:px-4 print:bg-white print:text-black">
      <div className="max-w-5xl mx-auto relative">
        {/* Print Button */}
        <div className="absolute top-0 right-0 z-10 print:hidden">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>

        <DocumentHeader
          title="Terms of Service"
          effectiveDate="19 June 2026"
          version="1.0"
          lastUpdated="19 June 2026"
        />

        <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-slate-700 prose-p:leading-relaxed prose-p:text-base md:prose-p:text-lg prose-a:text-cyan-600 prose-ul:space-y-2 prose-li:marker:text-slate-500 print:prose-p:text-black print:prose-headings:text-black print:prose-a:text-black print:prose-strong:text-black">

          <p>Welcome to the TMS Project &amp; Cost Management System (the &quot;Platform&quot;), operated by Beauty One International Pte Ltd. (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). By accessing or using the Platform, you agree to be bound by these Terms of Service (the &quot;Terms&quot;). If you do not agree to these Terms, please do not use the Platform.</p>

          <CalloutBox type="info">
            <strong>Important:</strong> These Terms constitute a legally binding agreement between you and Beauty One International Pte Ltd. regarding your use of the Platform. Please read them carefully. They are designed to be fair and transparent, in line with the guidelines of the Consumers Association of Singapore (CASE).
          </CalloutBox>

          <hr className="my-12 border-slate-200" />

          <SectionHeader level={2} summary="By using the Platform, you accept these Terms and agree to comply with all applicable laws.">
            1. Acceptance of Terms
          </SectionHeader>
          <p>By using the Platform, you confirm that you have read, understood, and accepted these Terms, and that you agree to comply with all applicable laws and regulations. If you are acting on behalf of an organisation, you represent that you have the authority to bind that organisation to these Terms.</p>

          <SectionHeader level={2} summary="You are responsible for safeguarding your account credentials and must notify us of any unauthorised access.">
            2. User Accounts and Access
          </SectionHeader>
          <LegalList
            items={[
              <span key="2-1"><strong>Account Registration:</strong> You must register for an account to access certain features. You agree to provide accurate, current, and complete information during registration.</span>,
              <span key="2-2"><strong>Credentials:</strong> You are responsible for safeguarding your login credentials. You must not share your account with others.</span>,
              <span key="2-3"><strong>Unauthorised Access:</strong> You must notify us immediately of any unauthorised access or breach of security.</span>,
              <span key="2-4"><strong>Account Termination:</strong> We reserve the right to suspend or terminate accounts that violate these Terms or applicable laws.</span>,
            ]}
          />

          <SectionHeader level={2} summary="Use the Platform only for lawful purposes – no fraud, unauthorised access, or harmful activity.">
            3. Acceptable Use
          </SectionHeader>
          <p>You agree to use the Platform only for lawful purposes and in a manner that does not infringe the rights of others or restrict or inhibit their use of the Platform. You must not:</p>
          <LegalList
            items={[
              <span key="3-1">Use the Platform to submit false, misleading, or fraudulent information.</span>,
              <span key="3-2">Attempt to gain unauthorised access to any system or data.</span>,
              <span key="3-3">Distribute malware, viruses, or other harmful code.</span>,
              <span key="3-4">Engage in any activity that could damage, disable, overburden, or impair the Platform.</span>,
              <span key="3-5">Use the Platform to harass, abuse, or harm others.</span>,
            ]}
          />

          <SectionHeader level={2} summary="All content and software on the Platform is our intellectual property – you may only use it as permitted.">
            4. Intellectual Property
          </SectionHeader>
          <p>All content, features, and functionality of the Platform, including but not limited to text, graphics, logos, icons, images, audio clips, video clips, data compilations, and software, are the exclusive property of Beauty One International Pte Ltd. or its licensors and are protected by copyright, trademark, patent, and other intellectual property laws.</p>
          <p>You are granted a limited, non‑transferable, revocable licence to access and use the Platform for your internal business purposes. You may not reproduce, modify, distribute, or create derivative works based on the Platform or its content without our prior written consent.</p>

          <SectionHeader level={2} summary="You retain ownership of content you submit, but grant us a licence to process it for the Platform's services.">
            5. User Content
          </SectionHeader>
          <p>You retain ownership of any content you submit to the Platform (e.g., tender proposals, BQ data, project details). By submitting content, you grant us a worldwide, royalty‑free, non‑exclusive licence to use, store, and process that content as necessary to provide the Platform’s services and to comply with legal obligations.</p>
          <p>You represent and warrant that you have all rights necessary to submit such content, and that it does not infringe any third‑party rights.</p>

          <SectionHeader level={2} summary="Our Privacy Policy explains how we handle your data – by using the Platform, you consent to those practices.">
            6. Privacy and Data Protection
          </SectionHeader>
          <p>Our <a href="/privacy" className="text-cyan-600 hover:underline">Privacy Policy</a> explains how we collect, use, and protect your data. By using the Platform, you consent to the data practices described in that policy.</p>

          <SectionHeader level={2} summary="The Platform is provided 'as is' without warranties of any kind.">
            7. Disclaimer of Warranties
          </SectionHeader>
          <CalloutBox type="warning">
            THE PLATFORM IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. WE MAKE NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, REGARDING THE OPERATION OR AVAILABILITY OF THE PLATFORM, OR THE INFORMATION, CONTENT, MATERIALS, OR PRODUCTS INCLUDED ON THE PLATFORM. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON‑INFRINGEMENT.
          </CalloutBox>

          <SectionHeader level={2} summary="Our liability is limited to the maximum extent permitted by law – we are not liable for indirect or consequential damages.">
            8. Limitation of Liability
          </SectionHeader>
          <CalloutBox type="warning">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, BEAUTY ONE INTERNATIONAL PTE LTD. AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE PLATFORM, WHETHER BASED ON CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </CalloutBox>
          <p>IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF THE PLATFORM EXCEED THE AMOUNT YOU HAVE PAID TO US, IF ANY, IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE LIABILITY.</p>

          <SectionHeader level={2} summary="You agree to indemnify us against claims arising from your use of the Platform or violation of these Terms.">
            9. Indemnification
          </SectionHeader>
          <p>You agree to indemnify, defend, and hold harmless Beauty One International Pte Ltd., its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable legal fees) arising out of or in connection with your use of the Platform, your violation of these Terms, or your infringement of any third‑party rights.</p>

          <SectionHeader level={2} summary="We are not responsible for third‑party websites linked from the Platform.">
            10. Third‑Party Links
          </SectionHeader>
          <p>The Platform may contain links to third‑party websites or services. We do not control or endorse those sites and are not responsible for their content, privacy policies, or practices. Your use of such sites is at your own risk.</p>

          <SectionHeader level={2} summary="We may terminate your access at any time, with or without cause.">
            11. Termination
          </SectionHeader>
          <p>We may suspend or terminate your access to the Platform at any time, with or without cause, with or without notice. Upon termination, your right to use the Platform will cease immediately, and we may delete or archive your data in accordance with our Privacy Policy and applicable law.</p>

          <SectionHeader level={2} summary="These Terms are governed by Singapore law – disputes will be resolved exclusively in Singapore courts.">
            12. Governing Law and Dispute Resolution
          </SectionHeader>
          <p>These Terms shall be governed by and construed in accordance with the laws of the Republic of Singapore, without regard to its conflict of laws principles. Any dispute arising out of or relating to these Terms or the Platform shall be resolved exclusively in the courts of Singapore. Both parties consent to the personal jurisdiction of those courts.</p>

          <SectionHeader level={2} summary="We may update these Terms at any time; continued use constitutes acceptance.">
            13. Modifications to Terms
          </SectionHeader>
          <p>We reserve the right to update or modify these Terms at any time without prior notice. The revised Terms will be posted on this page with an updated effective date. Your continued use of the Platform after any such changes constitutes your acceptance of the new Terms.</p>

          <SectionHeader level={2} summary="If any part of these Terms is invalid, the rest remain enforceable.">
            14. Severability
          </SectionHeader>
          <p>If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.</p>

          <SectionHeader level={2} summary="These Terms are the complete agreement between us.">
            15. Entire Agreement
          </SectionHeader>
          <p>These Terms constitute the entire agreement between you and Beauty One International Pte Ltd. regarding your use of the Platform and supersede all prior agreements, understandings, or representations, whether written or oral.</p>

          <SectionHeader level={2} summary="Questions? Contact us at legal@beautyone.com.sg.">
            16. Contact Information
          </SectionHeader>
          <div className="bg-white p-6 rounded-lg border border-slate-200 my-6">
            <p><strong>Beauty One International Pte Ltd.</strong><br />
            2 Venture Drive, #21-01, VISION EXCHANGE,<br />
            Singapore 608526<br />
            Email: legal@beautyone.com.sg</p>
          </div>

          <div className="mt-14 p-5 bg-slate-100 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-600">
              <strong>Copyright © 2026 Beauty One International Pte Ltd.</strong> All rights reserved. Unauthorised reproduction or distribution, in whole or in part, is strictly prohibited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}