// lib/tenderClauses.ts

export const DEFAULT_CRITICAL: { title: string; description: string }[] = [
  {
    title: "1) TENDER DOCUMENTS",
    description:
      "All drawings and documents enclosed herewith form part of the whole interior design work. Contractors must strictly adhere to all terms, conditions, and guidelines.",
  },
  {
    title: "2) CRITICAL DATES",
    description: "", // dynamically filled
  },
  {
    title: "3) SUBMISSION OF TENDER",
    description: `The Tenderers are to bear all expenses incurred in the preparation of their quotation. The Tender, together with all drawings must be duly completed clearly marked:-
<tender title>

GENERAL INSTRUCTIONS

Closing date: Not later than 1200hrs on <date>

<u>annielim@beautyone.com.sg</u>

Any Tender received after the said date and time, for whatever reasons, will not be considered.`,
  },
  {
    title: "4) TENDER ENQUIRIES",
    description: "", // dynamically filled
  },
  {
    title: "5) GOODS AND SERVICES TAX (G.S.T.)",
    description:
      "G.S.T. shall be excluded in all contract sums quoted by the Tenderers.",
  },
  {
    title: "6) VALIDITY OF TENDERS",
    description:
      "Tenders shall remain valid for acceptance for ninety (90) days from the closing date. No withdrawal is permitted within that period. If validity lapses, the Tenderer may withdraw within ten (10) days; otherwise validity extends a further ninety (90) days.",
  },
  {
    title: "7) TERMS OF PAYMENT",
    description:
      "The Company shall pay the Contractor as follows: (a) Contract Award: 10%; (b) Materials delivered to site: 20%; (c) Interim Payment (70% site completion): 30%; (d) 100% Completion: 35%; (e) Retention Sum (12 months): 5%. The Contractor shall issue progress claims with supporting documents. The Company shall pay within thirty (30) days upon verification. Final Payment only after all defects are rectified and all required documentation (LEW, LP, etc.) is submitted.",
  },
  {
    title: "8) ALTERATIONS TO TEXT",
    description:
      "Tenderers shall not make any alterations to the Tender Documents without the Company's written approval. Any alteration is null and void.",
  },
  {
    title: "9) NON-PRICING OF ITEMS",
    description:
      'Items with no value shall have dashes in the "Amount" and "Unit Rate" columns. Blank cells will be deemed included in the next priced item.',
  },
  {
    title: "10) SUFFICIENCY OF UNIT RATES",
    description:
      "Unit rates shall include all labour, materials, plant, waste, carriage, profit, overheads and everything necessary for proper completion. No variation of tendered price will be allowed.",
  },
  {
    title: "11) ARITHMETICAL ERROR",
    description:
      "Errors in extension or carry‑forward will be rectified and the total adjusted proportionally.",
  },
  {
    title: "12) INSURANCE",
    description:
      "Public Liability: min S$2,000,000; All Risk: min S$2,000,000; Workmen's Compensation: full statutory cover. Policies in joint names of Company, Mall Management and Contractor.",
  },
  {
    title: "13) INDEMNITY",
    description:
      "Contractor indemnifies Company against loss, damage, claim or proceeding arising from personal injury, death, property damage, breach of contract, or unsatisfactory workmanship.",
  },
  {
    title: "14) MATERIALS & FINISHES",
    description:
      "Submit samples for approval. Alternative material requires written approval; any cost saving adjusts Contract Price. All fixtures safe; electrical conduits concealed; stainless steel hardware.",
  },
  {
    title: "15) LIQUIDATED & ASCERTAINED DAMAGES",
    description:
      "If Contractor fails to complete by Handover Date, liquidated damages of S$5,000 per whole day (including Sundays & Public Holidays) payable until actual completion. Company may terminate and engage another Contractor at defaulting Contractor's cost.",
  },
  {
    title: "16) DEFECTS LIABILITY PERIOD",
    description:
      "Twelve (12) months from actual handover of completed site.",
  },
  {
    title: "17) APPROVED FOREIGN WORKERS AT SITE",
    description:
      "All foreign workers must carry valid work permits. Company not responsible for illegal workers; Contractor indemnifies Company against all related losses.",
  },
  {
    title: "18) TENANT'S GUIDE FOR FITTING OUT WORKS",
    description:
      "Contractor shall strictly adhere to guidelines of Building Management / Company.",
  },
  {
    title: "19) OWNERSHIP OF CONTRACT DOCUMENTS AND DRAWINGS",
    description:
      "All signed drawings and material samples shall be returned upon request. Tenderer shall not disclose documents without written consent.",
  },
  {
    title: "20) SPECIALITY WARRANTY",
    description:
      "Additional three (3) years full warranty on all waterproofing works and materials. Defects rectified within seven (7) days of notification.",
  },
  {
    title: "21) NOTIFICATION OF AWARD",
    description:
      "Notification will not be sent to unsuccessful Tenderers.",
  },
];

export const DEFAULT_SCOPE: { title: string; description: string }[] = [
  {
    title: "1) SCOPE OF WORKS",
    description:
      "Supply all materials, labour, plant, equipment and perform all operations necessary to complete the proposed specifications. Prepare shop drawings, samples and mock‑ups when required.",
  },
  {
    title: "2) DISCREPANCIES",
    description:
      "Material Schedule Chart and Drawings take precedence over Form of Quotation description.",
  },
  {
    title: "3) ADDITIONS AND DELETIONS",
    description:
      "Extra work approved in writing by Company undertaken based on Contractor's quoted rates as agreed.",
  },
];

