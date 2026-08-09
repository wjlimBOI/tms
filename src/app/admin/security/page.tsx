"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableItem } from "@/components/ui/SortableItem";
import { format } from "date-fns";
import { Lock, Clock, GitBranch, Mail } from "lucide-react";
import { useNotify } from "@/components/ui/notification-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// ============================================================
// Types & Shared Helpers
// ============================================================
interface Role {
  role_id: number;
  role_name: string;
}

interface StepDefinition {
  id: string;
  role_id: number;
  role_name?: string;
  deadline_hours?: number | null;
}

interface Permission {
  permission_id: number;
  permission_code: string;
  permission_name: string;
  module: string;
}

interface AccessWindow {
  role_id: number;
  resource_type: string;
  can_view_from: string | null;
  can_view_until: string | null;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any>;
  ip_address: string;
}

interface Notification {
  notification_id: number;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function notificationIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("approved")) return "✓";
  if (t.includes("rejected")) return "⚠️";
  return "ℹ️";
}

const roleDisplayNames: Record<string, string> = {
  Admin: "Admin",
  "Executive Director": "Executive Director",
  "Chief Executive Officer": "Chief Executive Officer (CEO)",
  "Senior Chief Operating Officer": "Senior Chief Operating Officer (SCOO)",
  "Chief Operating Officer": "Chief Operating Officer (COO)",
  "Facilities Management Regional Director": "Facilities Management Regional Director",
  "Facilities Management Deputy General Manager": "Facilities Management Deputy General Manager (FM DGM)",
  "Project Manager": "Project Manager",
  "Finance Manager": "Finance Manager",
  "Finance General Manager": "Finance General Manager",
  "Finance Team": "Finance Team",
  "Internal Audit Team": "Internal Audit Team",
  "Legal Team": "Legal Team",
  "Renovation Team": "Renovation Team",
  "Maintenance Team": "Maintenance Team",
  Contractor: "Contractor",
};

const rolePriority: Record<string, number> = {
  "Executive Director": 1,
  "Chief Executive Officer (CEO)": 2,
  "Senior Chief Operating Officer (SCOO)": 3,
  "Chief Operating Officer (COO)": 4,
  "Facilities Management Regional Director": 5,
  "Facilities Management Deputy General Manager (FM DGM)": 6,
  "Project Manager": 7,
  "Finance Manager": 8,
  "Finance General Manager": 9,
  "Finance Team": 10,
  "Internal Audit Team": 11,
  "Legal Team": 12,
  "Renovation Team": 13,
  "Maintenance Team": 14,
  Admin: 100,
  Contractor: 101,
};

function getRoleDisplayName(rawName: string): string {
  return roleDisplayNames[rawName] || rawName;
}

function sortRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => {
    const displayA = getRoleDisplayName(a.role_name);
    const displayB = getRoleDisplayName(b.role_name);
    const priorityA = rolePriority[displayA] ?? 999;
    const priorityB = rolePriority[displayB] ?? 999;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return displayA.localeCompare(displayB);
  });
}

