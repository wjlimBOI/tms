// lib/projectManagerReassignment.ts
//
// Resolves "who is actually the current Project Manager for this tender"
// on top of the frozen tender.project_manager_id/name/email/phone snapshot.
// A PM resignation is recorded as a row in project_manager_reassignment
// rather than by rewriting any tender's frozen columns — those stay exactly
// as they were set at tender creation, forever. This module walks the
// reassignment chain at read time to find who should now receive reminders
// and pass permission checks in place of the original PM.
import { query } from "@/lib/db";

export interface ResolvedProjectManager {
  id: number;
  name: string;
  email: string;
  phone: string | null;
}

const MAX_HOPS = 5;

// Walks the reassignment chain starting from `fromProjectManagerId` for a
// given tender, following the most-recently-effective applicable
// reassignment at each hop (bounded to MAX_HOPS to guard against cycles),
// and returns the final resolved project_managers row. Returns null if
// fromProjectManagerId is null or no reassignment ever applies — callers
// should fall back to the tender's own frozen project_manager_name/email/
// phone columns in that case.
export async function resolveCurrentProjectManager(
  fromProjectManagerId: number | null,
  tenderId: number,
  asOf: Date = new Date()
): Promise<ResolvedProjectManager | null> {
  if (fromProjectManagerId === null) return null;

  let currentId = fromProjectManagerId;
  const visited = new Set<number>([currentId]);
  let hops = 0;
  let matched = false;

  while (hops < MAX_HOPS) {
    const hopRes = await query(
      `SELECT new_project_manager_id
       FROM project_manager_reassignment
       WHERE old_project_manager_id = $1
         AND effective_from <= $2
         AND (scope = 'global' OR $3 = ANY(tender_ids))
       ORDER BY effective_from DESC, created_at DESC, id DESC
       LIMIT 1`,
      [currentId, asOf, tenderId]
    );

    if (hopRes.rows.length === 0) break;

    const nextId: number = hopRes.rows[0].new_project_manager_id;
    const isCycle = visited.has(nextId);

    // Apply the edge even if it revisits an id (e.g. A->B then later B->A is
    // a legitimate "reassigned back" chain, not a bug) — but stop right
    // after, since the next hop would just repeat the same query and loop
    // forever otherwise.
    matched = true;
    currentId = nextId;
    visited.add(currentId);
    hops++;
    if (isCycle) break;
  }

  if (!matched) return null;

  const pmRes = await query(
    `SELECT id, name, email, phone FROM project_managers WHERE id = $1`,
    [currentId]
  );
  if (pmRes.rows.length === 0) return null;

  const row = pmRes.rows[0];
  return { id: row.id, name: row.name, email: row.email, phone: row.phone ?? null };
}

// Batch version — resolves current PM for many tenders in one call, used to
// validate which tenders currently belong to a given PM before reassigning
// them. Calls resolveCurrentProjectManager per tender in a loop — this app
// is small-scale, no need for a batched SQL query (see AGENTS.md §10).
export async function resolveCurrentProjectManagersForTenders(
  tenders: { tenderId: number; projectManagerId: number | null }[],
  asOf: Date = new Date()
): Promise<Map<number, ResolvedProjectManager | null>> {
  const result = new Map<number, ResolvedProjectManager | null>();
  for (const t of tenders) {
    const resolved = await resolveCurrentProjectManager(t.projectManagerId, t.tenderId, asOf);
    result.set(t.tenderId, resolved);
  }
  return result;
}
