// app/api/user/change-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import bcrypt from "bcrypt";
import zxcvbn from "zxcvbn";
import { isPasswordCompromised } from "@/lib/pwned";
import { logUpdate, logAuthEvent } from "@/lib/audit"; // ✅ audit imports

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password) {
    return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
  }

  // 1. Minimum length
  if (new_password.length < 15) {
    return NextResponse.json({ error: "Password must be at least 15 characters long" }, { status: 400 });
  }
  if (new_password.length > 64) {
    return NextResponse.json({ error: "Password cannot exceed 64 characters" }, { status: 400 });
  }

  // 2. Strength check
  const strength = zxcvbn(new_password);
  if (strength.score < 2) {
    return NextResponse.json({ error: "Password is too weak. Please choose a stronger password." }, { status: 400 });
  }

  // 3. Blocklist check
  const isCompromised = await isPasswordCompromised(new_password);
  if (isCompromised) {
    return NextResponse.json({ error: "This password has been exposed in a data breach. Please choose a different one." }, { status: 400 });
  }

  // 4. Verify current password
  const userRes = await query(`SELECT user_id, password_hash FROM users WHERE user_id = $1`, [session.user.id]);
  if (userRes.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const user = userRes.rows[0];
  const isValid = await bcrypt.compare(current_password, user.password_hash);
  if (!isValid) {
    // ❌ Log failed attempt
    await logAuthEvent(
      "PERMISSION_DENIED",  // Use existing event type
      session.user.id,
      req,
      {
        reason: "incorrect_current_password",
        action: "change_password",
        source: "api"
      }
    );
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  // 5. Hash new password
  const newHash = await bcrypt.hash(new_password, 12);

  // 6. Update password in DB
  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`,
    [newHash, session.user.id]
  );

  // 7. ✅ Audit log – successful password change using logUpdate
  //    Fetch the updated user for audit (without exposing the hash)
  const updatedUser = await query(
    `SELECT user_id, username, email, is_active, is_approved, must_change_password
     FROM users WHERE user_id = $1`,
    [session.user.id]
  );
  const newUserData = updatedUser.rows[0];

  // Mask the password_hash in old data (we don't store it anyway)
  const oldUserData = {
    ...user,
    password_hash: "***masked***"
  };
  const newUserDataMasked = {
    ...newUserData,
    password_hash: "***masked***"
  };

  await logUpdate(
    "users",
    session.user.id,
    oldUserData,
    newUserDataMasked,
    session.user.id,
    req,
    {
      action: "change_password",
      source: "api",
      method: "self_service"
    }
  );

  return NextResponse.json({ success: true });
}