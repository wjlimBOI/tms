import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { resource_type, resource_id } = await req.json();
  if (!resource_type || !resource_id) {
    return NextResponse.json({ error: "Missing resource_type or resource_id" }, { status: 400 });
  }

  // Check if an active request already exists
  const existing = await query(
    `SELECT request_id FROM approval_requests
     WHERE resource_type = $1 AND resource_id = $2 AND status = 'pending'`,
    [resource_type, resource_id]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json({ request_id: existing.rows[0].request_id });
  }

  const client = await (await import("@/lib/db")).default.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO approval_requests (resource_type, resource_id, requester_id, current_step, status)
       VALUES ($1, $2, $3, 1, 'pending')
       RETURNING request_id`,
      [resource_type, resource_id, session.user.id]
    );
    await client.query("COMMIT");
    return NextResponse.json({ request_id: result.rows[0].request_id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return NextResponse.json({ error: "Failed to create approval request" }, { status: 500 });
  } finally {
    client.release();
  }
}