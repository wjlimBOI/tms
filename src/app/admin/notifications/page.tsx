"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ROLE_IDS } from "@/lib/roles";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import NotificationDetailModal from "@/components/dashboard/NotificationDetailModal";
import type { DashboardNotification } from "@/types/dashboard";

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<DashboardNotification | null>(null);

  const userRole = (session?.user as any)?.role_id;
  const isContractor = userRole === ROLE_IDS.CONTRACTOR;

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (isContractor) {
      router.push("/tenders");
      return;
    }
    fetchNotifications();
  }, [session, status, router, isContractor]);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = await res.json();
      setNotifications(data?.notifications ?? []);
    } catch (err) {
      console.error(err);
      setError("We couldn't load notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <>
      <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl mx-auto">
          <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
                Notifications
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Recent tender awards and BQ submission activity
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to Dashboard
            </Link>
          </div>

          <Card className="bg-white border-slate-200 shadow-none overflow-hidden p-0 gap-0">
            {error ? (
              <div className="text-center py-12">
                <p className="text-sm text-rose-600 mb-3">{error}</p>
                <Button size="sm" variant="outline" onClick={fetchNotifications}>
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </Button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">No notifications yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((notif) => (
                  <li key={notif.id} className="flex items-start gap-3 px-4 sm:px-6 py-4 hover:bg-slate-50 transition-colors">
                    <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#15406a] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">{notif.message}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}</p>
                    </div>
                    <Button
                      variant="link"
                      size="inline"
                      onClick={() => setSelectedNotification(notif)}
                      className="text-[#15406a] text-sm no-underline hover:underline flex-shrink-0 font-medium"
                    >
                      View
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <NotificationDetailModal notification={selectedNotification} onClose={() => setSelectedNotification(null)} />
    </>
  );
}
