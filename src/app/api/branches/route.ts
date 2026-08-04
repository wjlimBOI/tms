// app/api/branches/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logInsert, logAuthEvent } from "@/lib/audit";

// ---------- GET (read-only, no audit) ----------
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role_id !== 1) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand_id");

  let sql = `
    SELECT 
      b.branch_id, 
      b.branch_name, 
      b.brand_id, 
      br.brand_name,
      b.operation_status,
      -- Address fields from branch_address
      a.address_id,
      a.full_address,
      a.building_name,
      a.postal_code,
      a.is_primary
    FROM branch b
    JOIN brand br ON b.brand_id = br.brand_id
    LEFT JOIN branch_address a ON b.branch_id = a.branch_id AND a.is_primary = true
    WHERE b.is_deleted = false
  `;
  
  const params: any[] = [];
  if (brandId) {
    sql += ` AND b.brand_id = $1`;
    params.push(parseInt(brandId));
  }
  sql += ` ORDER BY br.brand_name, b.branch_name`;

  const result = await query(sql, params);
  
  // Transform response to include building_name at the root level
  const transformedRows = result.rows.map(row => ({
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    brand_id: row.brand_id,
    brand_name: row.brand_name,
    operation_status: row.operation_status,
    // Expose building_name at the root level for easy access
    building_name: row.building_name || row.branch_name,
    address: row.address_id ? {
      address_id: row.address_id,
      full_address: row.full_address,
      building_name: row.building_name,
      postal_code: row.postal_code,
      is_primary: row.is_primary !== null ? row.is_primary : true
    } : null
  }));

  return NextResponse.json(transformedRows);
}

// ---------- POST (create branch with address) ----------
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role_id !== 1) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, req, {
      action: "create_branch",
      reason: "Unauthorized",
      source: "api"
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { 
    branch_name, 
    brand_id, 
    operation_status,
    address 
  } = body;

  // Validation
  if (!branch_name?.trim()) {
    return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
  }
  if (!brand_id) {
    return NextResponse.json({ error: "Brand ID is required" }, { status: 400 });
  }
  if (!address?.full_address?.trim()) {
    return NextResponse.json({ error: "Full address is required" }, { status: 400 });
  }

  // Verify brand
  const brandCheck = await query(
    `SELECT brand_id FROM brand WHERE brand_id = $1 AND is_deleted = false`,
    [brand_id]
  );
  if (brandCheck.rows.length === 0) {
    return NextResponse.json({ error: "Invalid brand" }, { status: 400 });
  }

  // Start transaction
  const client = await (query as any).getClient();
  
  try {
    await client.query('BEGIN');

    // 1. Insert branch
    const branchResult = await client.query(
      `
      INSERT INTO branch (branch_name, brand_id, operation_status)
      VALUES ($1, $2, $3)
      RETURNING branch_id, branch_name, brand_id, operation_status, created_at, updated_at
      `,
      [
        branch_name.trim(),
        brand_id,
        operation_status || 'Open',
      ]
    );
    
    const newBranch = branchResult.rows[0];

    // 2. Insert branch address
    const addressResult = await client.query(
      `
      INSERT INTO branch_address (
        branch_id,
        full_address,
        building_name,
        postal_code,
        is_primary
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING 
        address_id,
        full_address,
        building_name,
        postal_code,
        is_primary
      `,
      [
        newBranch.branch_id,
        address.full_address.trim(),
        address.building_name?.trim() || null,
        address.postal_code?.trim() || null,
        address.is_primary !== undefined ? address.is_primary : true
      ]
    );

    const newAddress = addressResult.rows[0];

    await client.query('COMMIT');

    // Construct response with building_name at root level
    const response = {
      branch_id: newBranch.branch_id,
      branch_name: newBranch.branch_name,
      brand_id: newBranch.brand_id,
      operation_status: newBranch.operation_status,
      created_at: newBranch.created_at,
      updated_at: newBranch.updated_at,
      building_name: newAddress.building_name || newBranch.branch_name,
      address: {
        address_id: newAddress.address_id,
        full_address: newAddress.full_address,
        building_name: newAddress.building_name,
        postal_code: newAddress.postal_code,
        is_primary: newAddress.is_primary
      }
    };

    // Audit log - log branch creation
    await logInsert(
      "branch",
      newBranch.branch_id,
      newBranch,
      session.user.id,
      req,
      {
        action: "create_branch",
        branch_name: newBranch.branch_name,
        brand_id: newBranch.brand_id,
        source: "api"
      }
    );

    // Audit log - log address creation
    await logInsert(
      "branch_address",
      newAddress.address_id,
      newAddress,
      session.user.id,
      req,
      {
        action: "create_branch_address",
        branch_id: newBranch.branch_id,
        source: "api"
      }
    );

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating branch:', error);
    return NextResponse.json(
      { error: "Failed to create branch" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}