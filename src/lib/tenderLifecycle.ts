import { query } from "@/lib/db";
import { sendStageNotificationEmail, sendDlpReminderEmail, sendSubmissionDeadlineReminderEmail } from "@/lib/email";
import { notifyUsers, createNotification, sendTrackedEmail } from "@/lib/notifications";
import { ROLE_IDS } from "@/lib/roles";
import { toDateOnly } from "@/lib/dateUtils";

const STAGE_NOTIFY_ROLES = [ROLE_IDS.FM_REGIONAL_DIRECTOR, ROLE_IDS.FINANCE_GENERAL_MANAGER];
const STAGE_NAMES = ["Upcoming", "Open", "Closed", "Awarded"];

async function notifyAutoTransition(
  tenders: { tender_id: number; tender_name: string }[],
  newStage: number,
  performedBy: string
): Promise<void> {
  try {
    // `users` has no `name`/`display_name` column - the real name lives on
    // user_profile.full_name (matches the pattern already used by
    // admin/users/route.ts). Falls back to username when no profile name is
    // set. Selecting a nonexistent `users.name` column throws a Postgres
    // error, which the outer try/catch here swallowed silently - meaning
    // this entire function (both the email AND the in-app notification loop
    // below, since they're computed after this query) has never actually
    // run for any real auto stage-transition until this fix.
    const usersRes = await query(
      `SELECT u.user_id, u.email, COALESCE(up.full_name, u.username) AS name
       FROM users u
       LEFT JOIN user_profile up ON up.user_id = u.user_id
       WHERE u.role_id = ANY($1) AND u.is_active = true`,
      [STAGE_NOTIFY_ROLES]
    );
    const recipientIds = usersRes.rows.map((r) => r.user_id);
    const stageName = STAGE_NAMES[newStage] || `Stage ${newStage}`;

    for (const tender of tenders) {
      for (const recipient of usersRes.rows) {
        await sendStageNotificationEmail({
          to: recipient.email,
          recipientName: recipient.name,
          tenderId: tender.tender_id,
          tenderName: tender.tender_name,
          newStage,
          performedBy,
        }).catch((err) => {
          console.error(`Auto-transition email failed for tender ${tender.tender_id} -> ${recipient.email}:`, err);
        });
      }
      await notifyUsers(
        recipientIds,
        `Tender moved to ${stageName}`,
        `"${tender.tender_name}" has been moved to ${stageName} by ${performedBy}.`,
        `/tenders/${tender.tender_id}`
      ).catch((err) => {
        console.error(`Auto-transition in-app notification failed for tender ${tender.tender_id}:`, err);
      });
    }
  } catch (err) {
    console.error("Auto-transition notification lookup failed:", err);
  }
}

// No cron/scheduler exists in this app (single instance, no queue) — both the
// Upcoming → Open (by tender_date, the "Tender Start" field set at creation)
// and Open → Closed (by closing_date) transitions are applied lazily instead:
// every route that reads or acts on tender open/closed status calls
// applyScheduledTenderTransitions() first, so an expired/due tender is
// transitioned before the rest of the route sees stale state. EOT approval
// already extends `closing_date` itself (tender-extension/[id]/route.ts PUT),
// so there is no separate "extended" branch here — it just compares against
// whatever closing_date currently holds.

export async function autoOpenScheduledTenders(): Promise<void> {
  const statusRes = await query(
    `SELECT status_id FROM tender_status WHERE status_code = 'Open'`
  );
  if (statusRes.rows.length === 0) return;
  const openStatusId = statusRes.rows[0].status_id;

  const openedRes = await query(
    `UPDATE tender
     SET stage = 1, status_id = $1, stage_updated_at = NOW(), updated_at = NOW()
     WHERE stage = 0 AND is_deleted = false
       AND tender_date IS NOT NULL AND tender_date < NOW()
     RETURNING tender_id, tender_name`,
    [openStatusId]
  );

  if (openedRes.rows.length === 0) return;

  // Notification emails aren't on the request's critical path.
  void notifyAutoTransition(openedRes.rows, 1, "System (tender start date reached)");
}

export async function autoCloseExpiredTenders(): Promise<void> {
  const statusRes = await query(
    `SELECT status_id FROM tender_status WHERE status_code = 'closed'`
  );
  if (statusRes.rows.length === 0) return;
  const closedStatusId = statusRes.rows[0].status_id;

  const closedRes = await query(
    `UPDATE tender
     SET stage = 2, status_id = $1, stage_updated_at = NOW(), updated_at = NOW()
     WHERE stage = 1 AND is_deleted = false
       AND closing_date IS NOT NULL AND closing_date < NOW()
     RETURNING tender_id, tender_name`,
    [closedStatusId]
  );

  if (closedRes.rows.length === 0) return;

  void notifyAutoTransition(closedRes.rows, 2, "System (closing date reached)");
}

// Runs open-then-close in sequence so a tender whose tender_date and
// closing_date have both already passed (e.g. a short/backdated window)
// lands in the correct final stage within a single lazy check.
export async function applyScheduledTenderTransitions(): Promise<void> {
  await autoOpenScheduledTenders();
  await autoCloseExpiredTenders();
}

