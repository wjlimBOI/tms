"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, RefreshCw, Check } from "lucide-react";
import { ROLE_IDS } from "@/lib/roles";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface NotificationItem {
  notification_id: number;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function notificationIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("approved")) return "✅";
  if (t.includes("rejected")) return "⚠️";
  return "🔔";
}

export default function MyNotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

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
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
      setError("We couldn't load your notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n)));
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to mark as read");
    } catch (err) {
      console.error(err);
      setNotifications((prev) => prev.map((n) => (n.notification_id === id ? { ...n, is_read: false } : n)));
    }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);
    const prevState = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) throw new Error("Failed to mark all as read");
    } catch (err) {
      console.error(err);
      setNotifications(prevState);
    } finally {
      setMarkingAll(false);
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

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-3xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
              My Notifications
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={markAllAsRead}
                disabled={markingAll}
                className="border-[#15406a] text-[#15406a] hover:bg-[#15406a] hover:text-white"
              >
                <Check className="w-3.5 h-3.5" />
                {markingAll ? "Marking..." : "Mark all as read"}
              </Button>
            )}
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
              <Button size="sm" variant="outline" onClick={fetchNotifications}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((notif) => (
                <li
                  key={notif.notification_id}
                  className={`flex items-start gap-3 px-4 sm:px-6 py-4 transition-colors ${notif.is_read ? "" : "bg-[#15406a0d]"}`}
                >
                  <span className="text-lg leading-none mt-0.5 flex-shrink-0" aria-hidden="true">
                    {notificationIcon(notif.title)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{notif.title}</p>
                      {!notif.is_read && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#15406a] flex-shrink-0" aria-label="Unread" />
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{notif.body}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {notif.link && (
                      <Link
                        href={notif.link}
                        onClick={() => !notif.is_read && markAsRead(notif.notification_id)}
                        className="text-[#15406a] text-sm hover:underline font-medium"
                      >
                        View
                      </Link>
                    )}
                    {!notif.is_read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(notif.notification_id)}
                        className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
