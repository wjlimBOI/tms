import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Map section titles from Excel to your category names
const sectionToCategory: Record<string, string> = {
  'PRELIMINARY & DEMOLITION WORKS': '1. Preliminary & Demolition Works',
  'AIR-CONDITIONING WORKS': '2. Air‑Conditioning Works',
  'ELECTRICAL WORKS': '3. Electrical Works',
  'PLUMBING WORKS': '4. Plumbing Works',
  'CEILING WORKS': '5. Ceiling Works',
  'PARTITION WORKS': '6. Partition Works',
  'WALL FINISHES & PAINTING WORKS': '7. Wall Finishes & Painting',
  'FLOOR FINISHES': '8. Floor Finishes',
  'JOINERY & CARPENTRY WORKS': '9. Joinery & Carpentry',
  'SIGNAGE WORKS': '10. Signage Works',
  'SHOPFRONT FEATURE': '11. Shopfront Feature',
  'OTHERS': '12. Others',
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const tenderId = parseInt(formData.get('tender_id') as string);
  const bqName = (formData.get('bq_name') as string) || null;

  if (!file || !tenderId) {
    return NextResponse.json({ error: 'Missing file or tender_id' }, { status: 400 });
  }

  // Parse Excel
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets['BQ']; // specific sheet name from your file
  if (!sheet) {
    return NextResponse.json({ error: 'Sheet "BQ" not found' }, { status: 400 });
  }

  // Convert to array of arrays (raw rows)
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rows.length) {
    return NextResponse.json({ error: 'Excel sheet is empty' }, { status: 400 });
  }

  // Find column indices (look for header row)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (row[0] === 'S/NO.' || (row[0] && row[0].toString().trim() === 'S/NO.')) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) {
    return NextResponse.json({ error: 'Could not find header row (S/NO.)' }, { status: 400 });
  }

  // Prepare category mapping from DB
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch existing categories and units
    const catRes = await client.query('SELECT category_name, category_id FROM work_category');
    const catMap = new Map(catRes.rows.map((c: any) => [c.category_name, c.category_id]));

    const unitRes = await client.query('SELECT unit_code, unit_id FROM unit_measure');
    const unitMap = new Map(unitRes.rows.map((u: any) => [u.unit_code, u.unit_id]));

    // Ensure LS, SET, SQFT, MR exist in unitMap (insert if missing)
    const defaultUnits = ['LS', 'SET', 'SQFT', 'MR', 'NO'];
    for (const code of defaultUnits) {
      if (!unitMap.has(code)) {
        const ins = await client.query(
          'INSERT INTO unit_measure (unit_code, unit_name, sort_order) VALUES ($1, $2, 99) ON CONFLICT (unit_code) DO NOTHING RETURNING unit_id',
          [code, code]
        );
        if (ins.rows[0]) unitMap.set(code, ins.rows[0].unit_id);
      }
    }

    // Create submission
    const contractorId = (session.user as any).id;
    const submissionRes = await client.query(
      `INSERT INTO tender_submission
       (tender_id, contractor_id, round_no, status, bq_name, bq_date, created_at, updated_at)
       VALUES ($1, $2, 1, 'Draft', $3, CURRENT_DATE, NOW(), NOW())
       RETURNING submission_id`,
      [tenderId, contractorId, bqName || `BQ_${Date.now()}`]
    );
    const submissionId = submissionRes.rows[0].submission_id;

    // Parse rows after header
    let currentCategoryName: string | null = null;
    let lineItems: any[] = [];
    let sortOrderWithinCategory = 1;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 5) continue;

      const colA = row[0]?.toString().trim() || '';
      const colB = row[1]?.toString().trim() || '';
      const colD = row[3]; // Reference Quantity
      const colF = row[5]; // U/RATE
      const colG = row[6]; // AMOUNT (ignored, we calculate)

      // Detect section header (e.g., "PRELIMINARY & DEMOLITION WORKS")
      // Usually appears in colB, no number in colA
      if (!colA && colB && !colD && !colF) {
        const upperB = colB.toUpperCase();
        if (sectionToCategory[upperB]) {
          currentCategoryName = sectionToCategory[upperB];
          sortOrderWithinCategory = 1;
          continue;
        } else if (upperB.includes('SUBTOTAL') || upperB.includes('NOTE') || upperB === '') {
          // skip subtotal rows and notes
          continue;
        } else {
          // unknown section, skip
          continue;
        }
      }

      // Line item: has number in A and description in B, and quantity/price
      if (colA && /^\d+(\.\d+)?$/.test(colA) && colB && (colD || colF)) {
        if (!currentCategoryName) {
          // skip if no category yet
          continue;
        }
        const categoryId = catMap.get(currentCategoryName);
        if (!categoryId) {
          console.warn(`Unknown category: ${currentCategoryName}`);
          continue;
        }

        let quantity = parseFloat(colD);
        if (isNaN(quantity)) quantity = 0;
        let unitPrice = parseFloat(colF);
        if (isNaN(unitPrice)) unitPrice = 0;

        // Try to infer unit from description (common patterns)
        let unitCode = 'LS'; // default
        if (colB.includes('sets') || colB.includes('set') || colB.includes('pcs')) unitCode = 'SET';
        else if (colB.includes('sqft') || colB.includes('sq.ft')) unitCode = 'SQFT';
        else if (colB.includes('mr') || colB.includes('m.r')) unitCode = 'MR';
        else if (colB.includes('no.')) unitCode = 'NO';
        // If line item has "L.S" in description, use LS
        if (colB.includes('L.S') || colB.includes('LS')) unitCode = 'LS';

        const unitId = unitMap.get(unitCode);
        if (!unitId) continue;

        lineItems.push({
          description: colB,
          quantity,
          unit_price: unitPrice,
          unit_code: unitCode,
          category_id: categoryId,
          sort_order: sortOrderWithinCategory++,
        });
      }
    }

    // Insert line items
    for (const item of lineItems) {
      await client.query(
        `INSERT INTO bq_line_item
         (submission_id, description, quantity, unit_price, unit, category_id, sort_order, level, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW())`,
        [
          submissionId,
          item.description,
          item.quantity,
          item.unit_price,
          item.unit_code,
          item.category_id,
          item.sort_order,
        ]
      );
    }

    // Link categories used
    const usedCategoryIds = [...new Set(lineItems.map(i => i.category_id))];
    for (const catId of usedCategoryIds) {
      await client.query(
        `INSERT INTO submission_category (submission_id, category_id, sort_order)
         VALUES ($1, $2, 0)
         ON CONFLICT (submission_id, category_id) DO NOTHING`,
        [submissionId, catId]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      submission_id: submissionId,
      line_items_count: lineItems.length,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error(err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  } finally {
    client.release();
  }
}