// DLP (Defect Liability Period) reminder — same lazy, no-cron pattern as the
// stage auto-transitions above, but a one-time notification rather than a
// state change. dlp_reminder_sent_at dedupes so a tender is only ever
// reminded-on once per handover; the handover route resets it to NULL if the
// handover date/defect liability period is later corrected, so a new expiry
// can trigger a fresh reminder.
export async function sendDueDlpReminders(): Promise<void> {
  const dueRes = await query(
    `SELECT t.tender_id, t.tender_name, b.branch_name,
            (t.handover_date + (COALESCE(t.defect_liability_months, 12) || ' months')::interval)::date AS due_date
     FROM tender t JOIN branch b ON t.branch_id = b.branch_id
     WHERE t.is_deleted = false AND t.stage = 3 AND t.handover_date IS NOT NULL
       AND t.dlp_reminder_sent_at IS NULL
       AND (t.handover_date + (COALESCE(t.defect_liability_months, 12) || ' months')::interval)::date
           <= (CURRENT_DATE + INTERVAL '30 days')`
  );
  if (dueRes.rows.length === 0) return;

  // Same users.name-doesn't-exist issue as notifyAutoTransition above.
  const adminRes = await query(
    `SELECT u.user_id, u.email, COALESCE(up.full_name, u.username) AS name
     FROM users u
     LEFT JOIN user_profile up ON up.user_id = u.user_id
     WHERE u.role_id = $1 AND u.is_active = true`,
    [ROLE_IDS.ADMIN]
  );
  const adminIds = adminRes.rows.map((r) => r.user_id);

  for (const t of dueRes.rows) {
    // `due_date` comes back from pg as a native Date object (no custom type
    // parser is registered - see src/lib/db.ts), not a string, even though
    // it's typed `string` downstream. Interpolating a Date directly gives
    // "Sat Sep 12 2026 00:00:00 GMT+0000 (...)" in the notification text, and
    // escapeHtml() in email.ts calls .replace() on it, which throws (caught
    // and swallowed by sendTrackedEmail, so the reminder email silently
    // never sends) - must convert to a plain date string first.
    const dueDateStr = toDateOnly(t.due_date);

    await notifyUsers(
      adminIds,
      `DLP expiring soon: ${t.tender_name}`,
      `${t.branch_name} — Defect Liability Period expires on ${dueDateStr}.`,
      `/tenders/${t.tender_id}`
    ).catch((err) => console.error(`DLP reminder notify failed for tender ${t.tender_id}:`, err));

    for (const admin of adminRes.rows) {
      await sendTrackedEmail("dlp_reminder", { userId: admin.user_id, email: admin.email }, t.tender_id, (ccEmails) =>
        sendDlpReminderEmail({ to: admin.email, recipientName: admin.name, tenderName: t.tender_name, tenderId: t.tender_id, dueDate: dueDateStr, cc: ccEmails })
      );
    }

    await query(`UPDATE tender SET dlp_reminder_sent_at = NOW() WHERE tender_id = $1`, [t.tender_id]);
  }
}

// Submission-deadline reminder — reminds a contractor who has interest/access
// on an Open tender but hasn't actually submitted yet, once, as the closing
// date approaches. Dedup is the real email_notification_log table (not a
// new column) — see docs/pending-migrations.md for the notification_event_settings
// migration this also depends on for the admin-configurable email toggle.
export async function sendUpcomingSubmissionDeadlineReminders(): Promise<void> {
  const candidates = await query(
    `SELECT DISTINCT c.contractor_id, u.username, u.email, t.tender_id, t.tender_name, t.closing_date
     FROM tender t
     JOIN (
       SELECT contractor_id, tender_id FROM tender_interest WHERE is_approved = true
       UNION
       SELECT contractor_id, tender_id FROM tender_contractor WHERE can_submit = true
     ) c ON c.tender_id = t.tender_id
     JOIN users u ON u.user_id = c.contractor_id AND u.is_deleted = false
     WHERE t.is_deleted = false AND t.stage = 1
       AND t.closing_date IS NOT NULL
       AND t.closing_date BETWEEN NOW() AND (NOW() + INTERVAL '3 days')
       AND NOT EXISTS (
         SELECT 1 FROM tender_submission ts
         WHERE ts.tender_id = t.tender_id AND ts.contractor_id = c.contractor_id
           AND ts.is_deleted = false AND ts.status != 'Draft'
       )
       AND NOT EXISTS (
         SELECT 1 FROM email_notification_log el
         WHERE el.event_type = 'submission_deadline_reminder'
           AND el.tender_id = t.tender_id AND el.recipient_user_id = c.contractor_id
       )`
  ).catch((err) => {
    console.error("Failed to query submission-deadline reminder candidates:", err);
    return { rows: [] as any[] };
  });

  for (const c of candidates.rows) {
    // Same pg Date-object issue as sendDueDlpReminders above - c.closing_date
    // is a native Date, not a string, so it must be converted before use.
    const closingDateStr = toDateOnly(c.closing_date);

    await createNotification(
      c.contractor_id,
      "Submission deadline approaching",
      `"${c.tender_name}" closes on ${closingDateStr}. Submit your bid before then.`,
      `/tenders/${c.tender_id}`
    ).catch((err) => console.error(`Submission-deadline in-app notify failed for tender ${c.tender_id}:`, err));

    await sendTrackedEmail(
      "submission_deadline_reminder",
      { userId: c.contractor_id, email: c.email },
      c.tender_id,
      (ccEmails) =>
        sendSubmissionDeadlineReminderEmail({ to: c.email, recipientName: c.username, tenderName: c.tender_name, tenderId: c.tender_id, closingDate: closingDateStr, cc: ccEmails }),
      "alerts"
    );
  }
}
