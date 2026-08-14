// app/api/branches/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { logUpdate, logDelete, logAuthEvent } from "@/lib/audit";
import { canViewBranches, canManageBranches } from "@/lib/permissions";

// ---------- GET (fetch single branch with address) ----------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const roleIds = (session?.user as any)?.roleIds || [];
  if (!session || !(await canViewBranches(session.user.id, roleIds))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam);

  const sql = `
    SELECT 
      b.branch_id, 
      b.branch_name, 
      b.brand_id, 
      br.brand_name,
      b.operation_status,
      b.created_at,
      b.updated_at,
      -- Address fields from branch_address
      a.address_id,
      a.full_address,
      a.building_name,
      a.postal_code,
      a.is_primary
    FROM branch b
    JOIN brand br ON b.brand_id = br.brand_id
    LEFT JOIN branch_address a ON b.branch_id = a.branch_id AND a.is_primary = true
    WHERE b.branch_id = $1 AND b.is_deleted = false
  `;

  const result = await query(sql, [id]);
  
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const row = result.rows[0];
  
  // Transform response
  const response = {
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    brand_id: row.brand_id,
    brand_name: row.brand_name,
    operation_status: row.operation_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    address: {
      address_id: row.address_id,
      full_address: row.full_address,
      building_name: row.building_name,
      postal_code: row.postal_code,
      is_primary: row.is_primary !== null ? row.is_primary : true
    }
  };

  return NextResponse.json(response);
}