export const DEFAULT_TERMS: { header: string; text: string }[] = [
  {
    header: "1) General",
    text: "The pricing of the Tender including all rates therein, shall be in Singapore Dollars.",
  },
  {
    header: "2) TERMINOLOGIES",
    text: "",
  },
  {
    header: "3) ACCEPTANCE OF TENDER",
    text:
      "Company does not bind itself to accept the lowest, the whole or any tender nor is obligated to give reasons for rejection. Company reserves right to accept any tender in part or in whole.",
  },
  {
    header: "4) CONTRACTOR'S OBLIGATIONS",
    text:
      "Contractor shall carry out works to reasonable satisfaction of Company. All Electrical and Plumbing Works adhere to local statutory codes.",
  },
  {
    header: "5) CARE OF COMPANY'S EQUIPMENT / PROPERTIES",
    text:
      "Contractor takes full responsibility for Company's equipment/properties; any damage made good at Contractor's expense.",
  },
  {
    header: "6) INJURY TO PERSONS AND DAMAGE TO PROPERTY",
    text:
      "Contractor indemnifies Company against personal injury, death, property damage arising from works.",
  },
  {
    header: "7) WORKER'S COMPENSATION",
    text:
      "Contractor shall maintain Workmen's Compensation insurance covering all employees.",
  },
  {
    header: "8) INSURANCE AGAINST INJURY TO PERSONS AND PROPERTY",
    text:
      "Contractor maintains Public Liability Insurance of at least S$3,000,000 per accident, in joint names of Company, Mall Management and Contractor.",
  },
  {
    header: "9) DETERMINATION OF CONTRACT",
    text:
      "Company may determine contract if Contractor suspends works, fails to carry out works to satisfaction, persistently neglects to improve after notice, or breaches insurance/indemnity clauses. Bankruptcy or winding‑up automatically terminates contract. Offering gift/inducement to Company officer entitles termination and recovery of losses.",
  },
  {
    header: "10) CONTRACTOR'S SUPERVISOR",
    text:
      "Contractor provides experienced supervisor present on site during all renovation works.",
  },
  {
    header: "11) VARIATIONS",
    text:
      "Company may order variations by addition or omission; priced using quoted unit rates. Contractor keeps Company representative updated.",
  },
  {
    header: "12) LIQUIDATED DAMAGES",
    text:
      "Failure to complete within specified period incurs liquidated damages of S$5,000 per day (including Sundays & Public Holidays). No extension except at Company's discretion. Contractor to take possession and commence work within one week of Letter of Acceptance.",
  },
  {
    header: "13) COMPLETION PERIOD",
    text:
      "Main contractor co‑ordinates with all Company's contractors and completes renovation by handover date. Cabinet fabrication done off‑site. Urgent rectification within 24 hours, non‑urgent within 72 hours, otherwise Company may engage others at Contractor's cost.",
  },
  {
    header: "14) PROGRESS PAYMENT",
    text:
      "Progress claims accompanied by detailed itemised statement showing value of works done and materials on site.",
  },
  {
    header: "15) DEFECTS LIABILITY",
    text:
      "Defects Liability Period one year from handover. Rectification within 24 hours of notification; otherwise liquidated damages S$2,500 per 6 hours delay.",
  },
  {
    header: "16) RETENTION SUM",
    text:
      "95% paid on satisfactory completion; balance 5% released within three days after Defects Liability Period, provided defects rectified.",
  },
  {
    header: "17) SAMPLES AND SHOP DRAWINGS",
    text:
      "Submit samples, shop drawings and prototypes for approval before proceeding. Setting out of partition line requires approval.",
  },
  {
    header: "18) CO-ORDINATION WITH OTHER CONTRACTORS",
    text:
      "Contractor co‑ordinates with other contractors at own cost, gives fullest co‑operation.",
  },
  {
    header: "19) ARTICLES AND CONDITIONS OF BUILD CONTRACTORS FOR MINOR WORKS",
    text:
      "Latest edition of Singapore Institute of Architects – Articles and Conditions of Building Contract for Minor Works applies.",
  },
  {
    header: "20) SITE SURVEY / MARKING",
    text:
      "Contractor carries out site survey and marking before commencement; final measurements after site marking.",
  },
  {
    header: "21) INSPECTION AND TESTING OF ELECTRICAL WORKS",
    text:
      "Contractor applies to SP Services or other suppliers for testing and turn‑on of power supply.",
  },
  {
    header: "22) ACCESSORIES / IRONMONGERIES",
    text:
      "Stainless steel accessories and ironmongeries for wet areas; stainless steel inlay for floor finishing terminations.",
  },
  {
    header: "23) PLUMBING WORKS",
    text:
      "Submit samples and seek approval for all plumbing works from Company's licensed plumber.",
  },
  {
    header: "24) WATER & ELECTRICAL TEMPORARY SUPPLY",
    text:
      "Contractor liable for costs imposed by building management for temporary supplies; Company not liable.",
  },
  {
    header: "25) AIR CONDITIONING PROVISIONS",
    text:
      "Proper air balancing after completion with PE endorsement.",
  },
  {
    header: "26) OFF-SITE FABRICATION WORKS",
    text:
      "Off‑site fabrication limited to local factories and suppliers; Company may reject overseas fabrication.",
  },
  {
    header: "27) COMPLIANCE WITH REGULATIONS",
    text:
      "All items and work comply with applicable laws of Singapore.",
  },
  {
    header: "28) SUB-CONTRACTING AND ASSIGNING",
    text:
      "Contractor shall not sub‑contract or assign without written consent.",
  },
  {
    header: "29) FORCE MAJEURE",
    text:
      "Company may suspend or determine contract without liability for act of God, riot, strike, etc.",
  },
  {
    header: "30) VARIATION OF CONTRACT",
    text:
      "No oral variation; only written acceptance by both parties.",
  },
  {
    header: "31) RIGHTS OF THIRD PARTY",
    text:
      "No rights under Contracts (Rights of Third Parties) Act.",
  },
];