import { query } from "@/lib/db";

export async function createNotification(
  userId: number,
  title: string,
  body: string,
  link?: string
): Promise<void> {
  await query(
    `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
    [userId, title, body, link || null]
  );
}

// Batch version of createNotification for events with multiple recipients
// (e.g. every FM RD + Finance GM on a stage change) — one INSERT instead of
// one round-trip per recipient. Silently no-ops on an empty recipient list.
export async function notifyUsers(
  userIds: number[],
  title: string,
  body: string,
  link?: string
): Promise<void> {
  if (userIds.length === 0) return;
  const values = userIds
    .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
    .join(", ");
  const params = userIds.flatMap((id) => [id, title, body, link || null]);
  await query(`INSERT INTO notifications (user_id, title, body, link) VALUES ${values}`, params);
}

// Records whether an email actually sent, per event/recipient — backs the
// admin-configurable notification settings' visibility ("did this actually
// go out?") and doubles as a real, indexed dedup source for reminder
// emails. Never throws — a logging failure must not affect the caller.
export async function logEmailNotification(params: {
  eventType: string;
  recipientUserId?: number | null;
  recipientEmail: string;
  tenderId?: number | null;
  isDelivered: boolean;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO email_notification_log (tender_id, recipient_user_id, event_type, recipient_email, is_delivered)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.tenderId || null, params.recipientUserId || null, params.eventType, params.recipientEmail, params.isDelivered]
    );
  } catch (err) {
    console.error("Failed to write email_notification_log:", err);
  }
}

// Single choke point for every email this app sends for a tracked event:
// checks the admin-configurable per-event toggle (notification_event_settings),
// sends, then records delivery success/failure. Never throws — the
// underlying action (award, approval, login, ...) must always succeed
// independent of email delivery or settings.
export async function sendTrackedEmail(
  eventType: string,
  recipient: { userId?: number | null; email: string },
  tenderId: number | null,
  sendFn: () => Promise<void>
): Promise<void> {
  const settingRes = await query(
    `SELECT email_enabled FROM notification_event_settings WHERE event_type = $1`,
    [eventType]
  ).catch(() => null);
  // Fail open on a settings-lookup error (missing table/row, DB hiccup) — a
  // preferences lookup failing must never silently suppress a notification
  // that would otherwise have sent; only an explicit false disables it.
  if (settingRes && settingRes.rows.length > 0 && settingRes.rows[0].email_enabled === false) {
    return;
  }

  try {
    await sendFn();
    await logEmailNotification({ eventType, recipientUserId: recipient.userId, recipientEmail: recipient.email, tenderId, isDelivered: true });
  } catch (err) {
    console.error(`Email send failed (${eventType} -> ${recipient.email}):`, err);
    await logEmailNotification({ eventType, recipientUserId: recipient.userId, recipientEmail: recipient.email, tenderId, isDelivered: false });
  }
}
