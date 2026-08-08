// app/api/cron/run/route.ts
// Secured entry point for a real, externally-triggered scheduler — replaces
// this app's previous "only runs when a user happens to load a route"
// automation. See docs/pending-migrations.md for the CRON_SECRET/hosting
// note this endpoint depends on.
import { NextRequest, NextResponse } from "next/server";
import {
  applyScheduledTenderTransitions,
  sendDueDlpReminders,
  sendUpcomingSubmissionDeadlineReminders,
} from "@/lib/tenderLifecycle";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    // Fail closed, loudly — an unset secret must never silently open this
    // endpoint to the public internet.
    console.error("CRON_SECRET is not configured — refusing all cron requests.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs: [string, () => Promise<void>][] = [
    ["tender-transitions", applyScheduledTenderTransitions],
    ["dlp-reminders", sendDueDlpReminders],
    ["submission-deadline-reminders", sendUpcomingSubmissionDeadlineReminders],
  ];

  const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  const summary = results.map((r, i) => ({
    job: jobs[i][0],
    ok: r.status === "fulfilled",
    error: r.status === "rejected" ? String(r.reason) : undefined,
  }));
  summary.filter((s) => !s.ok).forEach((s) => console.error(`Cron job "${s.job}" failed:`, s.error));

  return NextResponse.json({ ranAt: new Date().toISOString(), jobs: summary });
}
