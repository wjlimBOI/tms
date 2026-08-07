"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "@/app/providers/ThemeProvider";
import { ROLE_IDS } from "@/lib/roles";

interface SearchResult {
  id: number;
  title: string;
  subtitle: string;
  link: string;
  type: "tender" | "bq";
  matchedOn?: string;
}

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

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

const FAKE_MESSAGES = [
  { id: 1, unread: true, sender: "Raj Kumar", initials: "RK", color: "bg-violet-500", preview: "Can you send over the revised BQ for Block C?", time: "10:42 AM", tag: "Contractor" },
  { id: 2, unread: true, sender: "Finance Team", initials: "FT", color: "bg-emerald-500", preview: "Q2 budget reconciliation needs your sign-off.", time: "9:15 AM", tag: "Internal" },
  { id: 3, unread: false, sender: "Amanda Loh", initials: "AL", color: "bg-rose-500", preview: "Meeting rescheduled to Thursday 3pm.", time: "Yesterday", tag: "Management" },
  { id: 4, unread: false, sender: "Site Team", initials: "ST", color: "bg-amber-500", preview: "Level 4 inspection completed. Report attached.", time: "Mon", tag: "Team" },
];

const IconBell = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
  </svg>
);

const IconInbox = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
  </svg>
);

const IconSun = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
  </svg>
);

const IconMoon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
  </svg>
);

