"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useNotify } from "@/components/ui/notification-provider";

interface Setting {
  id: number;
  role_id: number;
  role_name: string;
  is_approver: boolean;
  is_cc: boolean;
}

export default function ExtensionSettings() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useNotify();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSettings();
    }
  }, [status]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/extension-settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (id: number, field: "is_approver" | "is_cc", value: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/extension-settings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Failed to update setting");
      // Refresh
      await fetchSettings();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-slate-500">Loading extension settings...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">{error}</div>;
  }

  if (settings.length === 0) {
    return (
      <div className="text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-lg text-center">
        No extension settings configured. Please contact your administrator.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">Role</th>
            <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300 text-center">Is Approver</th>
            <th className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300 text-center">Is CC</th>
          </tr>
        </thead>
        <tbody>
          {settings.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{item.role_name}</td>
              <td className="py-2 px-3 text-center">
                <input
                  type="checkbox"
                  checked={item.is_approver}
                  onChange={(e) => updateSetting(item.id, "is_approver", e.target.checked)}
                  disabled={saving}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
              </td>
              <td className="py-2 px-3 text-center">
                <input
                  type="checkbox"
                  checked={item.is_cc}
                  onChange={(e) => updateSetting(item.id, "is_cc", e.target.checked)}
                  disabled={saving}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
        Tip: At least one role must be an approver to receive extension requests.
      </p>
    </div>
  );
}