// Shared dashboard types used by both the stats API route
// (src/app/api/dashboard/stats/route.ts) and the dashboard page
// (src/app/dashboard/page.tsx). Kept in one place so the two stay
// in sync instead of drifting.

export interface DashboardNotification {
  id: string;
  type: "awarded" | "submitted";
  message: string;
  created_at: string;
  link: string;
  tender_name: string;
  contractor_name: string;
  contract_value?: number;
}

export interface AwardedTenderItem {
  tender_id: number;
  tender_name: string;
  contractor_name: string;
  contract_value: number;
  awarded_date: string;
  brand_name?: string;
}
