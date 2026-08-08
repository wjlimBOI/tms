import { query } from "@/lib/db";
import { sendStageNotificationEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notifications";
import { ROLE_IDS } from "@/lib/roles";

const STAGE_NOTIFY_ROLES = [ROLE_IDS.FM_REGIONAL_DIRECTOR, ROLE_IDS.FINANCE_GENERAL_MANAGER];
const STAGE_NAMES = ["Upcoming", "Open", "Closed", "Awarded"];

async function notifyAutoTransition(
  tenders: { tender_id: number; tender_name: string }[],
  newStage: number,
  performedBy: string
): Promise<void> {
  try {
    const usersRes = await query(
      `SELECT user_id, email, name FROM users WHERE role_id = ANY($1) AND is_active = true`,
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
