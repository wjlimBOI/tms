"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, RefreshCw } from "lucide-react";
import { getBrandColor } from "@/lib/brandColors";
import { getEventMainTitle, getEventPeriodLabel } from "@/lib/calendarEvent";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EventDetailModal, type CalendarEventDetail } from "@/components/calendar/EventDetailModal";

interface CalendarEvent {
  event_id: number;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  event_type: string | null;
  location: string | null;
  brand_name: string | null;
  tender_name: string | null;
  tender_id?: number | null;
}

export default function UpcomingEventsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openEventDetail = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDetailOpen(true);
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    fetchUpcomingEvents();
  }, [session, status, router]);

  const fetchUpcomingEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const start = format(now, "yyyy-MM-dd");
      const end = format(new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()), "yyyy-MM-dd");
      const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`);
      if (!res.ok) throw new Error("Failed to fetch upcoming events");
      const data = await res.json();
      const nowStr = format(now, "yyyy-MM-dd");
      const upcoming = (data as CalendarEvent[])
        .filter((e) => e.start_date >= nowStr)
        .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
      setEvents(upcoming);
    } catch (err) {
      console.error(err);
      setError("We couldn't load upcoming events. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading upcoming events...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
              Upcoming Events
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Scheduled milestones for the next 6 months, soonest first
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/calendar"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-[#15406a] text-[#15406a] bg-white hover:bg-[#15406a] hover:text-white transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
              Full Calendar
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to Dashboard
            </Link>
          </div>
        </div>

        <Card className="bg-white border-slate-200 shadow-none overflow-hidden p-0 gap-0">
          {error ? (
            <div className="text-center py-12">
              <p className="text-sm text-rose-600 mb-3">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchUpcomingEvents}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No upcoming events.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <caption className="sr-only">Upcoming calendar events, soonest first</caption>
                <thead className="bg-slate-50/80">
                  <tr>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Event</th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {events.map((event) => {
                    const { borderColor } = getBrandColor(event.brand_name || "");
                    const mainTitle = getEventMainTitle(event.title, event.tender_name);
                    const periodLabel = getEventPeriodLabel(event.title, event.tender_name);
                    return (
                      <tr
                        key={event.event_id}
                        tabIndex={0}
                        role="button"
                        aria-label={`View details for ${mainTitle}`}
                        onClick={() => openEventDetail(event)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openEventDetail(event);
                          }
                        }}
                        className="cursor-pointer hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#15406a] transition-colors"
                        style={{ boxShadow: `inset 4px 0 0 0 ${borderColor}` }}
                      >
                        <td className="px-4 sm:px-6 py-3 text-sm text-slate-900">
                          <div className="font-medium">{mainTitle}</div>
                          {periodLabel && (
                            <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs" title={periodLabel}>
                              {periodLabel}
                            </div>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-center text-slate-700 whitespace-nowrap">
                          {formatDate(event.start_date)}
                          {event.end_date && event.end_date.slice(0, 10) !== event.start_date.slice(0, 10) && (
                            <span className="text-slate-400"> – {formatDate(event.end_date)}</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-center text-slate-500">
                          {event.location || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <EventDetailModal
        event={selectedEvent as CalendarEventDetail | null}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
