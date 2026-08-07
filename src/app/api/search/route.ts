import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

function formatMatchLabel(field: string): string {
  const labels: Record<string, string> = {
    tender_name: "Tender name",
    tender_description: "Description",
    branch_name: "Branch name",
    brand_name: "Brand name",
    renovation_type: "Renovation type",
    bq_name: "BQ name",
    version_name: "Version name",
    client_name_override: "Client name",
    branch_name_override: "Job site",
    work_type: "Work type",
  };
  return labels[field] || field;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userRoleIds = (session.user as any)?.roleIds || [];
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type") || "all";

  if (!q || q.length < 2) {
    return NextResponse.json({ tenders: [], bqs: [] });
  }

  const contains = `%${q}%`;
  const prefix = `${q}%`;

  let tenders: any[] = [];
  let bqs: any[] = [];

  // ----- TENDERS -----
  if (type === "all" || type === "tender") {
    const tendersResult = await query(
      `SELECT 
          t.tender_id,
          t.tender_name,
          t.tender_description,
          COALESCE(b.branch_name, 'Unknown Branch') AS branch_name,
          COALESCE(br.brand_name, 'Unknown Brand') AS brand_name,
          COALESCE(rt.type_name, 'Unknown Type') AS renovation_type,
          (
            CASE 
              WHEN t.tender_name ILIKE $2 THEN 1000
              WHEN t.tender_name ILIKE $1 THEN 200
              WHEN t.tender_description ILIKE $1 THEN 10
              WHEN b.branch_name ILIKE $1 THEN 5
              WHEN br.brand_name ILIKE $1 THEN 5
              WHEN rt.type_name ILIKE $1 THEN 5
              ELSE 0
            END
          ) AS score,
          CASE 
            WHEN t.tender_name ILIKE $2 THEN 'tender_name (starts with)'
            WHEN t.tender_name ILIKE $1 THEN 'tender_name'
            WHEN t.tender_description ILIKE $1 THEN 'tender_description'
            WHEN b.branch_name ILIKE $1 THEN 'branch_name'
            WHEN br.brand_name ILIKE $1 THEN 'brand_name'
            WHEN rt.type_name ILIKE $1 THEN 'renovation_type'
          END AS matched_field
       FROM tender t
       LEFT JOIN branch b ON t.branch_id = b.branch_id
       LEFT JOIN brand br ON b.brand_id = br.brand_id
       LEFT JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
       WHERE t.is_deleted = false
         AND (
           t.tender_name ILIKE $1
           OR t.tender_description ILIKE $1
           OR b.branch_name ILIKE $1
           OR br.brand_name ILIKE $1
           OR rt.type_name ILIKE $1
         )
       ORDER BY score DESC, t.tender_name
       LIMIT 15`,
      [contains, prefix]
    );
    tenders = tendersResult.rows.map((t: any) => ({
      id: t.tender_id,
      title: t.tender_name,
      subtitle: `${t.brand_name} – ${t.branch_name} (${t.renovation_type})`,
      link: `/tenders/${t.tender_id}`,
      type: "tender",
      matchedOn: formatMatchLabel(t.matched_field),
    }));
  }

  // ----- BQS with rebalanced scoring -----
  if (type === "all" || type === "bq") {
    let bqQuery = `
      SELECT 
        ts.submission_id,
        ts.bq_name,
        ts.version_name,
        COALESCE(ts.client_name_override, br.brand_name) AS client_name,
        COALESCE(ts.branch_name_override, b.branch_name) AS job_site,
        COALESCE(
          (SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override),
          rt.type_name
        ) AS work_type,
        ts.updated_at,
        -- Scoring: prefix on bq_name is highest
        (
          CASE 
            WHEN ts.bq_name ILIKE $2 THEN 1000
            WHEN ts.version_name ILIKE $2 THEN 500
            WHEN COALESCE(ts.client_name_override, br.brand_name) ILIKE $2 THEN 400
            WHEN ts.bq_name ILIKE $1 THEN 200
            WHEN ts.version_name ILIKE $1 THEN 80
            WHEN COALESCE(ts.client_name_override, br.brand_name) ILIKE $1 THEN 60
            WHEN COALESCE(ts.branch_name_override, b.branch_name) ILIKE $1 THEN 10
            WHEN COALESCE(
              (SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override),
              rt.type_name
            ) ILIKE $1 THEN 10
            ELSE 0
          END
        ) AS score,
        CASE 
          WHEN ts.bq_name ILIKE $2 THEN 'bq_name (starts with)'
          WHEN ts.version_name ILIKE $2 THEN 'version_name (starts with)'
          WHEN COALESCE(ts.client_name_override, br.brand_name) ILIKE $2 THEN 'client_name (starts with)'
          WHEN ts.bq_name ILIKE $1 THEN 'bq_name'
          WHEN ts.version_name ILIKE $1 THEN 'version_name'
          WHEN COALESCE(ts.client_name_override, br.brand_name) ILIKE $1 THEN 'client_name'
          WHEN COALESCE(ts.branch_name_override, b.branch_name) ILIKE $1 THEN 'job_site'
          WHEN COALESCE(
            (SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override),
            rt.type_name
          ) ILIKE $1 THEN 'work_type'
        END AS matched_field
      FROM tender_submission ts
      LEFT JOIN tender t ON ts.tender_id = t.tender_id
      LEFT JOIN branch b ON t.branch_id = b.branch_id
      LEFT JOIN brand br ON b.brand_id = br.brand_id
      LEFT JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
      WHERE (
        ts.bq_name ILIKE $1
        OR ts.version_name ILIKE $1
        OR COALESCE(ts.client_name_override, br.brand_name) ILIKE $1
        OR COALESCE(ts.branch_name_override, b.branch_name) ILIKE $1
        OR COALESCE(
          (SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override),
          rt.type_name
        ) ILIKE $1
      )
    `;
    const params: any[] = [contains, prefix];
    if (userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
      bqQuery += ` AND ts.contractor_id = $3`;
      params.push(userId);
    }
    bqQuery += ` ORDER BY score DESC, ts.updated_at DESC LIMIT 15`;
    const bqsResult = await query(bqQuery, params);
    bqs = bqsResult.rows.map((b: any) => ({
      id: b.submission_id,
      title: b.bq_name || `BQ #${b.submission_id}`,
      subtitle: `${b.client_name} – ${b.job_site} (${b.work_type || 'N/A'})`,
      link: `/bq/${b.submission_id}/view`,
      type: "bq",
      matchedOn: formatMatchLabel(b.matched_field),
    }));
  }

  return NextResponse.json({ tenders, bqs });
}