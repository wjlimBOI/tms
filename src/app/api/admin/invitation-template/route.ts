// app/api/admin/invitation-template/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { isSuperUser } from "@/lib/roles";
import { z } from "zod";

const templateSchema = z.object({
  subject: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => !/[\r\n]/.test(value), {
      message: "Subject cannot contain line breaks",
    }),
  body: z.string().min(1).max(4000),
});

// GET: fetch the current invitation email template
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await query(
      `SELECT id, subject, body, updated_at FROM tender_invitation_template ORDER BY id ASC LIMIT 1`
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Invitation template not found" }, { status: 404 });
    }
    return NextResponse.json({ template: result.rows[0] });
  } catch (error) {
    console.error("GET /api/admin/invitation-template error:", error);
    return NextResponse.json({ error: "Failed to fetch invitation template" }, { status: 500 });
  }
}

// PUT: update the invitation email template
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = templateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
    }
    const { subject, body } = parsed.data;

    const result = await query(
      `UPDATE tender_invitation_template
       SET subject = $1, body = $2, updated_at = NOW(), updated_by = $3
       WHERE id = (SELECT id FROM tender_invitation_template ORDER BY id ASC LIMIT 1)
       RETURNING id, subject, body, updated_at`,
      [subject, body, session.user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Invitation template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, template: result.rows[0] });
  } catch (error) {
    console.error("PUT /api/admin/invitation-template error:", error);
    return NextResponse.json({ error: "Failed to update invitation template" }, { status: 500 });
  }
}
