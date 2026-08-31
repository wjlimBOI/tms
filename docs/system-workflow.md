# TMS — System Workflow & Feature Guide

This document describes how the Tender Management System actually works today: the roles, the tender lifecycle, and the end-to-end flow of events for both contractors and internal staff. It's a plain-language companion to `docs/rbac.md` (permission internals), `docs/api-conventions.md` (API/versioning details), and `docs/design-system.md` (visual language) — read those for implementation detail; read this for "what happens, in what order, and who can do it."

---

## 1. Roles

| Role | Summary |
|---|---|
| **Developer** | The sole app developer's account. Gets every bypass Admin gets, everywhere, so the person maintaining the system is never blocked by a permission gap while testing. **Intended governance model (see note below): Developer has ultimate control of the system's configuration; Admin operates within whatever Developer has set up.** |
| **Admin** | Full control of day-to-day operation — tenders, BQs, users, roles/permissions, contract templates — within the configuration Developer has established. Not a peer to Developer; see note below. |
| **Executive Director** | Full *view* access across the system for oversight (reduces the chance of internal manipulation going unnoticed) — but cannot create, edit, delete, or manage anything. Read-only by design. |
| **CEO / SCOO / COO / FM Regional Director / FM Deputy GM / Senior Project Manager / Project Manager** | Internal management chain. Project Managers are the day-to-day tender owners; **FM Regional Director is the sole approver of both extension-of-time requests (§8) and the Award action (§7)**; Senior PM/PM share most other tender-management actions. |
| **Finance General Manager / Finance Manager / Finance Team** | Budget and costing oversight — Finance Summary tooling on BQ comparisons. Listed in seniority order: Finance GM ranks above Finance Manager (reflected in `roles.sort_order`, used for admin UI display ordering). |
| **Internal Audit Team / Legal Team / Renovation Team** | Supporting internal roles with scoped visibility. |
| **Contractor** | External renovation contractors. Everything they see is scoped to tenders they've participated in. |

Authorization is enforced **per route**, not through a central gatekeeper — every API route checks the caller's role(s) against `src/lib/permissions.ts`. There's also a real `permissions`/`role_permissions` table pair backing the admin-configurable side of this (see §12).

> **Developer vs. Admin — intended governance, not yet enforced.** As of 2026-08-12 this is a documented *intent*, not code reality: `isSuperUser()` still treats Admin and Developer as fully interchangeable everywhere in the codebase — there is no code path today where Developer can restrict what Admin is allowed to configure. Don't rely on this distinction actually holding until it's built; treat Admin and Developer as equivalent in practice until this note is updated to point at real enforcement.

---

## 2. The Tender Lifecycle

Every tender moves through four real stages, tracked as `tender.stage` (0–3) and mirrored in `tender.status_id`:

```
Upcoming (0) → Open (1) → Closed (2) → Awarded (3)
```

Plus a separate **Cancelled (-1)** state a tender can be placed into instead of following the happy path.

- **Upcoming → Open** and **Open → Closed** happen automatically, driven by `tender.tender_date` and `tender.closing_date` — there's no cron job; the app checks on every relevant request whether a tender has crossed its scheduled boundary and flips it there and then.
- **Open → Closed** can also be pushed out via an approved **Extension of Time (EOT)** request (§8) — the FM Regional Director rewrites `closing_date` directly, and the automatic-close check simply respects the new date.
- **Closed → Awarded** is a deliberate, manual action reserved for the FM Regional Director (the Award flow, §7) — never automatic, and not bypassed by Admin/Developer. No role can skip straight to Awarded, and no role can advance a tender past Closed through the ordinary stage-advance action; award is its own dedicated action.
- **Reverting** a stage backward is Admin-only, and the system refuses to revert a tender out of Awarded while an award record still exists for it — award and stage are never allowed to disagree with each other.

---

## 3. The Contractor Journey

**1. Get invited.** Interest is invitation-only — staff select specific registered contractors from a tender's Messages panel ("Send Invitation") and each gets a one-time-token email link plus an in-app notification. The tender list shows every *Open* tender to every contractor, but a contractor who hasn't been invited yet sees only a masked "simple view" (name, branch, building — no description, no PM contact, no handover details). Closed or Awarded tenders are invisible to a contractor unless they actually participated in that tender.

**2. Accept or decline.** The invitation email lets a contractor accept or decline directly via the token link, without logging in — the full invitation message is visible right there in the email/landing page. Accepting unlocks the full tender details (description, PM contact, handover info) and tender documents for that contractor; declining just records the decision. Interest can also be **withdrawn** later while the tender is still Open, which reverts them back to the masked view.

**3. Acknowledge the Form of Tender.** Before a BQ can move from Draft to Submitted, the contractor must have acknowledged the tender's terms (`tender_acknowledgment`). Trying to submit without this is blocked with a clear "Form of Tender required" message and a direct link to go complete it.