// ---------- PUT (update branch and address) ----------
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const roleIds = (session?.user as any)?.roleIds || [];
  if (!session || !(await canManageBranches(session.user.id, roleIds))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, req, {
      action: "update_branch",
      reason: "Unauthorized",
      source: "api"
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam);
  const body = await req.json();
  const { branch_name, brand_id, operation_status, address } = body;

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
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch old data for audit
    const oldResult = await client.query(
      `SELECT b.branch_id, b.branch_name, b.brand_id, b.operation_status,
              b.created_at, b.updated_at,
              a.address_id, a.full_address, a.building_name, a.postal_code, a.is_primary
       FROM branch b
       LEFT JOIN branch_address a ON b.branch_id = a.branch_id AND a.is_primary = true
       WHERE b.branch_id = $1 AND b.is_deleted = false`,
      [id]
    );
    
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    
    const oldData = oldResult.rows[0];

    // 2. Update branch
    const branchResult = await client.query(
      `
      UPDATE branch
      SET branch_name = $1, brand_id = $2,
          operation_status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE branch_id = $4 AND is_deleted = false
      RETURNING branch_id, branch_name, brand_id, operation_status, created_at, updated_at
      `,
      [
        branch_name.trim(),
        brand_id,
        operation_status || 'Open',
        id,
      ]
    );
    
    if (branchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    
    const newBranch = branchResult.rows[0];

    // 3. Update or insert address
    let addressResult;
    
    if (oldData.address_id) {
      // Update existing address
      addressResult = await client.query(
        `
        UPDATE branch_address
        SET full_address = $1, building_name = $2, postal_code = $3,
            is_primary = $4, updated_at = CURRENT_TIMESTAMP
        WHERE address_id = $5
        RETURNING address_id, full_address, building_name, postal_code, is_primary
        `,
        [
          address.full_address.trim(),
          address.building_name?.trim() || null,
          address.postal_code?.trim() || null,
          address.is_primary !== undefined ? address.is_primary : true,
          oldData.address_id
        ]
      );
    } else {
      // Insert new address
      addressResult = await client.query(
        `
        INSERT INTO branch_address (
          branch_id,
          full_address,
          building_name,
          postal_code,
          is_primary
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING address_id, full_address, building_name, postal_code, is_primary
        `,
        [
          id,
          address.full_address.trim(),
          address.building_name?.trim() || null,
          address.postal_code?.trim() || null,
          address.is_primary !== undefined ? address.is_primary : true
        ]
      );
    }

    const newAddress = addressResult.rows[0];

    await client.query('COMMIT');

    // Construct response
    const response = {
      branch_id: newBranch.branch_id,
      branch_name: newBranch.branch_name,
      brand_id: newBranch.brand_id,
      operation_status: newBranch.operation_status,
      created_at: newBranch.created_at,
      updated_at: newBranch.updated_at,
      address: {
        address_id: newAddress.address_id,
        full_address: newAddress.full_address,
        building_name: newAddress.building_name,
        postal_code: newAddress.postal_code,
        is_primary: newAddress.is_primary
      }
    };

    // Audit log - log branch update
    await logUpdate(
      "branch",
      id,
      {
        branch_id: oldData.branch_id,
        branch_name: oldData.branch_name,
        brand_id: oldData.brand_id,
        operation_status: oldData.operation_status
      },
      newBranch,
      session.user.id,
      req,
      {
        action: "update_branch",
        source: "api"
      }
    );

    // Audit log - log address update
    await logUpdate(
      "branch_address",
      newAddress.address_id,
      {
        address_id: oldData.address_id,
        full_address: oldData.full_address,
        building_name: oldData.building_name,
        postal_code: oldData.postal_code,
        is_primary: oldData.is_primary
      },
      newAddress,
      session.user.id,
      req,
      {
        action: "update_branch_address",
        branch_id: id,
        source: "api"
      }
    );

    return NextResponse.json(response);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating branch:', error);
    return NextResponse.json(
      { error: "Failed to update branch" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// ---------- DELETE (soft delete branch and cascade to address) ----------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const roleIds = (session?.user as any)?.roleIds || [];
  if (!session || !(await canManageBranches(session.user.id, roleIds))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, req, {
      action: "delete_branch",
      reason: "Unauthorized",
      source: "api"
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam);

  // Start transaction
  const client = await getClient();


  try {
    await client.query('BEGIN');

    // 1. Fetch old data for audit (including address)
    const oldResult = await client.query(
      `SELECT b.branch_id, b.branch_name, b.brand_id, b.operation_status,
              a.address_id, a.full_address, a.building_name, a.postal_code, a.is_primary
       FROM branch b
       LEFT JOIN branch_address a ON b.branch_id = a.branch_id AND a.is_primary = true
       WHERE b.branch_id = $1 AND b.is_deleted = false`,
      [id]
    );
    
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: "Branch not found or already deleted" }, { status: 404 });
    }
    
    const oldData = oldResult.rows[0];

    // 2. Soft delete branch
    const branchResult = await client.query(
      `
      UPDATE branch
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
      WHERE branch_id = $1 AND is_deleted = false
      RETURNING branch_id
      `,
      [id]
    );
    
    if (branchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: "Branch not found or already deleted" }, { status: 404 });
    }

    // Note: branch_address will be automatically deleted due to ON DELETE CASCADE
    // But we still want to audit the address deletion
    if (oldData.address_id) {
      // Fetch all addresses for this branch (in case there are multiple)
      const addressResult = await client.query(
        `SELECT address_id, full_address, building_name, postal_code, is_primary
         FROM branch_address
         WHERE branch_id = $1`,
        [id]
      );
      
      // Audit each address deletion
      for (const addr of addressResult.rows) {
        await logDelete(
          "branch_address",
          addr.address_id,
          addr,
          session.user.id,
          req,
          {
            action: "delete_branch_address",
            branch_id: id,
            source: "api"
          }
        );
      }
    }

    await client.query('COMMIT');

    // 3. Audit log - branch deletion
    await logDelete(
      "branch",
      id,
      {
        branch_id: oldData.branch_id,
        branch_name: oldData.branch_name,
        brand_id: oldData.brand_id,
        operation_status: oldData.operation_status
      },
      session.user.id,
      req,
      {
        action: "delete_branch",
        branch_name: oldData.branch_name,
        source: "api"
      }
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting branch:', error);
    return NextResponse.json(
      { error: "Failed to delete branch" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}