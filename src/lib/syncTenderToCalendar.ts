import { query } from "@/lib/db";

interface TenderData {
  tender_id: number;
  tender_name: string;
  brand_id?: number | null;
  branch_id?: number | null;       // ✅ added branch_id
  created_by?: number | null;
  tender_date?: string | null;
  closing_date?: string | null;
  renovation_start_date?: string | null;
  renovation_end_date?: string | null;
  download_start?: string | null;
  download_end?: string | null;
  briefing_date?: string | null;
  submission_start?: string | null;
  submission_end?: string | null;
}

export async function syncTenderToCalendar(tender: TenderData) {
  try {
    // Delete existing calendar events for this tender
    await query(`DELETE FROM calendar_events WHERE tender_id = $1`, [tender.tender_id]);

    const events: any[] = [];
    const now = new Date().toISOString();

    const addEvent = (title: string, start: string | null | undefined, end: string | null | undefined, allDay: boolean = true) => {
      if (!start) return;
      events.push({
        title,
        start_date: start,
        end_date: end || start,
        all_day: allDay,
        event_type: "milestone",
        description: `Automatically synced from tender "${tender.tender_name}"`,
        brand_id: tender.brand_id || null,
        branch_id: tender.branch_id || null,   // ✅ include branch
        tender_id: tender.tender_id,
        created_by: tender.created_by || null,
      });
    };

    addEvent(`Tender Period: ${tender.tender_name}`, tender.tender_date, tender.closing_date, true);
    addEvent(`Renovation Period: ${tender.tender_name}`, tender.renovation_start_date, tender.renovation_end_date, true);
    addEvent(`Download Period: ${tender.tender_name}`, tender.download_start, tender.download_end, true);
    addEvent(`Briefing: ${tender.tender_name}`, tender.briefing_date, null, true);
    addEvent(`Submission Period: ${tender.tender_name}`, tender.submission_start, tender.submission_end, true);

    for (const ev of events) {
      await query(
        `INSERT INTO calendar_events 
          (title, start_date, end_date, all_day, event_type, description, 
           brand_id, branch_id, tender_id, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          ev.title,
          ev.start_date,
          ev.end_date,
          ev.all_day,
          ev.event_type,
          ev.description,
          ev.brand_id,
          ev.branch_id,
          ev.tender_id,
          ev.created_by,
          now,
          now,
        ]
      );
    }
  } catch (error) {
    console.error("Error syncing tender to calendar:", error);
    // Non‑blocking: do not rethrow
  }
}