**4. Build the Bill of Quantities (BQ).** From "New BQ," a contractor picks the project and work categories (all categories are pre-selected automatically once a project is chosen — they only need to deselect what doesn't apply) and fills in line items per category. Contractors cannot import BQs from Excel — only staff can; contractors always build manually or edit the auto-populated template. The BQ auto-saves as they work.

**5. Submit.** Once acknowledged and complete, the contractor submits. From that point the BQ is locked (read-only) unless one of two things is true: the tender is still Open (so they can keep revising and resubmitting fresh drafts), or staff has explicitly granted them a resubmission round (§6).

**6. Wait through Closed.** Once the tender closes, no more first-time submissions are possible. Contractors can still message the tender team during this window, and can still see documents *only if the tender is still within its Open window* — document access itself cuts off hard at Closed, with no exception, including for the eventual winner. This is a deliberate anti-manipulation control.

**7. Negotiation (optional).** If staff asks for a revised quote (§6), the contractor gets an email + in-app notification with instructions and a due date, a visible "Revised quote requested" badge on their BQ list, and a one-round editing window reopened specifically for that resubmission.

**8. Award outcome.** Every participant gets a decision email. The winning contractor gets an award notification and keeps full access — messaging remains open to them alone from this point forward; every other participant (including near-misses) keeps their tender visible as a historical record but loses document access and messaging. Non-participants never see the tender at all.

**9. Handover & contract.** Physical contract documents are handled outside the system (email), and staff manually mark "contract received" against the award. Once staff records the actual handover date, the Defect Liability Period clock starts from that date.

---

## 4. The Staff Journey

**1. Create the tender.** Admin (or anyone with `create_tender` permission) fills in the tender — branch, renovation type, dates, project manager, budget, contract clauses (snapshotted from the active contract template at creation time). It starts life as Upcoming.

**2. Build the BQ template.** Admin defines the reference bill-of-quantities template contractors' categories/line items are modeled on, including reference market rates used later for deviation flagging.

**3. Tender opens automatically** on its scheduled date; staff invite specific contractors from the tender's Messages panel and track invitation/response status (Invited / Accepted / Declined / Pending) from a contractor-detail modal.

**4. Tender closes automatically** on its scheduled date (or on an approved extension's new date). From here staff move into evaluation.

**5. Compare submissions.** The BQ Compare view lets staff see every contractor's submission side-by-side. Contractor identity can be **masked** — pricing and line items stay fully visible, but the contractor's name is hidden — so negotiation decisions aren't influenced by who's who. A **Saved Comparison** snapshot can be taken to keep a durable, annotatable record of the official comparison distinct from the live/recomputed view; per-contractor notes on that snapshot persist even when the comparison is refreshed. A **Finance Summary** tool (Finance roles) flags which line items are unusually high or low relative to the competing bids on the same tender and suggests a recommended ceiling, with AI-assisted notes.

**6. Negotiate.** A Project Manager can request a resubmission from a specific contractor directly from the comparison view — this automatically tells that contractor (via email and in-app) whether their pricing is trending high, low, or mixed relative to competitors, *without* revealing exact competitor figures, and reopens exactly one more editing round for them. Staff can also leave running notes on any contractor's BQ, each explicitly marked either "visible to contractor" or "internal only."

**7. Award.** FM Regional Director runs the award action, which moves the tender to Awarded, creates the award record, and fires the winner/non-winner notification emails in the same step.

**8. Manage the aftermath.** Staff can toggle "contract received," and once handover is recorded, Defect Liability Period tracking begins. If something needs correcting, Admin can revert a stage — blocked only if doing so would leave an award record pointing at a tender that's no longer Awarded.

---

## 5. Bill of Quantities (BQ) — Details

- A BQ (`tender_submission`) belongs to one contractor on one tender, organized into work categories, each holding line items (description, quantity, unit, rate, amount).
- **Rounds.** Every resubmission is a new "round" (`round_no`) — the system always evaluates the *latest* round per contractor, never a mix.
- **Status.** `Draft → Submitted → Approved/Rejected`. Only Draft is editable, and only under the access rules in §3 step 5.
- **Excel.** Staff-only import/export. A shared file-validation check (size cap + real content-signature check, not just filename) applies to every upload route in the app.

---

## 6. Negotiation & Resubmission — Details

This whole workflow runs on a set of tables that existed in the schema but were dormant until this feature was built: `submission_review`, `review_comment`, `resubmission_request`, `reno_comparison`/`reno_comparison_item`, `negotiation_log`, `finance_budget_summary`.

- A **resubmission request** targets one contractor, one tender, and the *next* round number after their current latest — so the grant is exact, not a blanket "edit anything" unlock.
- The contractor sees only a relative signal (higher/lower/mixed vs. the field) — never another contractor's actual numbers.
- **Notes** on a BQ form a running comment thread, each one flagged visible-to-contractor or staff-only at the point it's written.

---

## 7. Award — Details

- Award is exclusively `Closed → Awarded`, restricted to the **FM Regional Director** role (configurable via `tender_award_settings`, admin API at `/api/admin/award-settings`, editable from Admin → Security → Role Permissions' "Award Approver" column), and independent of the ordinary stage-advance action.
- Deliberately **not** bypassed by Admin/Developer's usual `isSuperUser` shortcut — same reasoning as EOT approval below: award authority sits with the regional business owner, not a system administrator. See `canApproveAward()` in `src/lib/permissions.ts`. Falls back to FM Regional Director if no settings row exists.
- Awarding creates a `tender_award` row (winning contractor, amount, date) and triggers the win/loss notification emails in the same transaction.
- Reverting out of Awarded is blocked while that award record still exists, so the two can never silently disagree.

---

## 8. Extension of Time (EOT) Requests

- A contractor can request more time before an Open tender closes, giving a reason and a day count — but only within a **48-hour late-request window** before the closing time (not earlier). Both the request form (client-side) and `POST /api/tender-extension` (server-side) enforce this window.
- Approval is restricted to the **FM Regional Director** role specifically (configurable via `tender_extension_settings`, not hardcoded) — this is a deliberate exception to the general Admin/Developer bypass, since EOT approval is meant to sit with the actual regional business owner, not a system administrator.
- Approving rewrites `closing_date` directly; the automatic-close check then just respects the new date, so no separate "extended" state is needed anywhere else in the system.
- **Notification CC list.** The EOT request email (sent to the approver) is also CC'd to whichever roles are marked `is_cc = true` in `tender_extension_settings` — configurable from the same Admin → Security → Role Permissions screen ("Extension CC" column). Currently configured: Finance General Manager, Project Manager, and Senior Project Manager. Falls back to Finance GM + Project Manager if no CC rows exist at all.

---

## 9. Messaging

- Open tenders: any participant can message the tender team.
- Closed (pre-award): messaging stays open to everyone who participated — this is the negotiation window.
- Awarded: messaging narrows to the winning contractor only. Everyone else is expected to use email/phone from this point, to keep in-system data minimal once a tender is decided.

---

## 10. Notifications & Email

Every state change that matters to a human fires both an in-app notification and, where appropriate, a tracked email: interest registration, acknowledgment reminders, resubmission requests, award decisions (win and loss), extension decisions, submission-deadline reminders, and DLP milestones. Email sends are logged (`email_notification_log`) so delivery can be audited.

---

## 11. Documents

- Tender documents are visible only to contractors who registered interest, and only while the tender is Open — access closes for everyone (including the eventual winner) the moment the tender closes, by design, to reduce any chance of favoritism or leaked information during evaluation.
- File uploads (BQ templates, tender documents) are stored on local disk and validated by both a size cap and a real file-signature check, not just the filename extension.

---

## 12. Admin Configuration

- **Roles & Permissions** — Admin can manage the role list and the `permissions`/`role_permissions` matrix from Admin → Security. Day-to-day authorization checks still primarily use the hardcoded `ROLE_IDS`/`isSuperUser()` helpers, with the permissions table layered on for specific checks — this is a deliberate, documented split, not an oversight. The same screen's role matrix also carries three extra columns that aren't "permissions" in the `permissions` table sense — they're the same auto-create-if-missing pattern applied to two dedicated settings tables:
  - **Extension Approver** / **Extension CC** (`tender_extension_settings`) — which role(s) approve EOT requests and which are CC'd on the request email.
  - **Award Approver** (`tender_award_settings`) — which role(s) may run the Award action (§7).
  Both are deliberately excluded from the Admin/Developer bypass (see §7, §8) — toggling them is an Admin capability, but *using* the resulting authority isn't automatically Admin's.
- **Notification Settings** (Admin → Security → Notifications → Email) — per-event-type on/off toggle for whether a notification email sends at all (`notification_event_settings`). This does not control *who* receives it, only whether the email fires.
- **Users** — create/approve/deactivate accounts, assign roles, set access validity windows.
- **Branches, brands, work categories, renovation types, contract templates** — the reference data every tender and BQ is built from.
- **Audit log** — every insert/update/delete of consequence is recorded with who, when, and what changed. Includes a `PDPA_ACCESS_REQUEST` action type, written every time staff use Admin → Security → Data Requests to retrieve a data subject's full record (Privacy Policy §5 tooling).
- **Compliance** (Admin → Security → Compliance) — read-only ROPA summary and DPIA framework explanation, kept in sync with the public Privacy Policy. Not an editable log.

---

## 13. Security Notes

- Session-based auth (NextAuth), checked per-route rather than through a single global middleware.
- Passwords are bcrypt-hashed; a forced password-change flow exists for newly created accounts.
- Raw database connections verify TLS by default in production.
- No secrets, credentials, or personal data are ever written to logs or exposed to the client.

---

*This document reflects the system as built through 2026-08-12. If a described behavior stops matching reality, treat the code as the source of truth and update this file — not the other way around.*
