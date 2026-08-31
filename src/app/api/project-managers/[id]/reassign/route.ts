// app/api/project-managers/[id]/reassign/route.ts
//
// Records a PM-resignation reassignment: from now on, some/all of the old
// PM's tenders resolve to a replacement PM for reminder/permission
// purposes. Never rewrites tender.project_manager_name/email/phone — those
// stay frozen forever; only future reads via resolveCurrentProjectManager
// change.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";
import { logInsert, logAuthEvent } from "@/lib/audit";
import { canManageProjectManagers } from "@/lib/permissions";
import { resolveCurrentProjectManager } from "@/lib/projectManagerReassignment";

const reassignSchema = z
  .object({
    newProjectManagerId: z.number().int().positive(),
    scope: z.enum(["global", "tenders"]),
    tenderIds: z.array(z.number().int().positive()).optional(),
    effectiveFrom: z.string().datetime().optional(),
  })
  .refine((d) => (d.scope === "tenders" ? !!d.tenderIds && d.tenderIds.length > 0 : true), {
    message: "tenderIds is required and must be non-empty when scope is 'tenders'",
  });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const oldProjectManagerId = Number(id);
  if (!Number.isInteger(oldProjectManagerId) || oldProjectManagerId <= 0) {
    return NextResponse.json({ error: "Invalid project manager id" }, { status: 400 });
  }

  const userRoleIds = (session.user as any).roleIds || [];
  if (!(await canManageProjectManagers(session.user.id, userRoleIds))) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "reassign_project_manager",
      reason: "Unauthorized",
      source: "api",
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validated = reassignSchema.parse(body);

    if (validated.newProjectManagerId === oldProjectManagerId) {
      return NextResponse.json(
        { error: "Cannot reassign a project manager to themselves" },
        { status: 400 }
      );
    }

    const pmRes = await query(
      `SELECT id, name, email FROM project_managers WHERE id = ANY($1)`,
      [[oldProjectManagerId, validated.newProjectManagerId]]
    );
    const oldPm = pmRes.rows.find((r) => r.id === oldProjectManagerId);
    const newPm = pmRes.rows.find((r) => r.id === validated.newProjectManagerId);
    if (!oldPm) {
      return NextResponse.json({ error: "The project manager being replaced could not be found" }, { status: 404 });
    }
    if (!newPm) {
      return NextResponse.json({ error: "The replacement project manager could not be found" }, { status: 404 });
    }

    let effectiveFrom: Date;
    if (validated.effectiveFrom) {
      effectiveFrom = new Date(validated.effectiveFrom);
      if (effectiveFrom.getTime() < Date.now() - 5000) {
        return NextResponse.json({ error: "Effective date/time cannot be in the past." }, { status: 400 });
      }
    } else {
      effectiveFrom = new Date();
    }

    let affectedTenderIds: number[] = [];
    let tenderIdsForInsert: number[] | null = null;

    if (validated.scope === "tenders") {
      const requestedIds = validated.tenderIds as number[];
      const tendersRes = await query(
        `SELECT tender_id, project_manager_id FROM tender WHERE tender_id = ANY($1) AND is_deleted = false`,
        [requestedIds]
      );
      const foundIds = new Set(tendersRes.rows.map((r) => r.tender_id));
      const missingIds = requestedIds.filter((tid) => !foundIds.has(tid));
      if (missingIds.length > 0) {
        return NextResponse.json(
          { error: "Some selected tenders could not be found", tenderIds: missingIds },
          { status: 404 }
        );
      }

      const mismatched: number[] = [];
      for (const row of tendersRes.rows) {
        const resolved = await resolveCurrentProjectManager(row.project_manager_id, row.tender_id);
        const currentPmId = resolved ? resolved.id : row.project_manager_id;
        if (currentPmId !== oldProjectManagerId) {
          mismatched.push(row.tender_id);
        }
      }
      if (mismatched.length > 0) {
        return NextResponse.json(
          {
            error: "Some selected tenders are not currently assigned to this project manager",
            tenderIds: mismatched,
          },
          { status: 409 }
        );
      }

      affectedTenderIds = requestedIds;
      tenderIdsForInsert = requestedIds;
    } else {
      // Start from tenders whose frozen project_manager_id points here, then
      // filter to only those that CURRENTLY resolve to this PM — a tender
      // already routed elsewhere by a prior reassignment must not be pulled
      // along by a second, unrelated reassignment naming the same old PM id
      // (mirrors the filtering in current-tenders/route.ts).
      const globalRes = await query(
        `SELECT tender_id, project_manager_id FROM tender WHERE project_manager_id = $1 AND is_deleted = false`,
        [oldProjectManagerId]
      );
      const current: number[] = [];
      for (const row of globalRes.rows) {
        const resolved = await resolveCurrentProjectManager(row.project_manager_id, row.tender_id);
        const currentPmId = resolved ? resolved.id : row.project_manager_id;
        if (currentPmId === oldProjectManagerId) {
          current.push(row.tender_id);
        }
      }
      affectedTenderIds = current;
      tenderIdsForInsert = null;
    }

    const insertRes = await query(
      `INSERT INTO project_manager_reassignment
         (old_project_manager_id, new_project_manager_id, scope, tender_ids, effective_from, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        oldProjectManagerId,
        validated.newProjectManagerId,
        validated.scope,
        tenderIdsForInsert,
        effectiveFrom.toISOString(),
        session.user.id,
      ]
    );
    const newRow = insertRes.rows[0];

    if (affectedTenderIds.length > 0) {
      await query(
        `UPDATE tender SET dlp_reminder_sent_at = NULL
         WHERE tender_id = ANY($1) AND is_deleted = false AND stage = 3 AND handover_date IS NOT NULL
           AND dlp_reminder_sent_at IS NOT NULL
           AND (handover_date + (COALESCE(defect_liability_months,12) || ' months')::interval)::date
               <= (CURRENT_DATE + INTERVAL '30 days')`,
        [affectedTenderIds]
      );
    }

    await logInsert("project_manager_reassignment", newRow.id, newRow, session.user.id, req, {
      action: "reassign_project_manager",
      old_project_manager_id: oldProjectManagerId,
      new_project_manager_id: validated.newProjectManagerId,
      scope: validated.scope,
      source: "api",
    });

    return NextResponse.json(newRow, { status: 201 });
  } catch (err) {
    console.error(err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
