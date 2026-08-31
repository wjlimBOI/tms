"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useNotify } from "@/components/ui/notification-provider";
import { isSuperUser } from "@/lib/roles";
import ReassignProjectManagerModal from "@/components/projectManagers/ReassignProjectManagerModal";

interface ProjectManager {
  id: number;
  name: string;
  email: string;
  phone: string | null;
}

export default function AdminProjectManagersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useNotify();

  const [pms, setPms] = useState<ProjectManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [reassignTarget, setReassignTarget] = useState<ProjectManager | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isSuperUser((session.user as any).roleIds || [])) {
      router.push("/");
    }
  }, [session, status, router]);

  const fetchPMs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project-managers");
      if (!res.ok) throw new Error("Failed to fetch project managers");
      const data = await res.json();
      setPms(data);
    } catch (err) {
      console.error(err);
      setError("Could not load project managers. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const roleIds = ((session?.user as any)?.roleIds || []) as number[];
    if (session && isSuperUser(roleIds)) {
      fetchPMs();
    }
  }, [session, fetchPMs]);

  const filteredPMs = useMemo(() => {
    if (!searchTerm.trim()) return pms;
    const term = searchTerm.trim().toLowerCase();
    return pms.filter(
      (pm) =>
        pm.name.toLowerCase().includes(term) ||
        pm.email.toLowerCase().includes(term) ||
        (pm.phone || "").toLowerCase().includes(term)
    );
  }, [pms, searchTerm]);

  const handleReassignSuccess = () => {
    toast.success("Reassignment recorded successfully.");
    fetchPMs();
  };

  if (status === "loading" || (loading && pms.length === 0 && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading project managers…</p>
        </div>
      </div>
    );
  }

  if (error && pms.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-red-100 border border-red-300 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchPMs}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Project Managers</h1>
              <p className="text-sm text-gray-500 mt-1">
                Reassign a resigning project manager&apos;s tenders to a replacement.
              </p>
            </div>
            <button
              onClick={fetchPMs}
              className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl shadow-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] focus-visible:ring-offset-2"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
            <label htmlFor="pm-search" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
              Search
            </label>
            <input
              id="pm-search"
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-96 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent px-3 py-2 text-sm"
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Phone</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPMs.length > 0 ? (
                    filteredPMs.map((pm) => (
                      <tr key={pm.id} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{pm.name}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{pm.email}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{pm.phone || "—"}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-center">
                          <button
                            onClick={() => setReassignTarget(pm)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#15406a] bg-white text-[#15406a] hover:bg-[#15406a] hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15406a] focus-visible:ring-offset-2"
                          >
                            Reassign
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        {searchTerm ? "No project managers match your search." : "No project managers have been created yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {reassignTarget && (
        <ReassignProjectManagerModal
          open={!!reassignTarget}
          onClose={() => setReassignTarget(null)}
          oldProjectManager={reassignTarget}
          onSuccess={handleReassignSuccess}
        />
      )}
    </div>
  );
}
