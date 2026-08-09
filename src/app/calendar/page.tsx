"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";
import { useNotify } from "@/components/ui/notification-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getBrandColor } from "@/lib/brandColors";
import type { EventInput } from "@fullcalendar/core";
import "./calendar.css";

// ---------- Dynamic FullCalendar import ----------
const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-2xl border border-slate-200">
      <div className="text-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-500">Loading calendar…</p>
      </div>
    </div>
  ),
});

import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import multimonthPlugin from "@fullcalendar/multimonth";

// ============================================================
// 1. Reusable Modal Components
// ============================================================

// ---------- Edit Event Modal ----------
interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventData: {
    title: string;
    start: string | null;
    end: string | null;
    allDay: boolean;
    description: string;
    brand_id: number | null;
    branch_id: number | null;
    tender_id: number | null;
  };
  brands: { brand_id: number; brand_name: string; displayName: string }[];
  branchMap: Map<string, { branch_id: number; branch_name: string }[]>;
  tenders: { tender_id: number; tender_name: string }[];
  onSave: (updatedData: any) => void;
  isSaving?: boolean;
}

const EditEventModal: React.FC<EditEventModalProps> = ({
  isOpen,
  onClose,
  eventData,
  brands,
  branchMap,
  tenders,
  onSave,
  isSaving,
}) => {
  const [formData, setFormData] = useState({
    title: "",
    start_date: "",
    end_date: "",
    all_day: true,
    description: "",
    brand_id: "",
    branch_id: "",
    tender_id: "",
  });

  useEffect(() => {
    if (isOpen && eventData) {
      const formatDateTimeLocal = (dateStr: string | null) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";
        return format(date, "yyyy-MM-dd'T'HH:mm");
      };

      setFormData({
        title: eventData.title || "",
        start_date: formatDateTimeLocal(eventData.start),
        end_date: formatDateTimeLocal(eventData.end),
        all_day: eventData.allDay ?? true,
        description: eventData.description || "",
        brand_id: eventData.brand_id?.toString() || "",
        branch_id: eventData.branch_id?.toString() || "",
        tender_id: eventData.tender_id?.toString() || "",
      });
    }
  }, [isOpen, eventData]);

  if (!isOpen) return null;

  const selectedBrand = brands.find(b => b.brand_id === parseInt(formData.brand_id));
  const brandKey = selectedBrand?.displayName?.toLowerCase() || "";
  const availableBranches = branchMap.get(brandKey) || [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">Edit Event</DialogTitle>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date/Time *</label>
              <input
                type="datetime-local"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date/Time</label>
              <input
                type="datetime-local"
                value={formData.end_date}
                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={formData.all_day}
              onChange={e => setFormData({ ...formData, all_day: e.target.checked })}
              className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span className="text-sm">All day event</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
            <select
              value={formData.brand_id}
              onChange={e => {
                const newBrandId = e.target.value;
                setFormData({ ...formData, brand_id: newBrandId, branch_id: "" });
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option value="">Select brand (optional)</option>
              {brands.map(b => <option key={b.brand_id} value={b.brand_id}>{b.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Branch (Location)</label>
            <select
              value={formData.branch_id}
              onChange={e => setFormData({ ...formData, branch_id: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              disabled={!formData.brand_id}
            >
              <option value="">Select branch</option>
              {availableBranches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
            {!formData.brand_id && <p className="text-xs text-amber-600 mt-1">Select a brand first to see branches</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tender</label>
            <select
              value={formData.tender_id}
              onChange={e => setFormData({ ...formData, tender_id: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option value="">Select tender (optional)</option>
              {tenders.map(t => <option key={t.tender_id} value={t.tender_id}>{t.tender_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none"
            />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            disabled={isSaving || !formData.title.trim() || !formData.start_date}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-medium text-sm shadow-sm disabled:opacity-50 transition"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================
// 2. Main Calendar Component
// ============================================================
export default function CalendarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useNotify();
  const [projectEvents, setProjectEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventInput | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [brands, setBrands] = useState<{ brand_id: number; brand_name: string; displayName: string }[]>([]);
  const [branchMap, setBranchMap] = useState<Map<string, { branch_id: number; branch_name: string }[]>>(new Map());
  const [tenders, setTenders] = useState<{ tender_id: number; tender_name: string }[]>([]);
  const [newEvent, setNewEvent] = useState({
    title: "",
    start_date: "",
    end_date: "",
    all_day: true,
    description: "",
    brand_id: "",
    branch_id: "",
    tender_id: "",
  });
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editEventData, setEditEventData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const confirm = useConfirm();

  // ---------- Permission check ----------
  useEffect(() => {
    const checkAccess = async () => {
      if (status === "loading") return;
      if (!session) {
        router.push("/login");
        return;
      }
      const userRole = (session.user as any)?.role_id;
      if (userRole === 1) {
        setHasAccess(true);
        return;
      }
      try {
        const res = await fetch("/api/user/permissions");
        if (!res.ok) throw new Error("Failed to fetch permissions");
        const data = await res.json();
        if (data.permissions?.includes("view_project_schedule")) {
          setHasAccess(true);
        } else {
          router.push("/");
        }
      } catch {
        setHasAccess(true);
      }
    };
    checkAccess();
  }, [session, status, router]);

  // ---------- Fetch brands, branches, tenders ----------
  useEffect(() => {
    if (hasAccess !== true) return;
    fetchData();

    // Brands
    fetch("/api/brands")
      .then(res => res.json())
      .then(data => {
        const brandsArray = Array.isArray(data) ? data : [];
        const nameToBrands = new Map<string, { brand_id: number; brand_name: string }[]>();
        for (const brand of brandsArray) {
          let shortName = brand.brand_name;
          const lower = brand.brand_name.toLowerCase();
          if (lower.includes('dorra')) shortName = 'Dorra';
          else if (lower.includes('jonsson')) shortName = 'Jonsson';
          else if (lower.includes('london')) shortName = 'London';
          else if (lower.includes('new york')) shortName = 'New York';
          else if (lower.includes('shakura')) shortName = 'Shakura';
          else if (lower.includes('victoria')) shortName = 'Victoria';
          else if (lower.includes('yun nam')) shortName = 'Yun Nam';
          else if (lower.includes('beauty one')) shortName = 'Beauty One International';
          else if (lower === 'ames') shortName = 'AMES';
          const key = shortName.toLowerCase();
          if (!nameToBrands.has(key)) nameToBrands.set(key, []);
          nameToBrands.get(key)!.push({ brand_id: brand.brand_id, brand_name: brand.brand_name });
        }
        const uniqueBrands: { brand_id: number; brand_name: string; displayName: string }[] = [];
        for (const [key, brandsList] of nameToBrands.entries()) {
          const rep = brandsList[0];
          let display = rep.brand_name;
          if (key === 'dorra') display = 'Dorra';
          else if (key === 'jonsson') display = 'Jonsson';
          else if (key === 'london') display = 'London';
          else if (key === 'new york') display = 'New York';
          else if (key === 'shakura') display = 'Shakura';
          else if (key === 'victoria') display = 'Victoria';
          else if (key === 'yun nam') display = 'Yun Nam';
          else if (key === 'beauty one international') display = 'Beauty One International';
          else if (key === 'ames') display = 'AMES';
          uniqueBrands.push({
            brand_id: rep.brand_id,
            brand_name: rep.brand_name,
            displayName: display,
          });
        }
        setBrands(uniqueBrands);
      })
      .catch(err => console.error("Brands fetch error:", err));

    // Branches
    fetch("/api/branches")
      .then(res => res.json())
      .then(data => {
        const branchesArray = Array.isArray(data) ? data : [];
        const branchMapTemp = new Map<string, { branch_id: number; branch_name: string }[]>();
        for (const branch of branchesArray) {
          let normalized = branch.brand_name?.toLowerCase() || "";
          if (normalized.includes('dorra')) normalized = 'dorra';
          else if (normalized.includes('jonsson')) normalized = 'jonsson';
          else if (normalized.includes('london')) normalized = 'london';
          else if (normalized.includes('new york')) normalized = 'new york';
          else if (normalized.includes('shakura')) normalized = 'shakura';
          else if (normalized.includes('victoria')) normalized = 'victoria';
          else if (normalized.includes('yun nam')) normalized = 'yun nam';
          else if (normalized.includes('beauty one')) normalized = 'beauty one international';
          else if (normalized === 'ames') normalized = 'ames';
          if (!branchMapTemp.has(normalized)) branchMapTemp.set(normalized, []);
          branchMapTemp.get(normalized)!.push({ branch_id: branch.branch_id, branch_name: branch.branch_name });
        }
        setBranchMap(branchMapTemp);
      })
      .catch(err => console.error("Branches fetch error:", err));

    // Tenders
    fetch("/api/tenders")
      .then(res => res.json())
      .then(data => {
        let tendersArray: any[] = [];
        if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
          tendersArray = data.data;
        } else if (Array.isArray(data)) {
          tendersArray = data;
        }
        setTenders(tendersArray);
      })
      .catch(err => console.error("Tenders fetch error:", err));
  }, [hasAccess]);

  // ---------- fetchData with robust grouping ----------
  const fetchData = async () => {
    try {
      setLoading(true);
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      const end = new Date();
      end.setMonth(end.getMonth() + 6);
      const startStr = format(start, "yyyy-MM-dd");
      const endStr = format(end, "yyyy-MM-dd");
      const res = await fetch(`/api/calendar/events?start=${startStr}&end=${endStr}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // ---------- Grouping ----------
      const groups: Record<string, any[]> = {};
      data.forEach((e: any) => {
        if (!e.tender_id) {
          // Standalone – use a unique key
          const key = `standalone_${e.event_id}`;
          groups[key] = [e];
          return;
        }
        const datePart = e.start_date ? e.start_date.split('T')[0] : 'no-date';
        const key = `${e.tender_id}_${datePart}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(e);
      });

      const formatted: EventInput[] = [];
      for (const key of Object.keys(groups)) {
        const group = groups[key];
        if (group.length === 1) {
          const e = group[0];
          formatted.push({
            id: e.event_id,
            title: e.title,
            start: e.all_day ? (e.start_date ? e.start_date.split('T')[0] : undefined) : e.start_date,
            end: e.all_day ? (e.end_date ? e.end_date.split('T')[0] : undefined) : e.end_date,
            allDay: e.all_day,
            backgroundColor: getBrandColor(e.brand_name || "").borderColor,
            extendedProps: {
              brand: e.brand_name,
              brand_name: e.brand_name,
              brand_id: e.brand_id ?? null,
              branch_id: e.branch_id ?? null,
              description: e.description ?? "",
              created_by: e.created_by,
              event_id: e.event_id,
              tender_id: e.tender_id ?? null,
            },
          });
        } else {
          const first = group[0];
          const startDate = first.all_day ? (first.start_date ? first.start_date.split('T')[0] : undefined) : first.start_date;
          const endDate = first.all_day ? (first.end_date ? first.end_date.split('T')[0] : undefined) : first.end_date;
          const tenderName = first.tender_name || 'Unknown Tender';
          formatted.push({
            id: `group_${first.tender_id}_${startDate}`,
            title: `📦 ${tenderName} (${group.length})`,
            start: startDate,
            end: endDate,
            allDay: first.all_day,
            backgroundColor: getBrandColor(first.brand_name || "").borderColor,
            extendedProps: {
              brand: first.brand_name,
              brand_name: first.brand_name,
              brand_id: first.brand_id ?? null,
              branch_id: first.branch_id ?? null,
              description: `Group of ${group.length} events for ${tenderName}`,
              created_by: first.created_by,
              event_id: null,
              tender_id: first.tender_id ?? null,
              children: group,
            },
          });
        }
      }
      setProjectEvents(formatted);
    } catch (err) {
      console.error(err);
      toast.error("Could not load calendar events. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Handlers ----------
  const handleEventClick = (info: any) => {
    setSelectedEvent(info.event);
    setShowModal(true);
  };

  const canEditEvent = (event: EventInput) => {
    if (!session) return false;
    const userRole = (session.user as any)?.role_id;
    if (userRole === 1) return true;
    return event.extendedProps?.created_by === session.user.id;
  };

  const openEditModal = () => {
    if (!selectedEvent) return;
    if (selectedEvent.extendedProps?.children) {
      toast.error("This is a grouped event. Edit individual events via the tender.");
      return;
    }
    setEditEventData({
      title: selectedEvent.title,
      start: selectedEvent.start as string,
      end: selectedEvent.end as string,
      allDay: selectedEvent.allDay,
      description: selectedEvent.extendedProps?.description ?? "",
      brand_id: selectedEvent.extendedProps?.brand_id ?? null,
      branch_id: selectedEvent.extendedProps?.branch_id ?? null,
      tender_id: selectedEvent.extendedProps?.tender_id ?? null,
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async (updatedData: any) => {
    if (!selectedEvent) return;
    const eventId = selectedEvent.extendedProps?.event_id;
    if (!eventId) return;

    const payload = {
      title: updatedData.title,
      start_date: updatedData.start_date,
      end_date: updatedData.end_date || null,
      all_day: updatedData.all_day,
      description: updatedData.description,
      brand_id: updatedData.brand_id ? parseInt(updatedData.brand_id) : null,
      branch_id: updatedData.branch_id ? parseInt(updatedData.branch_id) : null,
      tender_id: updatedData.tender_id ? parseInt(updatedData.tender_id) : null,
    };

    setIsSaving(true);
    try {
      const res = await fetch(`/api/calendar/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowEditModal(false);
        setShowModal(false);
        toast.success("The event has been updated successfully.");
        fetchData();
      } else {
        const err = await res.json();
        console.error("Update failed:", err);
        toast.error(err.error || "Could not update the event.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteConfirm = async () => {
    if (!selectedEvent) return;
    if (selectedEvent.extendedProps?.children) {
      toast.error("This is a grouped event. Delete individual events via the tender.");
      return;
    }
    const eventId = selectedEvent.extendedProps?.event_id;
    if (!eventId) return;

    const proceed = await confirm({
      title: "Delete Event",
      description: "Are you sure you want to delete this event? This action cannot be undone.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!proceed) return;

    try {
      const res = await fetch(`/api/calendar/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        setShowModal(false);
        toast.success("The event has been deleted successfully.");
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Could not delete the event.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    }
  };

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.start_date) {
      toast.error("Title and start date are required.");
      return;
    }
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newEvent.title,
          start_date: newEvent.start_date,
          end_date: newEvent.end_date,
          all_day: newEvent.all_day,
          description: newEvent.description,
          brand_id: newEvent.brand_id || null,
          branch_id: newEvent.branch_id || null,
          tender_id: newEvent.tender_id || null,
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewEvent({
          title: "",
          start_date: "",
          end_date: "",
          all_day: true,
          description: "",
          brand_id: "",
          branch_id: "",
          tender_id: "",
        });
        toast.success("Your new event has been added to the calendar.");
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Could not create the event.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    }
  };

  // ---------- Helpers ----------
  const getBranchName = (branchId: number | null | undefined) => {
    if (!branchId) return null;
    const allBranches = Array.from(branchMap.values()).flat();
    const branch = allBranches.find(b => b.branch_id === branchId);
    return branch?.branch_name || `ID ${branchId}`;
  };

  const getBranchesForAdd = () => {
    if (!newEvent.brand_id) return [];
    const selectedBrand = brands.find(b => b.brand_id === parseInt(newEvent.brand_id));
    const key = selectedBrand?.displayName?.toLowerCase() || "";
    return branchMap.get(key) || [];
  };

  // ---------- Render ----------
  if (status === "loading" || loading || hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading your calendar...</p>
        </div>
      </div>
    );
  }

  if (hasAccess === false) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
      <div className="flex-1 flex flex-col max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8 flex-shrink-0">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight">
              Project Calendar
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Industrial‑grade timeline for all renovation projects
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-cyan-500/20 transition-all duration-200 transform hover:scale-[1.02] active:scale-95 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add New Event
          </button>
        </div>

        {/* Calendar container – fills remaining height */}
        <div className="flex-1 min-h-[500px] bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/50 overflow-hidden">
          <div className="h-full p-4 sm:p-5 lg:p-6">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multimonthPlugin]}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{ prev: "‹", next: "›", today: "Today", month: "Month", week: "Week", day: "Day" }}
              initialView="dayGridMonth"
              events={projectEvents}
              eventClick={handleEventClick}
              height="100%"
              contentHeight="auto"
              aspectRatio={undefined}
              dayMaxEvents={6}
              moreLinkText="+{count} more"
              eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
              eventTextColor="#fff"
              eventDisplay="block"
              expandRows={true}
              stickyHeaderDates={true}
              nowIndicator={true}
              editable={false}
              selectable={false}
            />
          </div>
        </div>

        {/* ---------- Modals ---------- */}

        {/* Event Detail Modal – supports grouped events */}
        <Dialog open={showModal && !!selectedEvent} onOpenChange={(open) => { if (!open) setShowModal(false); }}>
          <DialogContent showCloseButton={false} className="max-w-md max-h-[80vh] overflow-y-auto p-6 gap-0">
            {selectedEvent && (
            <>
              <div className="flex items-start justify-between mb-4">
                <DialogTitle className="text-xl font-bold text-slate-900 pr-6">{selectedEvent.title}</DialogTitle>
                <button onClick={() => setShowModal(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedEvent.extendedProps?.children ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">{selectedEvent.extendedProps.children.length}</span> events for this tender on this date:
                  </p>
                  <ul className="divide-y divide-slate-200">
                    {selectedEvent.extendedProps.children.map((child: any, idx: number) => (
                      <li key={child.event_id || idx} className="py-2 flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{child.title}</p>
                          <p className="text-xs text-slate-500">
                            {child.all_day
                              ? format(parseISO(child.start_date), "PPP")
                              : `${format(parseISO(child.start_date), "PPP p")} – ${child.end_date ? format(parseISO(child.end_date), "PPP p") : ''}`
                            }
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm">
                      <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-slate-700">
                        {format(new Date(selectedEvent.start as string), "PPP")}
                        {selectedEvent.end && selectedEvent.end !== selectedEvent.start && ` – ${format(new Date(selectedEvent.end as string), "PPP")}`}
                      </span>
                    </div>
                    {!selectedEvent.allDay && (
                      <div className="flex items-start gap-2 text-sm">
                        <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-slate-700">
                          {format(new Date(selectedEvent.start as string), "p")}
                          {selectedEvent.end && ` – ${format(new Date(selectedEvent.end as string), "p")}`}
                        </span>
                      </div>
                    )}
                    {selectedEvent?.extendedProps?.branch_id && (
                      <div className="flex items-start gap-2 text-sm">
                        <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span className="text-slate-700">
                          Branch: {getBranchName(selectedEvent.extendedProps.branch_id)}
                        </span>
                      </div>
                    )}
                    {selectedEvent.extendedProps?.description && (
                      <div className="flex items-start gap-2 text-sm">
                        <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
                        </svg>
                        <span className="text-slate-700">{selectedEvent.extendedProps.description}</span>
                      </div>
                    )}
                  </div>
                  {canEditEvent(selectedEvent) && !selectedEvent.extendedProps?.children && (
                    <div className="flex gap-3 mt-6">
                      <button onClick={openEditModal} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition text-sm font-medium shadow-md">
                        Edit
                      </button>
                      <button onClick={openDeleteConfirm} className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition text-sm font-medium shadow-md">
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
              <button onClick={() => setShowModal(false)} className="mt-3 w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition text-sm font-medium">
                Close
              </button>
            </>
            )}
          </DialogContent>
        </Dialog>

        <EditEventModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          eventData={editEventData}
          brands={brands}
          branchMap={branchMap}
          tenders={tenders}
          onSave={handleSaveEdit}
          isSaving={isSaving}
        />

        {/* Add Event Modal */}
        <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) setShowAddModal(false); }}>
          <DialogContent showCloseButton={false} className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
                <DialogTitle className="text-xl font-bold text-slate-900">Create New Event</DialogTitle>
              </div>
              <div className="p-6 space-y-4">
                <input
                  type="text"
                  placeholder="Event title *"
                  value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="datetime-local"
                    value={newEvent.start_date}
                    onChange={e => setNewEvent({ ...newEvent, start_date: e.target.value })}
                    className="border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                  <input
                    type="datetime-local"
                    value={newEvent.end_date}
                    onChange={e => setNewEvent({ ...newEvent, end_date: e.target.value })}
                    className="border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={newEvent.all_day}
                    onChange={e => setNewEvent({ ...newEvent, all_day: e.target.checked })}
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="text-sm">All day event</span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
                  <select
                    value={newEvent.brand_id}
                    onChange={e => {
                      const brandId = e.target.value;
                      setNewEvent({ ...newEvent, brand_id: brandId, branch_id: "" });
                    }}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  >
                    <option value="">Select brand (optional)</option>
                    {brands.map(b => <option key={b.brand_id} value={b.brand_id}>{b.displayName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Branch (Location)</label>
                  <select
                    value={newEvent.branch_id}
                    onChange={e => setNewEvent({ ...newEvent, branch_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    disabled={!newEvent.brand_id}
                  >
                    <option value="">Select branch</option>
                    {getBranchesForAdd().map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                  </select>
                  {!newEvent.brand_id && <p className="text-xs text-amber-600 mt-1">Select a brand first to see branches</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tender</label>
                  <select
                    value={newEvent.tender_id}
                    onChange={e => setNewEvent({ ...newEvent, tender_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  >
                    <option value="">Select tender (optional)</option>
                    {tenders.map(t => <option key={t.tender_id} value={t.tender_id}>{t.tender_name}</option>)}
                  </select>
                </div>
                <textarea
                  placeholder="Description"
                  rows={3}
                  value={newEvent.description}
                  onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none"
                />
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
                <button onClick={() => setShowAddModal(false)} className="px-5 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 transition font-medium">Cancel</button>
                <button onClick={handleAddEvent} className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-xl font-medium shadow-md transition">Create Event</button>
              </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ---------- Global CSS Overrides ---------- */}
    </div>
  );
}