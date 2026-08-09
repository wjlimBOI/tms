"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { sortRoles, type Role } from "@/lib/roleSort";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useNotify } from "@/components/ui/notification-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Extend User interface
interface User {
  user_id: number;
  username: string;
  email: string;
  display_name?: string;
  role_id: number;
  role_name?: string;
  is_active: boolean;
  is_approved: boolean;
  access_start_date: string | null;
  access_end_date: string | null;
  last_login: string | null;
  created_at: string;
  company_name?: string;
}

// Role colour map (by role_id)
const roleColorMap: Record<number, string> = {
  1: "bg-purple-100 text-purple-800 border-purple-200",
  2: "bg-blue-100 text-blue-800 border-blue-200",
  3: "bg-amber-100 text-amber-800 border-amber-200",
  4: "bg-indigo-100 text-indigo-800 border-indigo-200",
  5: "bg-teal-100 text-teal-800 border-teal-200",
  6: "bg-emerald-100 text-emerald-800 border-emerald-200",
  8: "bg-sky-100 text-sky-800 border-sky-200",
  9: "bg-orange-100 text-orange-800 border-orange-200",
  10: "bg-lime-100 text-lime-800 border-lime-200",
  11: "bg-rose-100 text-rose-800 border-rose-200",
  12: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  13: "bg-cyan-100 text-cyan-800 border-cyan-200",
  14: "bg-slate-200 text-slate-800 border-slate-300",
  22: "bg-green-100 text-green-800 border-green-200",
};