// ============================================================
// Tender Timings Component (with refresh fix)
// ============================================================
function TenderTimings({ userPermissions, isAdmin }: { userPermissions: string[]; isAdmin: boolean }) {
  const toast = useNotify();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [timings, setTimings] = useState({
    default_tender_start: "",
    default_download_start: "",
    default_closing_time: "",
    default_submission_start: "",
    default_submission_end: "",
  });

  const hasPermission = isAdmin || userPermissions.includes("manage_tender_timings");

  const fetchTimings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tender-timings?t=${Date.now()}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("API endpoint not found. Please check that the route exists at /api/admin/tender-timings.");
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load default timings");
      }
      const data = await res.json();
      setTimings({
        default_tender_start: data.default_tender_start || "",
        default_download_start: data.default_download_start || "",
        default_closing_time: data.default_closing_time || "",
        default_submission_start: data.default_submission_start || "",
        default_submission_end: data.default_submission_end || "",
      });
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
      console.error("Fetch timings error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission) {
      fetchTimings();
    } else {
      setLoading(false);
    }
  }, [hasPermission, refreshKey]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTimings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tender-timings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(timings),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save timings");
      }
      toast.success("Tender timings updated successfully");
      setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      setError(err.message);
      toast.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!hasPermission) {
    return (
      <div className="p-6 text-center text-red-600">
        <p className="text-lg font-semibold">Access Denied</p>
        <p className="text-sm">You do not have the required permission to manage default tender timings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-slate-500">Loading default timings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchTimings}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasAnyTiming = Object.values(timings).some((v) => v !== "");

  return (
    <div className="backdrop-blur-sm bg-white/40 rounded-2xl border border-white/20 shadow-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Tender Timings
        </h2>
        <button
          onClick={fetchTimings}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        These default times are applied to all new tenders. The dates are set per tender, but the times are locked globally.
        Changing these defaults will only affect <strong>new</strong> tenders; existing tenders are unchanged.
      </p>

      {!hasAnyTiming && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          No default timings have been set yet. Use the form below to set the default times.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tender Start Time
          </label>
          <input
            type="time"
            name="default_tender_start"
            value={timings.default_tender_start}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">The default time when the tender period begins.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Download Start Time
          </label>
          <input
            type="time"
            name="default_download_start"
            value={timings.default_download_start}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">The default time when contractors can start downloading documents.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tender Closing Time
          </label>
          <input
            type="time"
            name="default_closing_time"
            value={timings.default_closing_time}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">The default time of the deadline for tender submissions.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Submission Start Time
          </label>
          <input
            type="time"
            name="default_submission_start"
            value={timings.default_submission_start}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">The default time when the submission window opens.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Submission End Time
          </label>
          <input
            type="time"
            name="default_submission_end"
            value={timings.default_submission_end}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">The default time when the submission window closes.</p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Timings"}
          </button>
        </div>
      </form>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <Clock className="w-4 h-4 inline mr-2" />
        <span>
          <strong>Note:</strong> These times are applied to the corresponding date fields when a new tender is created.
          The actual dates (day, month, year) can be set per tender; only the times are fixed by these defaults.
        </span>
      </div>
    </div>
  );
}

// ============================================================
// CC Recipients Settings
// ============================================================
function CCSettings() {
  const toast = useNotify();
  const [roles, setRoles] = useState<Role[]>([]);
  const [ccRoleIds, setCcRoleIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const rolesRes = await fetch("/api/admin/roles");
      if (!rolesRes.ok) throw new Error("Failed to fetch roles");
      const rolesData = await rolesRes.json();
      setRoles(sortRoles(rolesData));

      const ccRes = await fetch("/api/admin/cc-settings");
      if (!ccRes.ok) throw new Error("Failed to fetch CC settings");
      const ccData = await ccRes.json();
      setCcRoleIds(ccData.role_ids || []);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleRole = (roleId: number) => {
    setCcRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cc-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_ids: ccRoleIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save CC settings");
      }
      toast.success("CC recipients updated successfully");
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-slate-500">Loading CC settings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-sm bg-white/40 rounded-2xl border border-white/20 shadow-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">CC Recipients</h2>
        <button
          onClick={fetchData}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Select which roles should receive <strong>CC notifications</strong> for tender events (e.g., new tender creation, extension requests, approvals, etc.).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2 px-3 font-semibold text-slate-600">Role</th>
              <th className="py-2 px-3 font-semibold text-slate-600 text-center">Receive CC</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.role_id} className="border-b border-slate-100">
                <td className="py-2 px-3 font-medium text-slate-800">
                  {getRoleDisplayName(role.role_name)}
                </td>
                <td className="py-2 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={ccRoleIds.includes(role.role_id)}
                    onChange={() => toggleRole(role.role_id)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save CC Settings"}
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <Mail className="w-4 h-4 inline mr-2" />
        <span>
          <strong>Note:</strong> CC recipients will receive a copy of all relevant tender notifications. This is separate from the approver list for extensions.
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Notification Email Settings
// ============================================================
const RECOMMENDED_ALWAYS_ON = new Set(["password_reset", "login_alert"]);

interface NotificationEventSetting {
  event_type: string;
  label: string;
  email_enabled: boolean;
}

function NotificationEmailSettings() {
  const toast = useNotify();
  const [settings, setSettings] = useState<NotificationEventSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/notification-settings");
      if (!res.ok) throw new Error("Failed to fetch notification settings");
      const data = await res.json();
      setSettings(data.settings || []);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggle = async (eventType: string, nextEnabled: boolean) => {
    const previous = settings;
    setSettings((prev) =>
      prev.map((s) => (s.event_type === eventType ? { ...s, email_enabled: nextEnabled } : s))
    );
    setSavingType(eventType);
    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: eventType, email_enabled: nextEnabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update notification setting");
      }
      toast.success(`${nextEnabled ? "Enabled" : "Disabled"} email for this event`);
    } catch (err: any) {
      setSettings(previous);
      toast.error(err.message);
    } finally {
      setSavingType(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-slate-500">Loading notification settings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-sm bg-white/40 rounded-2xl border border-white/20 shadow-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Email Notifications</h2>
        <button
          onClick={fetchData}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Turn individual event emails on or off. The in-app notification bell always stays on for every event —
        this only controls whether an email is also sent. Changes take effect immediately.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2 px-3 font-semibold text-slate-600">Event</th>
              <th className="py-2 px-3 font-semibold text-slate-600 text-center">Send Email</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.event_type} className="border-b border-slate-100">
                <td className="py-2 px-3 font-medium text-slate-800">
                  {s.label}
                  {RECOMMENDED_ALWAYS_ON.has(s.event_type) && (
                    <span className="ml-2 text-xs font-normal text-amber-600">(recommended: keep enabled)</span>
                  )}
                </td>
                <td className="py-2 px-3 text-center">
                  <label className="inline-flex items-center justify-center w-11 h-11 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.email_enabled}
                      disabled={savingType === s.event_type}
                      onChange={() => toggle(s.event_type, !s.email_enabled)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      aria-label={`Toggle email for ${s.label}`}
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <Mail className="w-4 h-4 inline mr-2" />
        <span>
          <strong>Note:</strong> Disabling an event here only stops the email — recipients still see the
          in-app notification bell alert.
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Main Security Dashboard
// ============================================================
export default function SecurityDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "notifications" | "config" | "permissions" | "timelock" | "audit" | "tender-settings"
  >("notifications");
  const [activeSubTab, setActiveSubTab] = useState<"timings" | "cc" | "email">("timings");
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    const userRole = (session.user as any)?.role_id;
    if (userRole === 1) setIsAdmin(true);

    const fetchPermissions = async () => {
      try {
        const res = await fetch("/api/user/permissions");
        if (res.ok) {
          const data = await res.json();
          setUserPermissions(data.permissions || []);
        } else {
          setUserPermissions([]);
        }
      } catch (e) {
        console.error(e);
        setUserPermissions([]);
      }
    };
    fetchPermissions();

    fetchRoles();
    setLoading(false);
  }, [session, status, router]);

  const fetchRoles = async () => {
    try {
      const res = await fetch("/api/admin/roles");
      const data = await res.json();
      setRoles(sortRoles(data));
    } catch (err) {
      console.error(err);
    }
  };

  const canViewTimings = isAdmin || userPermissions.includes("manage_tender_timings");

  if (loading || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center animate-pulse">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading security portal…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 backdrop-blur-sm bg-white/30 rounded-2xl p-6 border border-white/20 shadow-xl">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            Security Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Access controls, time‑locked workflows, audit trails, and tender settings
          </p>
        </div>

        <div className="border-b border-gray-200 mb-8 overflow-x-auto">
          <nav className="-mb-px flex space-x-8">
            <TabButton active={activeTab === "notifications"} onClick={() => setActiveTab("notifications")} label="Notifications" />
            {isAdmin && (
              <>
                <TabButton active={activeTab === "config"} onClick={() => setActiveTab("config")} label="Workflow Config" />
                <TabButton active={activeTab === "permissions"} onClick={() => setActiveTab("permissions")} label="Role Permissions" />
                <TabButton active={activeTab === "timelock"} onClick={() => setActiveTab("timelock")} label="Time-Locked Access" />
                <TabButton active={activeTab === "audit"} onClick={() => setActiveTab("audit")} label="Audit Logs" />
                <TabButton active={activeTab === "tender-settings"} onClick={() => setActiveTab("tender-settings")} label="Tender Settings" />
              </>
            )}
          </nav>
        </div>

        <div className="transition-all duration-500 ease-out">
          {activeTab === "notifications" && <Notifications />}
          {activeTab === "config" && isAdmin && <WorkflowConfig roles={roles} />}
          {activeTab === "permissions" && isAdmin && <RolePermissions roles={roles} userPermissions={userPermissions} />}
          {activeTab === "timelock" && isAdmin && <TimeLockedAccess roles={roles} />}
          {activeTab === "audit" && isAdmin && <AuditLogs />}
          {activeTab === "tender-settings" && isAdmin && (
            <>
              <div className="flex border-b border-gray-200 mb-6">
                {canViewTimings && (
                  <SubTabButton
                    active={activeSubTab === "timings"}
                    onClick={() => setActiveSubTab("timings")}
                    label="Default Timings"
                  />
                )}
                <SubTabButton
                  active={activeSubTab === "cc"}
                  onClick={() => setActiveSubTab("cc")}
                  label="CC Recipients"
                />
                <SubTabButton
                  active={activeSubTab === "email"}
                  onClick={() => setActiveSubTab("email")}
                  label="Email Notifications"
                />
              </div>

              {activeSubTab === "timings" && canViewTimings && <TenderTimings userPermissions={userPermissions} isAdmin={isAdmin} />}
              {activeSubTab === "cc" && <CCSettings />}
              {activeSubTab === "email" && <NotificationEmailSettings />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helper Components (TabButton, SubTabButton)
// ============================================================
function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-4 px-1 font-medium text-sm transition-all duration-300 whitespace-nowrap ${
        active
          ? "text-blue-600"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full animate-slide-in" />
      )}
    </button>
  );
}

function SubTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-3 px-1 text-sm font-medium transition-all duration-300 ${
        active
          ? "text-blue-600 border-b-2 border-blue-600"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

// ============================================================
// Notifications Component (full implementation)
// ============================================================
function Notifications() {
  const toast = useNotify();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAsRead = (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n))
    );
    fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch((err) => console.error(err));
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
      toast.success("All notifications marked as read");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't reach the server. Your notifications may not have been marked as read — try again.");
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) markAsRead(notification.notification_id);
    if (notification.link) router.push(notification.link);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="backdrop-blur-sm bg-white/40 rounded-2xl border border-white/20 shadow-md">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-800">Notifications</h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-blue-600 text-white">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-600 hover:text-blue-700 transition"
          >
            Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading notifications…
        </div>
      ) : error ? (
        <div className="p-8 text-center">
          <p className="text-gray-500 mb-3">Couldn't load notifications. Please check your connection and try again.</p>
          <button
            onClick={fetchNotifications}
            className="text-sm text-blue-600 hover:text-blue-700 transition font-medium"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No notifications. You're all caught up!
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.notification_id}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full text-left p-5 transition-all duration-200 hover:bg-white/30 ${
                  !notification.is_read ? "bg-white/20" : ""
                }`}
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg bg-blue-100 text-blue-800 border border-blue-200">
                    {notificationIcon(notification.title)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {notification.title}
                        {!notification.is_read && <span className="sr-only"> (unread)</span>}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {format(new Date(notification.created_at), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{notification.body}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Workflow Configuration (full implementation)
// ============================================================
function WorkflowConfig({ roles }: { roles: Role[] }) {
  const toast = useNotify();
  type ResourceType = "bq_submission" | "tender_creation" | "tender_submission";

  const resourceConfig: Record<ResourceType, { label: string; description: string }> = {
    bq_submission: {
      label: "BQ Submission",
      description: "Define sequential acknowledgment steps and time limits for BQ submission.",
    },
    tender_creation: {
      label: "Tender Creation",
      description: "Define sequential acknowledgment steps and time limits for tender creation.",
    },
    tender_submission: {
      label: "Tender Submission",
      description: "Define sequential acknowledgment steps and time limits for tender submission.",
    },
  };

  const [activeResource, setActiveResource] = useState<ResourceType>("bq_submission");
  const [stepsMap, setStepsMap] = useState<Record<ResourceType, StepDefinition[]>>({
    bq_submission: [],
    tender_creation: [],
    tender_submission: [],
  });
  const [tempStepsMap, setTempStepsMap] = useState<Record<ResourceType, StepDefinition[]>>({
    bq_submission: [],
    tender_creation: [],
    tender_submission: [],
  });
  const [editingMap, setEditingMap] = useState<Record<ResourceType, boolean>>({
    bq_submission: false,
    tender_creation: false,
    tender_submission: false,
  });
  const [loadingMap, setLoadingMap] = useState<Record<ResourceType, boolean>>({
    bq_submission: true,
    tender_creation: true,
    tender_submission: true,
  });
  const [savingMap, setSavingMap] = useState<Record<ResourceType, boolean>>({
    bq_submission: false,
    tender_creation: false,
    tender_submission: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchChain("bq_submission");
    fetchChain("tender_creation");
    fetchChain("tender_submission");
  }, []);

  const fetchChain = async (resourceType: ResourceType) => {
    setLoadingMap((prev) => ({ ...prev, [resourceType]: true }));
    try {
      const res = await fetch(`/api/admin/approval-chains?resource_type=${resourceType}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const steps = (Array.isArray(data) ? data : [])
        .filter((row: any) => row.resource_type === resourceType)
        .sort((a: any, b: any) => a.step_order - b.step_order)
        .map((row: any, idx: number) => ({
          id: `step-${idx}`,
          role_id: row.role_id,
          role_name: row.role_name,
          deadline_hours: row.deadline_hours || null,
        }));
      setStepsMap((prev) => ({ ...prev, [resourceType]: steps }));
      setTempStepsMap((prev) => ({ ...prev, [resourceType]: steps }));
    } catch (err) {
      console.error(`Failed to fetch ${resourceType} chain:`, err);
      toast.error(`Failed to load ${resourceType} workflow`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [resourceType]: false }));
    }
  };

  const startEdit = (resourceType: ResourceType) => {
    const currentSteps = stepsMap[resourceType];
    setTempStepsMap((prev) => ({
      ...prev,
      [resourceType]: currentSteps.map((s, i) => ({ ...s, id: `step-${i}` })),
    }));
    setEditingMap((prev) => ({ ...prev, [resourceType]: true }));
  };

  const cancelEdit = (resourceType: ResourceType) => {
    setTempStepsMap((prev) => ({ ...prev, [resourceType]: stepsMap[resourceType] }));
    setEditingMap((prev) => ({ ...prev, [resourceType]: false }));
  };

  const addStep = (resourceType: ResourceType) => {
    const currentTemp = tempStepsMap[resourceType];
    const newId = `step-${currentTemp.length}`;
    setTempStepsMap((prev) => ({
      ...prev,
      [resourceType]: [
        ...currentTemp,
        {
          id: newId,
          role_id: roles[0]?.role_id || 0,
          deadline_hours: 48,
        },
      ],
    }));
  };

  const removeStep = (resourceType: ResourceType, index: number) => {
    const newSteps = [...tempStepsMap[resourceType]];
    newSteps.splice(index, 1);
    setTempStepsMap((prev) => ({
      ...prev,
      [resourceType]: newSteps.map((step, i) => ({ ...step, id: `step-${i}` })),
    }));
  };

  const updateStep = (
    resourceType: ResourceType,
    index: number,
    field: keyof StepDefinition,
    value: any
  ) => {
    setTempStepsMap((prev) => {
      const newSteps = [...prev[resourceType]];
      const step = newSteps[index];
      if (field === "role_id") {
        step.role_id = Number(value);
      } else if (field === "deadline_hours") {
        step.deadline_hours = value ? Number(value) : null;
      }
      return { ...prev, [resourceType]: newSteps };
    });
  };

  const handleDragEnd = (resourceType: ResourceType, event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const current = tempStepsMap[resourceType];
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const newIndex = current.findIndex((item) => item.id === over?.id);
      setTempStepsMap((prev) => ({
        ...prev,
        [resourceType]: arrayMove(current, oldIndex, newIndex),
      }));
    }
  };

  const saveChain = async (resourceType: ResourceType) => {
    setSavingMap((prev) => ({ ...prev, [resourceType]: true }));
    const stepsForDb = tempStepsMap[resourceType].map((step, idx) => ({
      role_id: step.role_id,
      step_order: idx + 1,
      deadline_hours: step.deadline_hours || null,
    }));
    try {
      const res = await fetch("/api/admin/approval-chains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_type: resourceType, steps: stepsForDb }),
      });
      if (res.ok) {
        setEditingMap((prev) => ({ ...prev, [resourceType]: false }));
        await fetchChain(resourceType);
        toast.success(`${resourceConfig[resourceType].label} workflow saved`);
      } else {
        const err = await res.json();
        toast.error(err.error || `Failed to save ${resourceConfig[resourceType].label} workflow`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error");
    } finally {
      setSavingMap((prev) => ({ ...prev, [resourceType]: false }));
    }
  };

  const sortedRoles = sortRoles(roles);
  const currentSteps = tempStepsMap[activeResource];
  const isEditing = editingMap[activeResource];
  const isSaving = savingMap[activeResource];
  const isLoading = loadingMap[activeResource];

  return (
    <div className="backdrop-blur-sm bg-white/40 rounded-2xl border border-white/20 shadow-xl">
      <div className="border-b border-white/20 px-6 pt-4">
        <div className="flex space-x-6 overflow-x-auto">
          {Object.entries(resourceConfig).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setActiveResource(key as ResourceType)}
              className={`relative pb-3 px-1 text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                activeResource === key
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {config.label}
              {activeResource === key && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full animate-slide-in" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">
              {resourceConfig[activeResource].label} – Acknowledgment Steps
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {resourceConfig[activeResource].description}
            </p>
          </div>
          {!isEditing && (
            <button
              onClick={() => startEdit(activeResource)}
              disabled={isLoading}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg text-sm font-medium transition-all"
            >
              Edit Workflow
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded-lg" />
            ))}
          </div>
        ) : !isEditing ? (
          <div className="divide-y divide-gray-200 rounded-xl overflow-hidden">
            {currentSteps.length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-white/30 rounded-xl">
                No acknowledgment steps defined. Click "Edit Workflow" to create one.
              </div>
            ) : (
              currentSteps.map((step, idx) => (
                <div
                  key={idx}
                  className="p-4 flex flex-wrap items-center gap-3 bg-white/30 backdrop-blur-sm hover:bg-white/50 transition"
                >
                  <span className="font-mono text-gray-400 w-8">#{idx + 1}</span>
                  <span className="font-medium text-gray-800 w-48">
                    {getRoleDisplayName(step.role_name || "Unknown role")}
                  </span>
                  {step.deadline_hours && (
                    <span className="text-xs text-amber-600">
                      ⏱️ Must complete within {step.deadline_hours}h
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleDragEnd(activeResource, event)}
            >
              <SortableContext items={currentSteps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {currentSteps.map((step, idx) => (
                    <SortableItem key={step.id} id={step.id}>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3 shadow-sm">
                        <div className="cursor-move text-gray-400">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                        </div>
                        <span className="font-mono text-gray-400 w-8">#{idx + 1}</span>
                        <select
                          value={step.role_id}
                          onChange={(e) => updateStep(activeResource, idx, "role_id", e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
                        >
                          {sortedRoles.map((role) => (
                            <option key={role.role_id} value={role.role_id}>
                              {getRoleDisplayName(role.role_name)}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Deadline (hours):</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={step.deadline_hours || ""}
                            onChange={(e) =>
                              updateStep(activeResource, idx, "deadline_hours", e.target.value)
                            }
                            className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
                            placeholder="Optional"
                          />
                        </div>
                        <button
                          onClick={() => removeStep(activeResource, idx)}
                          className="text-red-500 hover:text-red-700 ml-auto"
                        >
                          Remove
                        </button>
                      </div>
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => addStep(activeResource)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
              >
                + Add Step
              </button>
              <button
                onClick={() => saveChain(activeResource)}
                disabled={isSaving}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Workflow"}
              </button>
              <button
                onClick={() => cancelEdit(activeResource)}
                className="px-4 py-2 bg-gray-300 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 text-sm text-gray-500 border-t bg-white/20 rounded-b-2xl flex items-center gap-2">
        <GitBranch className="w-4 h-4" />
        <span>
          Define the sequence of acknowledgment steps (e.g., who must approve in which order). For each step, you can optionally set a time limit (in hours). If a step exceeds its deadline, the workflow may be escalated or cancelled.
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Role Permissions – single table with integrated Extension Approver
// ============================================================
function RolePermissions({ roles, userPermissions }: { roles: Role[]; userPermissions: string[] }) {
  const toast = useNotify();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missingBudgetCalc, setMissingBudgetCalc] = useState(false);
  const [missingTimings, setMissingTimings] = useState(false);

  // Extension approver state: role_id -> { id, is_approver } | null
  const [extensionData, setExtensionData] = useState<Record<number, { id: number; is_approver: boolean }>>({});
  const [extensionLoading, setExtensionLoading] = useState(true);
  const [extensionSaving, setExtensionSaving] = useState<Record<number, boolean>>({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [newPermName, setNewPermName] = useState("");
  const [newPermModule, setNewPermModule] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const modules = [
    "Tender Management",
    "Finance",
    "Admin",
    "Analytics",
    "Project Management",
    "User Management",
    "Reports",
    "Settings",
  ];

  useEffect(() => {
    fetchPermissionsAndMappings();
    fetchExtensionSettings();
  }, []);

  const fetchPermissionsAndMappings = async () => {
    try {
      const [permsRes, rpRes] = await Promise.all([
        fetch("/api/admin/permissions").then((r) => r.json()),
        fetch("/api/admin/role-permissions").then((r) => r.json()),
      ]);
      let perms = Array.isArray(permsRes) ? permsRes : [];

      // Check for Budget Calculator – use both code and name
      const hasBudgetCalc = perms.some(
        (p) =>
          p &&
          (
            p.permission_code === "budget_calculator" ||
            p.permission_name?.toLowerCase() === "budget calculator" ||
            p.permission_name?.toLowerCase() === "capex planner"
          )
      );
      if (!hasBudgetCalc) {
        setMissingBudgetCalc(true);
        perms = [
          ...perms,
          {
            permission_id: -1,
            permission_code: "budget_calculator",
            permission_name: "Budget Calculator",
            module: "Analytics",
          },
        ];
      }

      const hasTimings = perms.some(
        (p) =>
          p &&
          p.permission_name &&
          (p.permission_name.toLowerCase() === "manage tender timings" ||
            p.permission_code === "manage_tender_timings")
      );
      if (!hasTimings) {
        setMissingTimings(true);
        perms = [
          ...perms,
          {
            permission_id: -2,
            permission_code: "manage_tender_timings",
            permission_name: "Manage Tender Timings",
            module: "Tender Management",
          },
        ];
      }

      setPermissions(perms);
      setRolePerms(rpRes || {});
    } catch (err) {
      console.error(err);
      toast.error("Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  const fetchExtensionSettings = async () => {
    setExtensionLoading(true);
    try {
      const res = await fetch("/api/admin/extension-settings");
      if (!res.ok) throw new Error("Failed to load extension settings");
      const data = await res.json();
      const map: Record<number, { id: number; is_approver: boolean }> = {};
      data.forEach((item: any) => {
        map[item.role_id] = { id: item.id, is_approver: item.is_approver };
      });
      setExtensionData(map);
    } catch (err: any) {
      toast.error("Failed to load extension settings");
      console.error(err);
    } finally {
      setExtensionLoading(false);
    }
  };

  // Toggle extension approver – auto‑create if missing
  const toggleExtensionApprover = async (roleId: number) => {
    const current = extensionData[roleId];
    const newValue = current ? !current.is_approver : true;

    // Optimistic update
    if (current) {
      setExtensionData((prev) => ({
        ...prev,
        [roleId]: { ...prev[roleId], is_approver: newValue },
      }));
    } else {
      setExtensionData((prev) => ({
        ...prev,
        [roleId]: { id: -1, is_approver: newValue }, // temporary
      }));
    }
    setExtensionSaving((prev) => ({ ...prev, [roleId]: true }));

    try {
      let response;
      if (current) {
        // Update existing
        response = await fetch(`/api/admin/extension-settings/${current.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_approver: newValue }),
        });
      } else {
        // Create new setting
        response = await fetch("/api/admin/extension-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role_id: roleId, is_approver: newValue }),
        });
      }
      if (!response.ok) throw new Error("Failed to update");
      toast.success("Extension approver updated");
      await fetchExtensionSettings(); // re-sync
    } catch (err: any) {
      // Rollback
      if (current) {
        setExtensionData((prev) => ({
          ...prev,
          [roleId]: { ...prev[roleId], is_approver: !newValue },
        }));
      } else {
        setExtensionData((prev) => {
          const { [roleId]: _, ...rest } = prev;
          return rest;
        });
      }
      toast.error(`Error: ${err.message}`);
    } finally {
      setExtensionSaving((prev) => ({ ...prev, [roleId]: false }));
    }
  };

  const togglePermission = (roleId: number, permId: number) => {
    if (permId < 0) return;
    setRolePerms((prev) => {
      const current = prev[roleId] || [];
      const newPerms = current.includes(permId)
        ? current.filter((id) => id !== permId)
        : [...current, permId];
      return { ...prev, [roleId]: newPerms };
    });
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      for (const role of roles) {
        const permIds = rolePerms[role.role_id] || [];
        const filteredPermIds = permIds.filter((id) => id > 0);
        await fetch("/api/admin/role-permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role_id: role.role_id, permission_ids: filteredPermIds }),
        });
      }
      toast.success("Permissions saved successfully");
      if (missingBudgetCalc || missingTimings) {
        fetchPermissionsAndMappings();
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const generateCode = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  };

  const handleAddPermission = async () => {
    setAddError(null);
    if (!newPermName.trim() || !newPermModule) {
      setAddError("Please enter a name and select a module.");
      toast.warning("Please enter a name and select a module.");
      return;
    }

    const baseCode = generateCode(newPermName);
    let finalCode = baseCode;
    let suffix = 1;
    while (permissions.some((p) => p.permission_code === finalCode)) {
      finalCode = `${baseCode}_${suffix}`;
      suffix++;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permission_name: newPermName.trim(),
          permission_code: finalCode,
          module: newPermModule,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create permission");
      }
      toast.success("Permission created successfully");
      await fetchPermissionsAndMappings();
      setShowAddModal(false);
      setNewPermName("");
      setNewPermModule("");
    } catch (err: any) {
      setAddError(err.message);
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  if (loading || extensionLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-white/50 rounded-lg w-1/3" />
        <div className="h-64 bg-white/50 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">Role Permissions</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
          >
            + Add Permission
          </button>
        </div>

        {/* SINGLE TABLE – integrated Extension Approver column */}
        <div className="backdrop-blur-sm bg-white/40 rounded-xl border border-white/20 shadow-md overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                {permissions.map((perm) => (
                  <th
                    key={perm.permission_id}
                    className="px-4 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {perm.permission_name}
                  </th>
                ))}
                <th className="px-4 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Extension Approver
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {roles.map((role) => (
                <tr
                  key={role.role_id}
                  className="hover:bg-white/50 transition-colors duration-150"
                >
                  <td className="px-6 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                    {getRoleDisplayName(role.role_name)}
                  </td>
                  {permissions.map((perm) => (
                    <td key={perm.permission_id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={(rolePerms[role.role_id] || []).includes(perm.permission_id)}
                        onChange={() => togglePermission(role.role_id, perm.permission_id)}
                        disabled={perm.permission_id < 0}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-transform hover:scale-110 disabled:opacity-50"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={extensionData[role.role_id]?.is_approver || false}
                      onChange={() => toggleExtensionApprover(role.role_id)}
                      disabled={extensionSaving[role.role_id]}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-transform hover:scale-110 disabled:opacity-50"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-5 border-t border-white/20 flex justify-end bg-white/30">
            <button
              onClick={savePermissions}
              disabled={saving}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Permissions"}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Tip: Toggle "Extension Approver" to allow the role to approve extension requests.
        </p>
      </div>

      {/* Add Permission Modal */}
      <Dialog
        open={showAddModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddModal(false);
            setAddError(null);
            setNewPermName("");
            setNewPermModule("");
          }
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-md p-0 gap-0 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
              <DialogTitle className="text-xl font-bold text-gray-900">Add New Permission</DialogTitle>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAddError(null);
                  setNewPermName("");
                  setNewPermModule("");
                }}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Permission Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPermName}
                  onChange={(e) => setNewPermName(e.target.value)}
                  placeholder="e.g., View Cost Comparison"
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg bg-white"
                />
                <p className="text-xs text-gray-400 mt-1">
                  A short, descriptive name for the permission.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Module <span className="text-red-500">*</span>
                </label>
                <select
                  value={newPermModule}
                  onChange={(e) => setNewPermModule(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">Select a module…</option>
                  {modules.map((mod) => (
                    <option key={mod} value={mod}>
                      {mod}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  The category this permission belongs to.
                </p>
              </div>
              {newPermName && newPermModule && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <span className="text-gray-600">Will be created as: </span>
                  <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs font-mono">
                    {generateCode(newPermName)}
                  </code>
                  <span className="text-gray-500 ml-1">(automatically generated)</span>
                </div>
              )}
              {addError && <p className="text-red-600 text-sm">{addError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-5 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAddError(null);
                  setNewPermName("");
                  setNewPermModule("");
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPermission}
                disabled={adding}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium rounded-lg transition disabled:opacity-50"
              >
                {adding ? "Creating..." : "Create Permission"}
              </button>
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// TimeLockedAccess (full implementation)
// ============================================================
function TimeLockedAccess({ roles }: { roles: Role[] }) {
  const toast = useNotify();
  const [accessWindows, setAccessWindows] = useState<AccessWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tempWindows, setTempWindows] = useState<AccessWindow[]>([]);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const fetchAccessWindows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/access-windows");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAccessWindows(Array.isArray(data) ? data : []);
      setTempWindows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load access windows");
      toast.error("Failed to load access windows");
      setAccessWindows([]);
      setTempWindows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccessWindows();
  }, []);

  const addWindow = () => {
    if (!roles.length) {
      toast.warning("No roles available. Please refresh.");
      return;
    }
    setTempWindows((prev) => [
      ...prev,
      {
        role_id: roles[0].role_id,
        resource_type: "tender_submission",
        can_view_from: null,
        can_view_until: null,
      },
    ]);
  };

  const updateWindow = (index: number, field: keyof AccessWindow, value: any) => {
    setTempWindows((prev) => {
      const updated = [...prev];
      const window = updated[index];
      if (field === "role_id") {
        const newId = Number(value);
        if (newId > 0 && roles.some(r => r.role_id === newId)) {
          window.role_id = newId;
        } else {
          toast.warning("Invalid role selected.");
          return prev;
        }
      } else if (field === "resource_type") {
        window.resource_type = String(value);
      } else if (field === "can_view_from") {
        window.can_view_from = value || null;
      } else if (field === "can_view_until") {
        window.can_view_until = value || null;
      }
      return updated;
    });
  };

  const removeWindow = (index: number) => {
    setTempWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const saveWindows = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/access-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows: tempWindows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      setAccessWindows(tempWindows);
      setEditing(false);
      toast.success("Access windows saved successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setTempWindows(accessWindows);
    setEditing(false);
  };

  const resourceTypes = [
    { value: "tender_submission", label: "📄 Contractors – View & Submit Tender/BQ (during open period)" },
    { value: "view_submitted_tenders", label: "🔒 Admin – View Submitted Tenders (after closure, masked contractor identity)" },
    { value: "fgm_first_view", label: "👩‍💼 Finance General Manager – First access & acknowledgment" },
    { value: "fmd_after_ack", label: "🏢 Facilities Management Regional Director – View after FGM acknowledgment" },
    { value: "delegated_access", label: "👥 Other Roles – Access only after FM Director grants permission" },
  ];

  const getResourceLabel = (value: string) => {
    return resourceTypes.find(rt => rt.value === value)?.label || value;
  };

  if (loading) {
    return <div className="animate-pulse h-48 bg-white/40 rounded-xl" />;
  }

  if (error) {
    return (
      <div className="bg-red-100 text-red-800 p-6 rounded-xl">
        <p className="font-semibold">Error loading access windows</p>
        <p className="text-sm">{error}</p>
        <button onClick={fetchAccessWindows} className="mt-3 px-3 py-1 bg-red-600 text-white rounded text-sm">Retry</button>
      </div>
    );
  }

  return (
    <>
      <div className="backdrop-blur-sm bg-white/40 rounded-2xl border border-white/20 shadow-xl">
        <div className="p-4 bg-blue-50/50 border-b border-blue-200 rounded-t-2xl">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-sm text-gray-700">
              <p className="font-semibold">How time‑locked access works</p>
              <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                <li><strong>Contractors</strong> can view and submit tender/BQ only within the defined open window.</li>
                <li>After <strong>submission closes</strong>, admins see submitted tenders but contractor identities are <strong>masked</strong> (negotiation phase).</li>
                <li><strong>Finance General Manager</strong> is first to view – after her acknowledgment, <strong>Facilities Management Regional Director</strong> gains access.</li>
                <li>The FM Director can then <strong>grant access</strong> to other specific roles for evaluation.</li>
                <li>Each tender can have <strong>custom timeframes</strong> per role – configure below.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Time‑Based Access Windows</h2>
              <p className="text-sm text-gray-500 mt-1">
                Define when each role can view or submit resources. Use the dropdowns to select the appropriate access level.
              </p>
            </div>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg text-sm">
                Edit Windows
              </button>
            ) : (
              <div className="flex gap-3">
                <button onClick={saveWindows} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={cancelEdit} className="px-4 py-2 bg-gray-300 rounded-lg text-sm">Cancel</button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Access Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">View From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">View Until</th>
                  {editing && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tempWindows.map((win, idx) => (
                  <tr key={idx} className="hover:bg-white/30">
                    <td className="px-4 py-3">
                      {editing ? (
                        <select value={win.role_id} onChange={(e) => updateWindow(idx, "role_id", e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-white">
                          {roles.map((role) => (
                            <option key={role.role_id} value={role.role_id}>{getRoleDisplayName(role.role_name)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm">{getRoleDisplayName(roles.find((r) => r.role_id === win.role_id)?.role_name || "Unknown")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <select value={win.resource_type} onChange={(e) => updateWindow(idx, "resource_type", e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-white">
                          {resourceTypes.map((rt) => (
                            <option key={rt.value} value={rt.value}>{rt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm">{getResourceLabel(win.resource_type)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input type="datetime-local" value={win.can_view_from?.slice(0, 16) || ""} onChange={(e) => updateWindow(idx, "can_view_from", e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
                      ) : (
                        <span className="text-sm">{win.can_view_from ? format(new Date(win.can_view_from), "dd/MM/yyyy HH:mm") : "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input type="datetime-local" value={win.can_view_until?.slice(0, 16) || ""} onChange={(e) => updateWindow(idx, "can_view_until", e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
                      ) : (
                        <span className="text-sm">{win.can_view_until ? format(new Date(win.can_view_until), "dd/MM/yyyy HH:mm") : "—"}</span>
                      )}
                    </td>
                    {editing && (
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => removeWindow(idx)} className="text-red-500 hover:text-red-700">Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editing && (
            <div className="mt-4">
              <button onClick={addWindow} className="text-blue-600 text-sm hover:underline">+ Add Access Window</button>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-white/30 rounded-b-2xl flex justify-between items-center">
          <div className="flex items-center gap-2 text-amber-600">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Time‑locked envelopes: Bids are encrypted and released only after scheduled opening.</span>
          </div>
          <button
            onClick={() => setShowDisclaimer(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition"
          >
            <span className="text-base">⚖️</span> Legal & Compliance Info
          </button>
        </div>
      </div>

      <Dialog open={showDisclaimer} onOpenChange={(open) => { if (!open) setShowDisclaimer(false); }}>
        <DialogContent showCloseButton={false} className="max-w-2xl p-0 gap-0 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
              <DialogTitle className="text-xl font-bold text-gray-900">Time‑Locked Envelope – Legal Framework</DialogTitle>
              <button onClick={() => setShowDisclaimer(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-gray-700 text-sm">
              <p>This time‑locked access mechanism implements a secure “two‑envelope” tendering process compliant with Singapore procurement standards:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>GeBIZ / IMDA Guidelines</strong> – Sealed bids are kept confidential until the official opening date and time.</li>
                <li><strong>PDPA (Personal Data Protection Act)</strong> – Vendor identities are masked during technical evaluation to prevent bias.</li>
                <li><strong>Companies Act (Cap. 50)</strong> – Financial bids are only accessible after technical qualification is complete.</li>
                <li><strong>ISO 27001</strong> – Encryption at rest and time‑based access controls are applied.</li>
                <li><strong>Non‑repudiation</strong> – All decryption events are logged in the immutable audit trail.</li>
              </ul>
              <p className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                Technical bids are encrypted with a key that becomes valid only after <code>technical_opening_time</code> (set per tender). Commercial bids use a separate key with a later validity. No system user (including admins) can access them before the scheduled time.
              </p>
            </div>
            <div className="flex justify-end px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button onClick={() => setShowDisclaimer(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                OK
              </button>
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// AuditLogs (full implementation)
// ============================================================
function AuditLogs() {
  const toast = useNotify();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audit-logs");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load audit logs");
      toast.error("Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(
    (log) =>
      log.username?.toLowerCase().includes(filter.toLowerCase()) ||
      log.action?.toLowerCase().includes(filter.toLowerCase()) ||
      log.resource_type?.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return <div className="animate-pulse h-96 bg-white/40 rounded-xl" />;
  }

  if (error) {
    return (
      <div className="bg-red-100 text-red-800 p-6 rounded-xl">
        <p className="font-semibold">Error loading audit logs</p>
        <p className="text-sm">{error}</p>
        <button onClick={fetchLogs} className="mt-3 px-3 py-1 bg-red-600 text-white rounded text-sm">Retry</button>
      </div>
    );
  }

  return (
    <>
      <div className="backdrop-blur-sm bg-white/40 rounded-2xl border border-white/20 shadow-xl">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Immutable Audit Trail</h2>
            <input
              type="text"
              placeholder="Filter by user, action, resource..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-1 border rounded-lg text-sm bg-white"
            />
          </div>
          <div className="overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No audit logs found.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase">Resource</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase">Details</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/30">
                      <td className="px-4 py-3 text-xs font-mono">{format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss")}</td>
                      <td className="px-4 py-3 text-sm">{log.username}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-0.5 rounded-md bg-gray-200 text-xs">{log.action}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">{log.resource_type}</td>
                      <td className="px-4 py-3 text-sm">
                        <pre className="text-xs overflow-x-auto max-w-xs">{JSON.stringify(log.details, null, 2)}</pre>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{log.ip_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-white/30 rounded-b-2xl flex justify-between items-center">
          <div className="flex items-center gap-2 text-gray-600">
            <Lock className="w-4 h-4" />
            <span className="text-sm">All access attempts, decryption events, and permission changes are recorded in a tamper‑evident log.</span>
          </div>
          <button
            onClick={() => setShowDisclaimer(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition"
          >
            <span className="text-base">📜</span> Compliance & Legal Info
          </button>
        </div>
      </div>

      <Dialog open={showDisclaimer} onOpenChange={(open) => { if (!open) setShowDisclaimer(false); }}>
        <DialogContent showCloseButton={false} className="max-w-2xl p-0 gap-0 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
              <DialogTitle className="text-xl font-bold text-gray-900">Compliance & Legal Framework</DialogTitle>
              <button onClick={() => setShowDisclaimer(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-gray-700 text-sm">
              <p>This audit trail is designed to meet the highest standards of transparency and non‑repudiation, in accordance with Singapore regulations and industry best practices:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Personal Data Protection Act (PDPA) 2012</strong> – All access to personal data is logged and subject to audit.</li>
                <li><strong>IMDA / GeBIZ Guidelines</strong> – Tender processes are time‑stamped and immutable to ensure fair competition.</li>
                <li><strong>Companies Act (Cap. 50)</strong> – Retention of records for statutory compliance.</li>
                <li><strong>ISO 27001</strong> – Information security management controls, including logging and monitoring.</li>
                <li><strong>Blockchain‑style chained hashing</strong> – Each log entry is cryptographically linked to the previous one, preventing retroactive tampering.</li>
                <li><strong>Role‑based access control (RBAC)</strong> – Only authorised roles (Admin, Auditor) can view raw logs.</li>
              </ul>
              <p className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                The system maintains a write‑once, append‑only log with SHA‑256 row hashing. The latest hash can be anchored to an external immutable ledger (e.g., AWS QLDB, public blockchain) for external verification.
              </p>
            </div>
            <div className="flex justify-end px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button onClick={() => setShowDisclaimer(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                OK
              </button>
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}