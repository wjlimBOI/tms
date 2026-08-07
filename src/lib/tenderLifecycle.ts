import { query } from "@/lib/db";
import { sendStageNotificationEmail } from "@/lib/email";
import { ROLE_IDS } from "@/lib/roles";

const AUTO_CLOSE_NOTIFY_ROLES = [ROLE_IDS.FM_REGIONAL_DIRECTOR, ROLE_IDS.FINANCE_GENERAL_MANAGER];

async function notifyAutoClosed(tenders: { tender_id: number; tender_name: string }[]): Promise<void> {
  try {
    const usersRes = await query(
      `SELECT email, name FROM users WHERE role_id = ANY($1) AND is_active = true`,
      [AUTO_CLOSE_NOTIFY_ROLES]
    );
    for (const tender of tenders) {
      for (const recipient of usersRes.rows) {
        await sendStageNotificationEmail({
          to: recipient.email,
          recipientName: recipient.name,
          tenderId: tender.tender_id,
          tenderName: tender.tender_name,
          newStage: 2,
          performedBy: "System (closing date reached)",
        }).catch((err) => {
          console.error(`Auto-close email failed for tender ${tender.tender_id} -> ${recipient.email}:`, err);
        });
      }
    }
  } catch (err) {
    console.error("Auto-close notification lookup failed:", err);
  }
}

// No cron/scheduler exists in this app (single instance, no queue) — Open →
// Closed by closing_date is applied lazily instead: every route that reads
// or acts on tender open/closed status calls this first, so an expired Open
// tender is transitioned before the rest of the route sees stale state. EOT
// approval already extends `closing_date` itself (tender-extension/[id]/route.ts
// PUT), so there is no separate "extended" branch here — it just compares
// against whatever closing_date currently holds.
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

  // Notification emails aren't on the request's critical path.
  void notifyAutoClosed(closedRes.rows);
}