const IconSearch = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ tenders: SearchResult[]; bqs: SearchResult[] }>({
    tenders: [],
    bqs: [],
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [notiItems, setNotiItems] = useState<NotificationItem[]>([]);
  const [msgItems, setMsgItems] = useState(FAKE_MESSAGES);
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  const [searchType, setSearchType] = useState<"all" | "tender" | "bq">("all");

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notiRef = useRef<HTMLDivElement>(null);
  const inboxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<number | undefined>(undefined);

  const userRole = (session?.user as any)?.role_id;
  const isContractor = userRole === ROLE_IDS.CONTRACTOR;
  const isAdmin = userRole === ROLE_IDS.ADMIN;
  const isManagement = userRole === 2 || userRole === 3 || userRole === 4;
  const isFinance = userRole === 8;
  const canSeeProjectTools = !isContractor;
  const isLoggedIn = !!session;
  const isHomepage = pathname === "/";
  const isLoginPage = pathname === "/login";
  const isExpressInterest = pathname === "/contractor/expressInterest";
  const isPublicMode = (!isLoggedIn && (isHomepage || isLoginPage)) || isExpressInterest;

  const unreadNoti = notiItems.filter((n) => !n.is_read).length;
  const unreadMsg = msgItems.filter((m) => m.unread).length;

  // `/` renders its own complete nav (`.apple-nav` in `src/app/page.tsx`),
  // fixed at the same position/z-index as this one. Rendering both stacked
  // duplicate landmarks and left this Navbar's logo/theme-toggle/Login
  // controls focusable-but-invisible underneath it. This one now defers to
  // the homepage's own nav entirely rather than fixing the overlap with
  // z-index tricks — the homepage nav already covers the same needs
  // (branding + a primary CTA + a Login link).
  if (isHomepage) return null;

  const fetchSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults({ tenders: [], bqs: [] }); setIsSearchOpen(false); return; }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${searchType}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSearchResults(data);
      setIsSearchOpen((data.tenders?.length || 0) > 0 || (data.bqs?.length || 0) > 0);
    } catch { setSearchResults({ tenders: [], bqs: [] }); setIsSearchOpen(false); }
  }, [searchType]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => fetchSearch(searchQuery), 300);
    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery, fetchSearch]);

  useEffect(() => {
    if (isMobileSearchExpanded && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [isMobileSearchExpanded]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotiItems(data.notifications || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchNotifications();
  }, [isLoggedIn, fetchNotifications]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t) && !menuBtnRef.current?.contains(t)) setIsMenuOpen(false);
      if (profileRef.current && !profileRef.current.contains(t)) setIsProfileOpen(false);
      if (notiRef.current && !notiRef.current.contains(t)) setIsNotiOpen(false);
      if (inboxRef.current && !inboxRef.current.contains(t)) setIsInboxOpen(false);
      if (searchRef.current && !searchRef.current.contains(t) && !isMobileSearchExpanded) setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isMobileSearchExpanded]);

  const closeAll = (except?: "menu" | "profile" | "noti" | "inbox") => {
    if (except !== "menu") setIsMenuOpen(false);
    if (except !== "profile") setIsProfileOpen(false);
    if (except !== "noti") setIsNotiOpen(false);
    if (except !== "inbox") setIsInboxOpen(false);
  };

  const userName = session?.user?.name || "User";
  const userEmail = (session?.user as any)?.email || "";
  const userInitial = userName.charAt(0).toUpperCase();

  const handleSearchClick = (link: string) => {
    setSearchQuery("");
    setIsSearchOpen(false);
    setIsMobileSearchExpanded(false);
    router.push(link);
  };

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  const Logo = ({ cls }: { cls: string }) =>
    !logoError ? (
      <img src="/logos/boi.png" alt="Beauty One International" className={cls} onError={() => setLogoError(true)} />
    ) : (
      <span className="font-bold text-[#15406a] dark:text-cyan-400 text-base tracking-wide">BOI</span>
    );

  const NavLink = ({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <Link
      href={href}
      onClick={() => setIsMenuOpen(false)}
      className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-[#15406a] dark:hover:text-cyan-400 transition-colors duration-150 whitespace-nowrap"
    >
      <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 w-4">{icon}</span>
      {children}
    </Link>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{children}</p>
  );

  const Divider = () => <div className="border-t border-gray-100 dark:border-gray-800 mx-3 my-1" />;

  const Badge = ({ count }: { count: number }) =>
    count > 0 ? (
      <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center leading-none">
        {count > 9 ? "9+" : count}
      </span>
    ) : null;

  const icons = {
    tender:    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    building:  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
    calendar:  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    compare:   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>,
    chart:     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 01 3 19.875v-6.75Zm9.75-8.25c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v15C22.5 20.496 21.996 21 21.375 21h-2.25a1.125 1.125 0 01-1.125-1.125V4.875Zm-9.75 0C3 4.254 3.504 3.75 4.125 3.75h2.25C7.496 3.75 8 4.254 8 4.875v6.75c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 01 3 11.625v-6.75Z" /></svg>,
    users:     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0Z" /></svg>,
    clipboard: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
    lock:      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25Z" /></svg>,
    currency:  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0Z" /></svg>,
    eye:       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" /></svg>,
    profile:   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0ZM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>,
    signout:   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>,
  };

  // Loading state
  if (status === "loading") {
    return (
      <nav className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-sm sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <Link href="/" className="flex-shrink-0">
              <Logo cls="h-8 sm:h-10 md:h-12 w-auto object-contain" />
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  // Public navbar (now also shown on /contractor/expressInterest)
  if (isPublicMode) {
    return (
      <nav className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-sm sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <Link href="/" className="flex-shrink-0">
              <Logo cls="h-8 sm:h-10 md:h-12 w-auto object-contain" />
            </Link>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#15406a] dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
                aria-label="Toggle dark mode"
              >
                {theme === 'light' ? <IconMoon /> : <IconSun />}
              </button>
              <button
                onClick={() => router.push("/login")}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-5 py-2 rounded-full text-sm font-medium shadow-md transition-all duration-200 hover:-translate-y-0.5"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Authenticated navbar
  return (
    <nav className="w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800">
      <div className="w-full px-2 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 sm:h-16 gap-2 sm:gap-4">
          {/* Left: hamburger + logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              ref={menuBtnRef}
              onClick={() => { closeAll("menu"); setIsMenuOpen((o) => !o); }}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#15406a] dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors focus:outline-none"
              aria-label="Toggle menu"
            >
              {isMenuOpen
                ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              }
            </button>
            <Link href="/" className="block">
              <Logo cls="h-8 sm:h-10 md:h-12 w-auto object-contain" />
            </Link>
          </div>

          {/* DESKTOP SEARCH */}
          <div className="hidden md:block flex-1 min-w-0 relative" ref={searchRef}>
            <div className="relative max-w-2xl">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search projects or estimates…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-full py-2 pl-9 pr-4 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#15406a]/30 dark:focus:ring-cyan-500/30 focus:border-[#15406a]/40 dark:focus:border-cyan-500/40 transition"
              />
            </div>
            {isSearchOpen && (searchResults.tenders.length > 0 || searchResults.bqs.length > 0) && (
              <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto">
                <div className="flex gap-1 px-4 pt-2 pb-1 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
                  <button onClick={() => setSearchType("all")} className={`text-xs px-2 py-0.5 rounded-full transition ${searchType === "all" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>All</button>
                  <button onClick={() => setSearchType("tender")} className={`text-xs px-2 py-0.5 rounded-full transition ${searchType === "tender" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>Projects</button>
                  <button onClick={() => setSearchType("bq")} className={`text-xs px-2 py-0.5 rounded-full transition ${searchType === "bq" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>BQs</button>
                </div>
                {searchResults.tenders.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Projects</p>
                    {searchResults.tenders.map((item) => (
                      <button key={`t-${item.id}`} onClick={() => handleSearchClick(item.link)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.subtitle}</p>
                        {item.matchedOn && <p className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-1">Matched on: {item.matchedOn}</p>}
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.bqs.length > 0 && (
                  <div className={searchResults.tenders.length > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""}>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Bill of Quantities</p>
                    {searchResults.bqs.map((item) => (
                      <button key={`bq-${item.id}`} onClick={() => handleSearchClick(item.link)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.subtitle}</p>
                        {item.matchedOn && <p className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-1">Matched on: {item.matchedOn}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MOBILE SEARCH OVERLAY */}
          {isMobileSearchExpanded && (
            <div className="fixed inset-x-0 top-0 z-[60] bg-white dark:bg-gray-900 shadow-lg p-3 flex items-center gap-2 animate-in slide-in-from-top duration-200">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={mobileSearchInputRef}
                  type="text"
                  placeholder="Search projects or estimates…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-full py-2 pl-9 pr-4 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#15406a]/30 dark:focus:ring-cyan-500/30"
                />
              </div>
              <button
                onClick={() => {
                  setIsMobileSearchExpanded(false);
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Right-side icons */}
          {!isMobileSearchExpanded && (
            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
              <button
                onClick={() => setIsMobileSearchExpanded(true)}
                className="md:hidden relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#15406a] dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
                aria-label="Search"
              >
                <IconSearch />
              </button>

              <div className="relative" ref={notiRef}>
                <button onClick={() => { closeAll("noti"); setIsNotiOpen((o) => !o); }} className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#15406a] dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors focus:outline-none">
                  <IconBell />
                  <Badge count={unreadNoti} />
                </button>
                {isNotiOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                      <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notifications</p><p className="text-[11px] text-gray-400 dark:text-gray-500">{unreadNoti} unread</p></div>
                      <button
                        onClick={async () => {
                          setNotiItems((n) => n.map((x) => ({ ...x, is_read: true })));
                          await fetch("/api/notifications/mark-all-read", { method: "POST" });
                        }}
                        className="text-[11px] text-[#15406a] dark:text-cyan-400 hover:underline font-medium"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                      {notiItems.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">No notifications yet.</p>
                      ) : (
                        notiItems.map((n) => (
                          <button
                            key={n.notification_id}
                            onClick={async () => {
                              setIsNotiOpen(false);
                              if (!n.is_read) {
                                setNotiItems((prev) => prev.map((x) => x.notification_id === n.notification_id ? { ...x, is_read: true } : x));
                                fetch(`/api/notifications/${n.notification_id}`, { method: "PATCH" });
                              }
                              if (n.link) router.push(n.link);
                            }}
                            className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors ${!n.is_read ? "bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-gray-800"}`}
                          >
                            <span className="text-xl leading-none mt-0.5 flex-shrink-0">{notificationIcon(n.title)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2"><p className={`text-xs font-semibold truncate ${!n.is_read ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}>{n.title}</p>{!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}</div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{relativeTime(n.created_at)}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={inboxRef}>
                <button onClick={() => { closeAll("inbox"); setIsInboxOpen((o) => !o); }} className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#15406a] dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors focus:outline-none">
                  <IconInbox />
                  <Badge count={unreadMsg} />
                </button>
                {isInboxOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                      <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Messages</p><p className="text-[11px] text-gray-400 dark:text-gray-500">{unreadMsg} unread conversations</p></div>
                      <button className="text-[11px] text-[#15406a] dark:text-cyan-400 hover:underline font-medium">New message</button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                      {msgItems.map((m) => (
                        <button key={m.id} onClick={() => setMsgItems((prev) => prev.map((x) => x.id === m.id ? { ...x, unread: false } : x))} className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${m.unread ? "bg-blue-50/40 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-gray-800"}`}>
                          <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${m.color}`}>{m.initials}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between"><p className={`text-xs font-semibold truncate ${m.unread ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}>{m.sender}</p><span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-1">{m.time}</span></div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{m.preview}</p>
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400">{m.tag}</span>
                          </div>
                          {m.unread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-center"><button className="text-xs text-[#15406a] dark:text-cyan-400 hover:underline font-medium">Open full inbox</button></div>
                  </div>
                )}
              </div>

              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#15406a] dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors focus:outline-none"
                aria-label="Toggle dark mode"
              >
                {theme === 'light' ? <IconMoon /> : <IconSun />}
              </button>

              <div className="relative ml-1" ref={profileRef}>
                <button onClick={() => { closeAll("profile"); setIsProfileOpen((o) => !o); }} className="h-8 w-8 rounded-full bg-gradient-to-br from-[#0d2d4a] to-[#15406a] dark:from-cyan-700 dark:to-blue-800 flex items-center justify-center text-white font-semibold text-sm hover:opacity-90 transition focus:outline-none">
                  {userInitial}
                </button>
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800"><p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{userName}</p><p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{userEmail}</p></div>
                    <Link href="/account/profile" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"><span className="text-gray-400 dark:text-gray-500">{icons.profile}</span> Your Profile</Link>
                    <button onClick={handleSignOut} className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><span>{icons.signout}</span> Sign Out</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hamburger Dropdown */}
      {isMenuOpen && (
        <div ref={menuRef} className="absolute left-0 top-full z-40 bg-white dark:bg-gray-900 border-r border-b border-gray-100 dark:border-gray-800 rounded-br-2xl shadow-2xl py-2 min-w-[200px]" style={{ width: "max-content" }}>
          <SectionLabel>Workspace</SectionLabel>
          <NavLink href="/tenders" icon={icons.tender}>Tenders</NavLink>
          {!isAdmin && <NavLink href="/bq/my" icon={icons.building}>Bill of Quantities</NavLink>}

          {isContractor && (
            <>
              <Divider />
              <SectionLabel>My Submissions</SectionLabel>
              <NavLink href="/tenders/my" icon={icons.clipboard}>My Tenders</NavLink>
            </>
          )}

          {isFinance && (
            <>
              <Divider />
              <SectionLabel>Finance & Budgeting</SectionLabel>
              <NavLink href="/bq/compare" icon={icons.currency}>Budget Overview</NavLink>
              <NavLink href="/bq/my"      icon={icons.chart}>Estimate Reports</NavLink>
              {/* Updated route */}
              <NavLink href="/analytics/budget-calculator" icon={icons.chart}>Budget Planner</NavLink>
            </>
          )}

          {isManagement && (
            <>
              <Divider />
              <SectionLabel>Management View</SectionLabel>
              <NavLink href="/calendar"   icon={icons.eye}>Project Overview</NavLink>
              <NavLink href="/bq/compare" icon={icons.chart}>Performance Reports</NavLink>
              {/* Updated route */}
              <NavLink href="/analytics/budget-calculator" icon={icons.chart}>Budget Planner</NavLink>
            </>
          )}

          {canSeeProjectTools && (
            <>
              <Divider />
              <SectionLabel>Planning</SectionLabel>
              <NavLink href="/calendar"   icon={icons.calendar}>Project Schedule</NavLink>
              <NavLink href="/bq/compare" icon={icons.compare}>Cost Comparison</NavLink>
            </>
          )}

          {/* ========== ADMIN SECTION ========== */}
          {isAdmin && (
            <>
              <Divider />
              <SectionLabel>Administration</SectionLabel>
              <NavLink href="/admin/users"        icon={icons.users}>User Management</NavLink>
              <NavLink href="/admin/bq-by-tender" icon={icons.clipboard}>BQs by Tender</NavLink>
              <NavLink href="/admin/branches"     icon={icons.building}>Branch Management</NavLink>
              <NavLink href="/admin/security"     icon={icons.lock}>Security Dashboard</NavLink>
              {/* Updated route */}
              <NavLink href="/analytics/budget-calculator" icon={icons.chart}>Budget Planner</NavLink>
            </>
          )}

          <div className="block md:hidden">
            <Divider />
            <SectionLabel>Appearance</SectionLabel>
            <button
              onClick={() => { toggleTheme(); setIsMenuOpen(false); }}
              className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-[#15406a] dark:hover:text-cyan-400 transition-colors duration-150 whitespace-nowrap w-full"
            >
              <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 w-4">
                {theme === 'light' ? <IconMoon /> : <IconSun />}
              </span>
              Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
            </button>
          </div>
          <div className="pb-1" />
        </div>
      )}
    </nav>
  );
}