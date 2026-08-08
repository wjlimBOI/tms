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