// Main component
export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const toast = useNotify();
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Server-driven state
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  // Modal and form state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    display_name: "",
    password: "",
    role_id: 4,
    is_active: true,
    access_start_date: "",
    access_end_date: "",
    company_name: "",
  });
  const [sending, setSending] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Filters and pagination
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [roleFilter, setRoleFilter] = useState(() => searchParams.get("role_id") || "");
  const [excludeRoleFilter, setExcludeRoleFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState(() => searchParams.get("is_active") || "");
  const [approvedFilter, setApprovedFilter] = useState(() => searchParams.get("is_approved") || "");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"internal" | "external">("internal");

  // Counts for tabs
  const [internalCount, setInternalCount] = useState(0);
  const [externalCount, setExternalCount] = useState(0);
  const [contractorRoleId, setContractorRoleId] = useState<number | null>(null);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, excludeRoleFilter, activeFilter, approvedFilter, activeTab]);

  // Fetch roles
  useEffect(() => {
    setRolesLoading(true);
    setRolesError(null);
    fetch("/api/admin/roles")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const sorted = sortRoles(data);
        setRoles(sorted);
        const contractor = sorted.find(r => r.role_name === "Contractor");
        setContractorRoleId(contractor?.role_id || null);
      })
      .catch((err) => {
        console.error("Error fetching roles:", err);
        setRolesError("Could not load roles. Please refresh.");
        setRoles([]);
      })
      .finally(() => setRolesLoading(false));
  }, []);

  // Fetch users with server-side pagination and filters
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', pageSize.toString());
      if (search) params.set('search', search);
      if (roleFilter) params.set('role_id', roleFilter);
      if (excludeRoleFilter) params.set('exclude_role_id', excludeRoleFilter);
      if (activeFilter !== '') params.set('is_active', activeFilter);
      if (approvedFilter !== '') params.set('is_approved', approvedFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users);
      setTotalUsers(data.total);
      setTotalPages(data.totalPages);
      setError(null);
    } catch (err) {
      setError('Could not load users. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, search, roleFilter, excludeRoleFilter, activeFilter, approvedFilter]);

  // Fetch counts for both tabs
  const fetchCounts = useCallback(async () => {
    if (!contractorRoleId) return;

    // Internal: exclude contractor
    const internalRes = await fetch(`/api/admin/users?limit=1&page=1&exclude_role_id=${contractorRoleId}`);
    const internalData = await internalRes.json();
    setInternalCount(internalData.total || 0);

    // External: only contractor
    const externalRes = await fetch(`/api/admin/users?limit=1&page=1&role_id=${contractorRoleId}`);
    const externalData = await externalRes.json();
    setExternalCount(externalData.total || 0);
  }, [contractorRoleId]);

  // Trigger fetches when dependencies change
  useEffect(() => {
    if (status === "loading") return;
    if (!session || (session.user as any).role_id !== 1) {
      router.push("/");
      return;
    }
    fetchUsers();
    if (contractorRoleId) fetchCounts();
  }, [session, status, router, fetchUsers, fetchCounts, contractorRoleId]);

  // Update URL with filters
  const updateUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (roleFilter) params.set("role_id", roleFilter);
    if (excludeRoleFilter) params.set("exclude_role_id", excludeRoleFilter);
    if (activeFilter) params.set("is_active", activeFilter);
    if (approvedFilter) params.set("is_approved", approvedFilter);
    router.replace(`/admin/users?${params.toString()}`, { scroll: false });
  }, [search, roleFilter, excludeRoleFilter, activeFilter, approvedFilter, router]);

  useEffect(() => {
    updateUrl();
  }, [updateUrl]);

  // Tab switching
  const switchTab = (tab: "internal" | "external") => {
    setActiveTab(tab);
    setCurrentPage(1);
    if (tab === "internal") {
      setRoleFilter("");
      setExcludeRoleFilter(contractorRoleId ? String(contractorRoleId) : "");
    } else {
      setExcludeRoleFilter("");
      setRoleFilter(contractorRoleId ? String(contractorRoleId) : "");
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSearch("");
    setRoleFilter("");
    setExcludeRoleFilter("");
    setActiveFilter("");
    setApprovedFilter("");
    setCurrentPage(1);
  };

  // Handle delete. The list is paginated (page size/counts/sort come from
  // the server), so removing the row locally risks the page showing a stale
  // count or one fewer row than pagination says — instead this shows
  // immediate per-row "deleting…" feedback and lets the real fetchUsers()
  // apply the authoritative result.
  const handleDelete = async (userId: number) => {
    if (!(await confirm({ description: "Delete this user permanently? This action cannot be undone.", confirmText: "Delete", variant: "destructive" }))) return;
    setDeletingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Deletion failed");
      await fetchUsers();
    } catch (err) {
      toast.error("Error deleting user");
    } finally {
      setDeletingUserId(null);
    }
  };

  // Email blur (auto-fill username)
  const handleEmailBlur = () => {
    if (!editingUser && formData.email && !formData.username) {
      const usernameFromEmail = formData.email.split("@")[0];
      setFormData((prev) => ({ ...prev, username: usernameFromEmail }));
    }
  };

  // Open create modal
  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      username: "",
      email: "",
      display_name: "",
      password: "",
      role_id: roles.length ? roles[0].role_id : 4,
      is_active: true,
      access_start_date: "",
      access_end_date: "",
      company_name: "",
    });
    setShowModal(true);
  };

  // Open edit modal
  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      display_name: user.display_name || "",
      password: "",
      role_id: user.role_id,
      is_active: user.is_active,
      access_start_date: user.access_start_date?.split("T")[0] || "",
      access_end_date: user.access_end_date?.split("T")[0] || "",
      company_name: user.company_name || "",
    });
    setShowModal(true);
  };

  // Submit create/edit. Not made optimistic (unlike the row-level actions
  // elsewhere in this pass) because where a new/edited row lands depends on
  // server-side sort order and pagination that can't be guessed client-side
  // — instead this adds the loading feedback that was missing entirely
  // (AGENTS.md: every async action needs one), disabling Save instead of
  // letting a user fire a duplicate submit with no visible indication
  // anything is happening.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    try {
      let url = "/api/admin/users";
      let method = "POST";
      const payload: any = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        display_name: formData.display_name.trim() || null,
        role_id: formData.role_id,
        is_active: formData.is_active,
        is_approved: true,
        access_start_date: formData.access_start_date || null,
        access_end_date: formData.access_end_date || null,
        company_name: formData.company_name.trim(),
      };
      if (formData.password) payload.password = formData.password;
      if (editingUser) {
        url = `/api/admin/users/${editingUser.user_id}`;
        method = "PUT";
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Operation failed");
      }
      setShowModal(false);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Request send email
  const requestSendEmail = async (userId: number, email: string) => {
    const proceed = await confirm({
      title: "Confirm Send Email",
      description: `Are you sure you want to send a welcome email to: ${email}`,
      confirmText: "Confirm & Send",
    });
    if (!proceed) return;

    setSending(userId);
    try {
      const res = await fetch("/api/admin/users/resend-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error("Failed to send email");
      toast.success(`Welcome email has been sent to ${email}.`);
    } catch (err) {
      toast.error("Could not send email. Please try again.");
    } finally {
      setSending(null);
    }
  };

  // Helper functions
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm");
  };

  const getRoleName = (roleId: number) => {
    const role = roles.find((r) => r.role_id === roleId);
    return role ? (role.display_name || role.role_name) : `Role ${roleId}`;
  };

  const getRoleColor = (roleId: number) => {
    return roleColorMap[roleId] || "bg-gray-100 text-gray-800 border-gray-300";
  };

  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(value), 400);
  };

  // Loading / error states
  if (status === "loading" || (loading && users.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading users…</p>
        </div>
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-red-100 border border-red-300 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-700">{error}</p>
          <button onClick={() => fetchUsers()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-50">
      {/* Animated blur circles */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[35vw] max-w-[540px] max-h-[280px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative z-10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">User Administration</h1>
              <p className="text-gray-500 text-sm mt-1">Manage system users, roles, and organisations</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => fetchUsers()}
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl shadow-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200"
                title="Refresh users"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl shadow-sm text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 transition-all duration-200 hover:-translate-y-0.5"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New User
              </button>
            </div>
          </div>

          {/* Filter card */}
          <div className="bg-white backdrop-blur-sm rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Search</label>
                <input
                  type="text"
                  placeholder="Username or email..."
                  defaultValue={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Role</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-600 px-3 py-2 text-sm"
                >
                  <option value="">All Roles</option>
                  {roles.map((role) => (
                    <option key={role.role_id} value={role.role_id}>
                      {role.display_name || role.role_name}
                    </option>
                  ))}
                </select>
                {rolesError && <p className="text-xs text-red-500 mt-1">{rolesError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-600 px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Approval</label>
                <select
                  value={approvedFilter}
                  onChange={(e) => setApprovedFilter(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-600 px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  <option value="true">Approved</option>
                  <option value="false">Pending</option>
                </select>
              </div>
              <div>
                <button
                  onClick={clearFilters}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-cyan-600 rounded-lg text-sm font-medium text-cyan-700 bg-transparent hover:bg-cyan-50 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => switchTab("internal")}
                className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === "internal"
                    ? "border-cyan-600 text-cyan-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Internal Organisation ({internalCount})
              </button>
              <button
                onClick={() => switchTab("external")}
                className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === "external"
                    ? "border-cyan-600 text-cyan-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                External (Contractors) ({externalCount})
              </button>
            </nav>
          </div>

          {/* Users table */}
          <div className="bg-white backdrop-blur-sm rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Display Name</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Username</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Organisation</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Approved</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Login</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.length > 0 ? (
                    users.map((user) => (
                      <tr key={user.user_id} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{user.user_id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-left">
                          {user.display_name || user.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-left">{user.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-left">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-left">{user.company_name || "—"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-left">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${getRoleColor(user.role_id)}`}>
                            {getRoleName(user.role_id)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-left">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${
                            user.is_active
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-red-100 text-red-800 border-red-200"
                          }`}>
                            {user.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-left">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border bg-emerald-100 text-emerald-800 border-emerald-200">
                            Approved
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{formatDate(user.last_login)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{formatDate(user.created_at)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => requestSendEmail(user.user_id, user.email)}
                              disabled={sending === user.user_id}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {sending === user.user_id ? "Sending…" : "Send Email"}
                            </button>
                            <button onClick={() => openEditModal(user)} disabled={deletingUserId === user.user_id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed">Edit</button>
                            <button onClick={() => handleDelete(user.user_id)} disabled={deletingUserId === user.user_id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-800 border-red-200 hover:bg-red-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                              {deletingUserId === user.user_id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                        No users found in this category.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalUsers > 0 && (
              <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-white border border-gray-300 rounded-md px-2 py-1 text-sm"
                  >
                    {[10, 20, 30, 50].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                  <span className="ml-4">
                    {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-700">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) setShowModal(false); }}>
        <DialogContent
          showCloseButton={false}
          className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0"
          style={{ scrollbarWidth: "thin" }}
        >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-50 px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-800 tracking-tight">
                    {editingUser ? "Edit User" : "Create New User"}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-500 mt-0.5">
                    {editingUser
                      ? "Modify user details and permissions"
                      : "Add a new user to the system and send welcome credentials"}
                  </DialogDescription>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                  className="text-slate-400 hover:text-slate-600 transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Email address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    onBlur={handleEmailBlur}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    placeholder="user@company.com"
                  />
                  <p className="text-xs text-slate-500">Will be used for login and notifications</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    placeholder="jdoe"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Display Name
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  placeholder="John Doe"
                />
                <p className="text-xs text-slate-500">
                  Friendly name shown in the interface (falls back to username if empty)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Organisation / Company
                  </label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    placeholder="Acme Corp"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: parseInt(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  >
                    {rolesLoading ? (
                      <option value="">Loading roles...</option>
                    ) : rolesError ? (
                      <option value="">Error loading roles</option>
                    ) : roles.length === 0 ? (
                      <option value="">No roles available</option>
                    ) : (
                      roles.map((role) => (
                        <option key={role.role_id} value={role.role_id}>
                          {role.display_name || role.role_name}
                        </option>
                      ))
                    )}
                  </select>
                  {rolesError && <p className="text-xs text-rose-500 mt-1">{rolesError}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  {editingUser ? "New Password (leave blank to keep current)" : "Password *"}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  placeholder={editingUser ? "••••••••" : "Enter a strong password"}
                />
                {!editingUser && (
                  <p className="text-xs text-slate-500">
                    A temporary password will be generated if left empty – the user will be forced to change it on first login.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-300 rounded"
                  />
                  <span className="text-sm text-slate-700">Active</span>
                </label>
                <span className="text-xs text-slate-400">
                  Inactive users cannot log in
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Access Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.access_start_date}
                    onChange={(e) => setFormData({ ...formData, access_start_date: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Access End Date
                  </label>
                  <input
                    type="date"
                    value={formData.access_end_date}
                    onChange={(e) => setFormData({ ...formData, access_end_date: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 bg-white pt-4 pb-0 -mx-6 px-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={formSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 rounded-lg text-sm font-medium text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formSubmitting ? "Saving…" : editingUser ? "Update User" : "Create User"}
                </button>
              </div>
            </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}