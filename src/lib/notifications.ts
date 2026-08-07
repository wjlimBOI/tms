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
