"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import PushNotificationSetup from "./PushNotificationSetup";

type User = {
  id: string;
  name: string;
  mobile: string;
  role: "ADMIN" | "HR" | "EMPLOYEE";
  designation?: string;
  department?: string;
  dob?: string;
  doj?: string;
  exitDate?: string;
  status?: "ACTIVE" | "INACTIVE";
  photoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
};

type LeaveInfo = {
  records: { id: string; monthYear: string; leave: number; reason?: string }[];
  balance: { financialYear: string; earned: number; used: number; currentBalance: number; rows: { monthYear: string; earned: number; used: number; balance: number }[]; negativeBalanceWarning?: boolean; excessUsed?: number };
  yearwise: Record<string, number>;
};

type Section = "dashboard" | "employees" | "add" | "leaves" | "leaveRequests" | "reminder" | "notifications" | "chat" | "reset" | "audit" | "loginHistory" | "export" | "reports" | "permissions" | "recycle" | "systemHealth" | "profile";

function initialSection(user: User): Section {
  const fallback: Section = user.role === "EMPLOYEE" ? "profile" : "dashboard";
  if (typeof window === "undefined") return fallback;
  const requested = new URLSearchParams(window.location.search).get("section") as Section | null;
  const common: Section[] = ["leaveRequests", "notifications", "chat"];
  if (requested && common.includes(requested)) return requested;
  return fallback;
}

async function api(url: string, options?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (error) {
    if (typeof window !== "undefined" && isNetworkFailure(error)) {
      window.dispatchEvent(new Event("motisons-network-unavailable"));
    }
    throw error;
  }
  const json = await res.json();
  if (!json.ok) {
    const message = json.error || "Error";
    showToast(message, "error");
    throw new Error(message);
  }
  return json.data;
}

function isNetworkFailure(error: unknown) {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return error instanceof TypeError || /failed to fetch|unable to fetch|network|load failed/.test(message);
}

type ToastKind = "success" | "error" | "info";

function showToast(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent("motisons-toast", { detail: { message, kind } }));
}

let confirmRequestId = 0;
const confirmResolvers = new Map<number, (value: boolean) => void>();

function requestConfirm(title: string, message: string, confirmLabel = "Confirm"): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const id = ++confirmRequestId;
  return new Promise(resolve => {
    confirmResolvers.set(id, resolve);
    window.dispatchEvent(new CustomEvent("motisons-confirm", { detail: { id, title, message, confirmLabel } }));
  });
}

function avatar(u?: User | null, big = false) {
  const cls = big ? "avatar avatar-big" : "avatar";
  const initial = (u?.name || "?").charAt(0).toUpperCase();

  if (u?.photoUrl) {
    const src = u.photoUrl.startsWith("data:")
      ? u.photoUrl
      : `${u.photoUrl}?v=${u.updatedAt || ""}`;

    return <div className={`${cls} avatar-wrap`}><img src={src} alt={u.name} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /><span>{initial}</span></div>;
  }

  return <div className={cls}>{initial}</div>;
}

function mobileUrl(mobile?: string) {
  const num = String(mobile || "").replace(/\D/g, "");
  return num ? `https://wa.me/91${num.slice(-10)}` : "#";
}

function workingPeriod(doj?: string, exitDate?: string) {
  if (!doj) return "-";
  const [d, m, y] = doj.split("/").map(Number);
  const start = new Date(y, m - 1, d);
  const end = exitDate ? (() => { const [ed, em, ey] = exitDate.split("/").map(Number); return new Date(ey, em - 1, ed); })() : new Date();
  if (isNaN(start.getTime())) return "-";
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) { months--; days += 30; }
  if (months < 0) { years--; months += 12; }
  return `${years} Years ${months} Month ${days} Day`;
}

function isOnline(u?: User | null) {
  if (!u?.lastSeenAt) return false;
  return Date.now() - new Date(u.lastSeenAt).getTime() < 2 * 60 * 1000;
}

export default function DashboardApp() {
  const [session, setSession] = useState<User | null>(null);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [loginErr, setLoginErr] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [section, setSection] = useState<Section>("dashboard");
  const [dashboardFilter, setDashboardFilter] = useState("All Employees");
  const [dashboardQuick, setDashboardQuick] = useState({ q: "", status: "All", designation: "All", department: "All" });
  const [hrMobileFiltersOpen, setHrMobileFiltersOpen] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [filters, setFilters] = useState({ q: "", designation: "All" });
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [profileLeaves, setProfileLeaves] = useState<LeaveInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [rolePermissions, setRolePermissions] = useState<any>({
    hrCanEditEmployee: "true",
    hrCanDeleteEmployee: "false",
    hrCanResetPassword: "false",
    hrCanUploadLeaves: "true"
  });
  const [employeeListPage, setEmployeeListPage] = useState(1);
  const employeeEditScrollRef = useRef(0);

  function openEmployeeEdit(user: User) {
    employeeEditScrollRef.current = window.scrollY || document.documentElement.scrollTop || 0;
    setEditUser(user);
  }

  async function finishEmployeeEdit() {
    setEditUser(null);
    await loadEmployees();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: employeeEditScrollRef.current, left: 0, behavior: "auto" });
      });
    });
  }

  async function loadMe() {
    const data = await api("/api/auth/me");
    if (data.user) {
      setMenuOpen(false);
      setSession(data.user);
      setSection(initialSection(data.user));
    }
  }

  async function loadEmployees() {
    setEmployeesLoading(true);
    try {
      const data = await api("/api/employees");
      setEmployees(data.employees);
    } finally {
      setEmployeesLoading(false);
    }
  }

  async function hasInternetAccess() {
    if (!window.navigator.onLine) return false;
    try {
      await fetch(`/api/auth/me?connectionCheck=${Date.now()}`, { cache: "no-store" });
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    const markOffline = () => setIsOffline(true);
    const verifyOnline = async () => {
      const connected = await hasInternetAccess();
      setIsOffline(!connected);
      if (connected) setLoginErr(current => /internet connection/i.test(current) ? "" : current);
    };

    if (!window.navigator.onLine) markOffline();
    window.addEventListener("online", verifyOnline);
    window.addEventListener("offline", markOffline);
    window.addEventListener("motisons-network-unavailable", markOffline);
    loadMe().catch(error => {
      if (isNetworkFailure(error)) setIsOffline(true);
    });

    return () => {
      window.removeEventListener("online", verifyOnline);
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("motisons-network-unavailable", markOffline);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!session) return;
    loadEmployees().catch(e => setNotice(e.message));
    if (session.role === "ADMIN" || session.role === "HR") {
      api("/api/permissions").then(d => setRolePermissions(d.permissions)).catch(() => null);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const inactivityMs = 30 * 60 * 1000;
    let timer = window.setTimeout(handleInactive, inactivityMs);

    function resetTimer() {
      window.clearTimeout(timer);
      timer = window.setTimeout(handleInactive, inactivityMs);
    }

    async function handleInactive() {
      await api("/api/auth/logout", { method: "POST" }).catch(() => null);
      setMenuOpen(false);
      setSession(null);
      setEmployees([]);
      setLoginErr("Session expired after 30 minutes of inactivity. Please login again.");
    }

    const events: (keyof WindowEventMap)[] = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [session]);

  async function submitLogin(e?: React.FormEvent) {
    e?.preventDefault();
    if (!window.navigator.onLine) {
      setIsOffline(true);
      setLoginErr("No internet connection. Please connect mobile data or Wi-Fi and try again.");
      return;
    }
    setLoginErr("Logging in...");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(login),
        cache: "no-store",
        signal: controller.signal
      });

      const text = await res.text();
      if (!text) throw new Error(`Login server returned an empty response (HTTP ${res.status}).`);

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Login server returned an invalid response (HTTP ${res.status}).`);
      }

      if (!res.ok || !json.ok) throw new Error(json.error || `Login failed (HTTP ${res.status}).`);

      const data = json.data;
      setMenuOpen(false);
      setSession(data.user);
      setLoginErr("");
      setSection(initialSection(data.user));
    } catch (err: any) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        setLoginErr("Unable to connect. Please check your internet connection and try again.");
      }
      else if (err?.name === "AbortError") setLoginErr("Login server is not responding. Please check your internet connection and try again.");
      else setLoginErr(err?.message || "Login failed.");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setMenuOpen(false);
    setSession(null);
    setEmployees([]);
  }

  async function retryConnection() {
    const connected = await hasInternetAccess();
    if (!connected) {
      setIsOffline(true);
      setLoginErr("No internet connection. Please connect mobile data or Wi-Fi and try again.");
      return;
    }
    setIsOffline(false);
    setLoginErr("");
    window.location.reload();
  }

  async function loadProfileLeaves(u: User) {
    setProfileLeaves(null);
    setProfileLoading(true);
    try {
      const data = await api(`/api/employees/${u.id}/leaves`);
      setProfileLeaves(data);
    } catch (e: any) { setNotice(e.message); }
    setProfileLoading(false);
  }

  async function openProfile(u: User) {
    setProfileUser(u);
    await loadProfileLeaves(u);
  }

  useEffect(() => {
    if (notice) showToast(notice, "error");
  }, [notice]);

  if (!session) {
    return <div className="login-page"><form className="login-card" onSubmit={submitLogin}>
      <div className="logo-box">MS</div>
      <h1>Login</h1>
      <label>Username / Mobile</label><input value={login.username} onChange={e => setLogin({ ...login, username: e.target.value })} autoFocus />
      <label>Password</label>
      <div style={{ position: "relative" }}>
        <input
          type={showLoginPassword ? "text" : "password"}
          value={login.password}
          onChange={e => setLogin({ ...login, password: e.target.value })}
          style={{ paddingRight: 52 }}
        />
        <button
          type="button"
          onClick={() => setShowLoginPassword(v => !v)}
          aria-label={showLoginPassword ? "Hide password" : "Show password"}
          title={showLoginPassword ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 38,
            height: 38,
            border: 0,
            background: "transparent",
            color: "#0b5fa5",
            fontSize: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {showLoginPassword ? "🙈" : "👁️"}
        </button>
      </div>
      <button className="primary">Login</button>
      {loginErr && <div className={loginErr.includes("Logging in") ? "msg warn" : "msg error"}>{loginErr}</div>}
    </form>{isOffline && <OfflineNotice onRetry={retryConnection} />}</div>;
  }

  const isAdmin = session.role === "ADMIN" || session.role === "HR";
  const isSuperAdmin = session.role === "ADMIN";
  const isHr = session.role === "HR";
  const canEditEmployee = isSuperAdmin || rolePermissions.hrCanEditEmployee === "true";
  const canDeleteEmployee = isSuperAdmin || rolePermissions.hrCanDeleteEmployee === "true";
  const canResetPassword = isSuperAdmin || rolePermissions.hrCanResetPassword === "true";
  const canUploadLeaves = isSuperAdmin || rolePermissions.hrCanUploadLeaves === "true";

  // Admin user is only for system login/control. It should not be counted or shown as an employee.
  const employeeRows = employees.filter(e => e.role !== "ADMIN");
  const activeEmployeeRows = employeeRows.filter(e => String(e.status || "").toUpperCase() === "ACTIVE");
  const designations = Array.from(new Set(employeeRows.map(e => e.designation).filter(Boolean) as string[])).sort();
  const departments = Array.from(new Set(employeeRows.map(e => e.department).filter(Boolean) as string[])).sort();
  const filtered = employeeRows.filter(employee => {
    const query = filters.q.trim().toLowerCase();
    if (filters.designation !== "All" && employee.designation !== filters.designation) return false;
    if (query && !`${employee.name} ${employee.mobile} ${employee.designation || ""} ${employee.department || ""}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const missingDob = employeeRows.filter(e => !String(e.dob || "").trim()).length;
  const missingMobile = employeeRows.filter(e => !String(e.mobile || "").trim()).length;
  const missingDoj = employeeRows.filter(e => !String(e.doj || "").trim()).length;
  const affected = employeeRows.filter(e => !String(e.dob || "").trim() || !String(e.mobile || "").trim() || !String(e.doj || "").trim()).length;
  const dataQuality = { missingDob, missingMobile, missingDoj, affected };
  const globalMatches = globalSearch.trim()
    ? employeeRows.filter(e => `${e.name} ${e.mobile} ${e.designation || ""} ${e.department || ""}`.toLowerCase().includes(globalSearch.trim().toLowerCase())).slice(0, 8)
    : [];
  const sectionTitles: Record<Section, string> = {
    dashboard: "Dashboard", employees: "Employees", add: "Add Employee", leaves: "Leave Management", reminder: "Reminders",
    notifications: "Notifications", chat: "Chat", reset: "Reset Password", audit: "Audit Trail", loginHistory: "Login History",
    export: "Export Data", reports: "Leave Reports", permissions: "Permissions", recycle: "Recycle Bin", systemHealth: "System Health", profile: "My Profile",
    leaveRequests: "Leave Requests"
  };

  function isSalespersonEmployee(e: User) {
    const designation = String(e.designation || "").toLowerCase();

    // Salesperson means actual sales executive staff only.
    // Supporting sales staff must NOT be counted in Salesperson.
    if (e.role !== "EMPLOYEE") return false;
    if (designation.includes("support")) return false;

    return designation.includes("sales executive");
  }

  function isSupportingEmployee(e: User) {
    const designation = String(e.designation || "").toLowerCase();

    // Supporting card/list must include only employees whose Designation contains Supporting/Support.
    // Department-based support or Accounts Support will not be counted here.
    return e.role === "EMPLOYEE" && designation.includes("support") && !/account/i.test(e.designation || "");
  }

  function isAccountsEmployee(e: User) {
    return e.role === "EMPLOYEE" && (/account/i.test(e.designation || "") || /account/i.test(e.department || ""));
  }

  function isHrEmployee(e: User) {
    return e.role === "HR" || /\b(hr|hrd)\b/i.test(e.designation || "") || /\b(hr|hrd)\b/i.test(e.department || "");
  }

  const cards = [
    ["Total Employees", activeEmployeeRows.filter(e => e.role === "EMPLOYEE").length],
    ["Salesperson", activeEmployeeRows.filter(isSalespersonEmployee).length],
    ["Supporting", activeEmployeeRows.filter(isSupportingEmployee).length],
    ["Accounts", activeEmployeeRows.filter(isAccountsEmployee).length],
    ["HR", activeEmployeeRows.filter(isHrEmployee).length]
  ];

  const dashboardRows = employeeRows.filter(e => {
    if (dashboardFilter === "Salesperson" && !isSalespersonEmployee(e)) return false;
    if (dashboardFilter === "Supporting" && !isSupportingEmployee(e)) return false;
    if (dashboardFilter === "Accounts" && !isAccountsEmployee(e)) return false;
    if (dashboardFilter === "HR" && !isHrEmployee(e)) return false;
    if (dashboardFilter === "All Employees" && e.role !== "EMPLOYEE") return false;

    if (dashboardQuick.status !== "All" && String(e.status || "") !== dashboardQuick.status) return false;
    if (dashboardQuick.designation !== "All" && e.designation !== dashboardQuick.designation) return false;
    if (dashboardQuick.department !== "All" && e.department !== dashboardQuick.department) return false;
    if (dashboardQuick.q && !`${e.name} ${e.mobile} ${e.designation || ""} ${e.department || ""}`.toLowerCase().includes(dashboardQuick.q.toLowerCase())) return false;
    return true;
  });

  function goto(s: Section) {
    setSection(s);
    setMenuOpen(false);
    if (session?.role === "EMPLOYEE") setProfileUser(null);
    if (s === "employees" || s === "dashboard") loadEmployees().catch(() => null);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  return <div className={isHr ? "app-shell admin-shell hr-shell" : isAdmin ? "app-shell admin-shell" : "app-shell employee-shell"}>
    <button className="mobile-menu" onClick={() => setMenuOpen(true)}>☰</button>
    <aside className={`${menuOpen ? "sidebar open" : "sidebar"}${isAdmin ? " admin-mobile-tools" : ""}`}>
      <div className="brand"><div className="logo-small">MS</div><div><b>Employee System</b><span>{session.role} Panel</span></div><button className="mobile-tools-close" type="button" aria-label="Close tools" onClick={() => setMenuOpen(false)}>×</button></div>
      <nav>
        {isAdmin && <MenuItem label="Dashboard" icon="▣" active={section === "dashboard"} onClick={() => goto("dashboard")} />}
        {isAdmin && <MenuItem label="Employees Details" icon="☷" active={section === "employees"} onClick={() => goto("employees")} />}
        {isAdmin && <MenuItem label="Add Employee" icon="+" active={section === "add"} onClick={() => goto("add")} />}
        {isAdmin && canUploadLeaves && <MenuItem label="Upload Leaves" icon="⇧" active={section === "leaves"} onClick={() => goto("leaves")} />}
        <MenuItem label="Leave Requests" icon="✓" active={section === "leaveRequests"} onClick={() => goto("leaveRequests")} />
        {isAdmin && <MenuItem label="Reminder" icon="★" active={section === "reminder"} onClick={() => goto("reminder")} />}
        <MenuItem label="Notification Center" icon="◴" active={section === "notifications"} onClick={() => goto("notifications")} />
        <MenuItem label="Chat" icon="✉" active={section === "chat"} onClick={() => goto("chat")} />
        {isAdmin && canResetPassword && <MenuItem label="Reset Password" icon="🔑" active={section === "reset"} onClick={() => goto("reset")} />}
        {isAdmin && <MenuItem label="Audit Trail" icon="◎" active={section === "audit"} onClick={() => goto("audit")} />}
        {isSuperAdmin && <MenuItem label="Login History" icon="◉" active={section === "loginHistory"} onClick={() => goto("loginHistory")} />}
        {isAdmin && <MenuItem label="Export Data" icon="⇩" active={section === "export"} onClick={() => goto("export")} />}
        {isAdmin && <MenuItem label="Leave Reports" icon="▤" active={section === "reports"} onClick={() => goto("reports")} />}
        {isSuperAdmin && <MenuItem label="Permissions" icon="⚙" active={section === "permissions"} onClick={() => goto("permissions")} />}
        {isAdmin && <MenuItem label="Recycle Bin" icon="♻" active={section === "recycle"} onClick={() => goto("recycle")} />}
        {isAdmin && <MenuItem label="System Health" icon="♡" active={section === "systemHealth"} onClick={() => goto("systemHealth")} />}
        {session.role === "EMPLOYEE" && <MenuItem label="My Details" icon="☷" active={section === "profile"} onClick={() => goto("profile")} />}
        <MenuItem label="Logout" icon="ↄ" active={false} onClick={logout} />
      </nav>
    </aside>
    {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}

    <main className="main">
      <div className={`app-topbar print-exclude${isHr && section !== "dashboard" ? " hr-no-global-search" : ""}`}>
        <div className="topbar-title"><span>Motisons Employee System</span><b>{sectionTitles[section]}</b></div>
        {session.role !== "EMPLOYEE" && (!isHr || section === "dashboard") && <div className="global-search-wrap">
          <span className="global-search-icon">⌕</span>
          <input aria-label="Global employee search" placeholder="Search employee, mobile, designation..." value={globalSearch} onFocus={() => setGlobalSearchOpen(true)} onChange={e => { setGlobalSearch(e.target.value); setGlobalSearchOpen(true); }} />
          {globalSearch && <button className="global-search-clear" type="button" onClick={() => { setGlobalSearch(""); setGlobalSearchOpen(false); }}>×</button>}
          {globalSearchOpen && globalSearch.trim() && <div className="global-search-results">
            {globalMatches.length ? globalMatches.map(u => <button key={u.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { openProfile(u); setGlobalSearchOpen(false); }}>{avatar(u)}<span><b><Highlight text={u.name} term={globalSearch} /></b><small>{u.designation || "-"} · {u.department || "-"} · <Highlight text={u.mobile} term={globalSearch} /></small></span></button>) : <div className="global-search-empty">No employee found</div>}
          </div>}
        </div>}
        {isAdmin && <button className={dataQuality.affected ? "quality-badge attention" : "quality-badge"} type="button" onClick={() => goto("employees")} title={`Missing DOB: ${dataQuality.missingDob}, Mobile: ${dataQuality.missingMobile}, DOJ: ${dataQuality.missingDoj}`}><span>Data Quality</span><b>{dataQuality.affected}</b></button>}
        {isAdmin && <button className="desktop-admin-tools" type="button" onClick={() => setMenuOpen(value => !value)}><span>☰</span><b>Tools</b></button>}
        <NotificationBell onOpen={() => goto("notifications")} />
      </div>
      {notice && <div className="msg warn" onClick={() => setNotice("")}>{notice}</div>}
      {section === "dashboard" && <section>
        <div className="dashboard-hero"><div><h1>{isHr ? "HR Dashboard" : "Admin Dashboard"}</h1></div><div className="dashboard-quality"><span>Data Quality</span><b>{dataQuality.affected ? `${dataQuality.affected} need attention` : "All key fields complete"}</b><small>DOB {dataQuality.missingDob} · Mobile {dataQuality.missingMobile} · DOJ {dataQuality.missingDoj}</small></div></div>
        <div className="cards dashboard-cards">{cards.map(c => <button className={dashboardFilter === c[0] || (dashboardFilter === "All Employees" && c[0] === "Total Employees") ? "stat stat-button active" : "stat stat-button"} key={c[0]} onClick={() => setDashboardFilter(c[0] === "Total Employees" ? "All Employees" : String(c[0]))}><span>{c[0]}</span><b>{c[1]}</b></button>)}</div>
        {isHr && <button className="hr-mobile-filter-toggle light" type="button" onClick={() => setHrMobileFiltersOpen(open => !open)}><span>⌕</span>{hrMobileFiltersOpen ? "Hide Filters" : "Search & Filters"}<b>{dashboardRows.length}</b></button>}
        <div className={`panel dashboard-filter-panel${isHr && hrMobileFiltersOpen ? " mobile-open" : ""}`}><div className="filters dashboard-quick">
          <input placeholder="Search dashboard" value={dashboardQuick.q} onChange={e => setDashboardQuick({ ...dashboardQuick, q: e.target.value })} />
          <select value={dashboardQuick.status} onChange={e => setDashboardQuick({ ...dashboardQuick, status: e.target.value })}><option>All</option><option>ACTIVE</option><option>INACTIVE</option></select>
          <select value={dashboardQuick.designation} onChange={e => setDashboardQuick({ ...dashboardQuick, designation: e.target.value })}><option>All</option>{designations.map(d => <option key={d}>{d}</option>)}</select>
          <select value={dashboardQuick.department} onChange={e => setDashboardQuick({ ...dashboardQuick, department: e.target.value })}><option>All</option>{departments.map(d => <option key={d}>{d}</option>)}</select>
        </div></div>
        <EmployeeTable title={dashboardFilter} employees={dashboardRows} clickable={false} onProfile={openProfile} onEdit={openEmployeeEdit} onReload={() => loadEmployees()} admin={false} showActions={false} searchTerm={dashboardQuick.q} loading={employeesLoading} />
      </section>}
      {section === "employees" && <section className="panel employees-section"><h1>Employees Details</h1><div className="filters">
        <input placeholder="Type or select name" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.designation} onChange={e => setFilters({ ...filters, designation: e.target.value })}><option>All</option>{designations.map(d => <option key={d}>{d}</option>)}</select>
      </div><EmployeeTable title="" employees={filtered} clickable onProfile={openProfile} onEdit={openEmployeeEdit} onReload={loadEmployees} admin={isAdmin} showActions bulkActions searchTerm={filters.q} canEdit={canEditEmployee} canDelete={canDeleteEmployee} loading={employeesLoading} page={employeeListPage} onPageChange={setEmployeeListPage} /></section>}
      {section === "add" && <EmployeeForm onSaved={() => { loadEmployees(); setSection("employees"); }} />}
      {section === "leaves" && isAdmin && canUploadLeaves && <LeavesUpload />}
      {section === "leaveRequests" && <LeaveRequests session={session} />}
      {section === "reminder" && <Reminder employees={activeEmployeeRows} />}
      {section === "notifications" && <Notifications session={session} employees={activeEmployeeRows} />}
      {section === "chat" && <Chat session={session} />}
      {section === "reset" && isAdmin && canResetPassword && <ResetPassword employees={activeEmployeeRows} />}
      {section === "audit" && isAdmin && <AuditTrail />}
      {section === "loginHistory" && isSuperAdmin && <LoginHistory />}
      {section === "export" && isAdmin && <ExportData />}
      {section === "reports" && isAdmin && <LeaveReports />}
      {section === "permissions" && isSuperAdmin && <PermissionsPanel session={session} />}
      {section === "recycle" && isAdmin && <RecycleBin />}
      {section === "systemHealth" && isAdmin && <SystemHealth />}
      {section === "profile" && session.role === "EMPLOYEE" && <MyProfile user={employeeRows.find(employee => employee.id === session.id) || employeeRows.find(employee => employee.mobile === session.mobile) || session} leaves={profileLeaves} loading={profileLoading} loadLeaves={loadProfileLeaves} />}
    </main>
    <nav className="mobile-bottom-nav print-exclude" aria-label="Mobile navigation">
      {isAdmin ? <>
        <MobileNavItem label="Home" icon="▣" active={section === "dashboard"} onClick={() => goto("dashboard")} />
        <MobileNavItem label="Team" icon="☷" active={section === "employees"} onClick={() => goto("employees")} />
      </> : <MobileNavItem label="Profile" icon="◎" active={section === "profile"} onClick={() => goto("profile")} />}
      <MobileNavItem label="Leave" icon="✓" active={section === "leaveRequests"} onClick={() => goto("leaveRequests")} />
      <MobileNavItem label="Alerts" icon="◴" active={section === "notifications"} onClick={() => goto("notifications")} />
      {!isAdmin && <MobileNavItem label="Chat" icon="✉" active={section === "chat"} onClick={() => goto("chat")} />}
      {isAdmin ? <MobileNavItem label="Tools" icon="☰" active={menuOpen} onClick={() => setMenuOpen(true)} /> : <MobileNavItem label="Logout" icon="↪" active={false} onClick={logout} />}
    </nav>
    {editUser && <EditEmployeeModal user={editUser} onClose={() => setEditUser(null)} onSaved={finishEmployeeEdit} />}
    {profileUser && section !== "profile" && <ProfileModal user={profileUser} leaves={profileLeaves} loading={profileLoading} onClose={() => setProfileUser(null)} employees={employeeRows} onSwitch={openProfile} />}
    <ToastHost />
    <ConfirmHost />
    <PushNotificationSetup employeeId={session.id} />
    {isOffline && <OfflineNotice onRetry={retryConnection} />}
  </div>;
}

function OfflineNotice({ onRetry }: { onRetry: () => void | Promise<void> }) {
  return <div className="offline-overlay" role="alertdialog" aria-modal="true" aria-label="No internet connection">
    <div className="offline-card">
      <div className="offline-icon">!</div>
      <h2>No Internet Connection</h2>
      <p>Please connect mobile data or Wi-Fi to continue using the Employee System.</p>
      <button className="primary" type="button" onClick={onRetry}>Retry Connection</button>
    </div>
  </div>;
}

function MenuItem(p: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return <button className={p.active ? "menu active" : "menu"} title={p.label} onClick={p.onClick}><span className="menu-icon">{p.icon}</span><b className="menu-label">{p.label}</b><i className="menu-active-dot" /></button>;
}

function MobileNavItem(p: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={p.active ? "mobile-nav-item active" : "mobile-nav-item"} onClick={p.onClick}><span>{p.icon}</span><b>{p.label}</b></button>;
}

function Highlight({ text, term }: { text?: any; term?: string }) {
  const value = String(text ?? "");
  const q = String(term || "").trim();
  if (!q) return <>{value}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = value.split(new RegExp(`(${escaped})`, "ig"));
  return <>{parts.map((part, index) => part.toLowerCase() === q.toLowerCase() ? <mark className="search-highlight" key={index}>{part}</mark> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}

function EmployeeTable({ title, employees, clickable, onProfile, onEdit, onReload, admin, showActions = true, bulkActions = false, searchTerm = "", canEdit = true, canDelete = true, loading = false, page: controlledPage, onPageChange }: { title: string; employees: User[]; clickable: boolean; onProfile: (u: User) => void; onEdit?: (u: User) => void; onReload: () => void; admin: boolean; showActions?: boolean; bulkActions?: boolean; searchTerm?: string; canEdit?: boolean; canDelete?: boolean; loading?: boolean; page?: number; onPageChange?: (page: number) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMsg, setBulkMsg] = useState("");
  const [localPage, setLocalPage] = useState(1);
  const page = controlledPage ?? localPage;
  const setPage = (next: number | ((current: number) => number)) => {
    const value = typeof next === "function" ? next(page) : next;
    if (onPageChange) onPageChange(value);
    else setLocalPage(value);
  };
  const [pageSize, setPageSize] = useState(25);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    photo: true,
    name: true,
    mobile: true,
    dob: true,
    designation: true,
    department: true,
    doj: true,
    role: true,
    status: true
  });

  const columnLabels: Record<string, string> = {
    photo: "Photo",
    name: "Name",
    mobile: "Mobile",
    dob: "DOB",
    designation: "Designation",
    department: "Department",
    doj: "DOJ",
    role: "Role",
    status: "Status"
  };

  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) setPageSize(10);
  }, []);

  const totalPages = Math.max(1, Math.ceil(employees.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageRows = employees.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    const visibleIds = new Set(employees.map(e => e.id));
    setSelected(current => current.filter(id => visibleIds.has(id)));
  }, [employees]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function del(id: string) {
    if (!(await requestConfirm("Move employee to Recycle Bin", "This employee will be moved to Recycle Bin and can be restored within 30 days.", "Move to Recycle Bin"))) return;
    await api(`/api/employees/${id}`, { method: "DELETE" });
    showToast("Employee moved to Recycle Bin.", "success");
    onReload();
  }

  function toggleAll() {
    const ids = pageRows.map(e => e.id);
    const allSelected = ids.length > 0 && ids.every(id => selected.includes(id));
    setSelected(allSelected ? selected.filter(id => !ids.includes(id)) : Array.from(new Set([...selected, ...ids])));
  }

  async function runBulk(action: "ACTIVATE" | "DEACTIVATE" | "CHANGE_DEPARTMENT" | "DELETE") {
    if (!selected.length) return setBulkMsg("Select at least one employee.");
    let department = "";
    if (action === "CHANGE_DEPARTMENT") {
      const value = prompt("Enter new department name:");
      if (value === null) return;
      department = value.trim();
      if (!department) return setBulkMsg("Department is required.");
    }
    if (action === "DELETE" && !(await requestConfirm("Move selected employees to Recycle Bin", `Move ${selected.length} selected employee(s) to Recycle Bin? They can be restored within 30 days.`, "Move Selected"))) return;
    try {
      const data = await api("/api/employees/bulk", {
        method: "POST",
        body: JSON.stringify({ action, ids: selected, department })
      });
      const successMessage = `${data.affected} employee(s) updated.${data.skipped ? ` ${data.skipped} skipped.` : ""}`;
      setBulkMsg(successMessage);
      showToast(successMessage, "success");
      setSelected([]);
      onReload();
    } catch (e: any) {
      setBulkMsg(e.message);
    }
  }

  async function exportSelected() {
    if (!selected.length) return setBulkMsg("Select at least one employee.");
    try {
      const res = await fetch(`/api/employees/bulk?ids=${encodeURIComponent(selected.join(","))}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `selected-employees-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBulkMsg(`${selected.length} selected employee(s) exported.`);
      showToast(`${selected.length} selected employee(s) exported.`, "success");
    } catch (e: any) {
      setBulkMsg(e.message);
    }
  }

  function exportCurrentView() {
    const keys = Object.keys(columnLabels).filter(key => visibleColumns[key] && key !== "photo");
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["S.No", ...keys.map(key => columnLabels[key])].map(quote).join(","),
      ...employees.map((employee, index) => [
        index + 1,
        ...keys.map(key => (employee as any)[key] ?? "")
      ].map(quote).join(","))
    ];
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employees-current-view-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Current employee view exported.", "success");
  }

  const allSelected = pageRows.length > 0 && pageRows.every(e => selected.includes(e.id));

  return <div className="panel table-panel compact-table employee-data-table">{title && <h2>{title}</h2>}
    <div className="employee-table-tools">
      <div className="column-picker">
        <button className="light" type="button" onClick={() => setShowColumnMenu(value => !value)}>Columns</button>
        {showColumnMenu && <div className="column-menu">{Object.entries(columnLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={visibleColumns[key]} onChange={event => setVisibleColumns({ ...visibleColumns, [key]: event.target.checked })} /> {label}</label>)}</div>}
      </div>
      <button className="light" type="button" onClick={exportCurrentView}>Export Current View</button>
      <label className="page-size-control">Rows <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
    </div>
    {bulkActions && admin && <div className="bulk-employee-bar">
      <b>{selected.length} selected</b>
      {canEdit && <button className="light" onClick={() => runBulk("ACTIVATE")}>Activate</button>}
      {canEdit && <button className="light" onClick={() => runBulk("DEACTIVATE")}>Deactivate</button>}
      {canEdit && <button className="light" onClick={() => runBulk("CHANGE_DEPARTMENT")}>Change Department</button>}
      <button className="light" onClick={exportSelected}>Export Selected</button>
      {canDelete && <button className="light danger-action" onClick={() => runBulk("DELETE")}>Delete Selected</button>}
    </div>}
    {bulkMsg && bulkActions && <div className="msg warn">{bulkMsg}</div>}
    <div className="table-wrap"><table><thead><tr>{bulkActions && admin && <th><input type="checkbox" aria-label="Select all employees on this page" checked={allSelected} onChange={toggleAll} /></th>}<th>S.No</th>{visibleColumns.photo && <th>Photo</th>}{visibleColumns.name && <th>Name</th>}{visibleColumns.mobile && <th>Mobile</th>}{visibleColumns.dob && <th>DOB</th>}{visibleColumns.designation && <th>Designation</th>}{visibleColumns.department && <th>Department</th>}{visibleColumns.doj && <th>DOJ</th>}{visibleColumns.role && <th>Role</th>}{visibleColumns.status && <th>Status</th>}{showActions && <th>Action</th>}</tr></thead><tbody>
    {loading ? Array.from({ length: 6 }).map((_, index) => <tr className="skeleton-row" key={`skeleton-${index}`}><td colSpan={12}><span className="skeleton-line" /></td></tr>) : pageRows.length ? pageRows.map((e, index) => <tr className={selected.includes(e.id) ? "employee-row selected" : "employee-row"} key={e.id}>
      {bulkActions && admin && <td><input type="checkbox" aria-label={`Select ${e.name}`} checked={selected.includes(e.id)} onChange={event => setSelected(event.target.checked ? Array.from(new Set([...selected, e.id])) : selected.filter(id => id !== e.id))} /></td>}
      <td>{startIndex + index + 1}</td>
      {visibleColumns.photo && <td>{avatar(e)}</td>}
      {visibleColumns.name && <td>{clickable ? <button className="link" onClick={() => onProfile(e)}><Highlight text={e.name} term={searchTerm} /></button> : <Highlight text={e.name} term={searchTerm} />}</td>}
      {visibleColumns.mobile && <td><Highlight text={e.mobile} term={searchTerm} /></td>}
      {visibleColumns.dob && <td>{e.dob}</td>}
      {visibleColumns.designation && <td><Highlight text={e.designation} term={searchTerm} /></td>}
      {visibleColumns.department && <td><Highlight text={e.department} term={searchTerm} /></td>}
      {visibleColumns.doj && <td>{e.doj}</td>}
      {visibleColumns.role && <td><span className="pill">{e.role}</span></td>}
      {visibleColumns.status && <td><span className={e.status === "ACTIVE" ? "pill ok" : "pill danger"}>{e.status}</span></td>}
      {showActions && <td>{admin && e.role !== "ADMIN" && <div className="action-buttons">{canEdit && <button className="light" onClick={() => onEdit?.(e)}>Edit</button>}{canDelete && <button className="light" onClick={() => del(e.id)}>Delete</button>}</div>}</td>}
    </tr>) : <tr><td className="table-empty-cell" colSpan={12}><div className="empty-table-state"><span>⌕</span><b>No employee records found</b></div></td></tr>}
  </tbody></table></div>
  <div className="employee-mobile-list">
    {loading ? Array.from({ length: 4 }).map((_, index) => <div className="employee-mobile-card" key={`mobile-skeleton-${index}`}><span className="skeleton-line" /></div>) : pageRows.length ? pageRows.map(e => <div className={`${selected.includes(e.id) ? "employee-mobile-card selected" : "employee-mobile-card"}${bulkActions && admin ? " has-select" : ""}`} key={`mobile-${e.id}`}>
      {bulkActions && admin && <input className="employee-mobile-select" type="checkbox" aria-label={`Select ${e.name}`} checked={selected.includes(e.id)} onChange={event => setSelected(event.target.checked ? Array.from(new Set([...selected, e.id])) : selected.filter(id => id !== e.id))} />}
      {avatar(e)}
      <div className="employee-mobile-main"><b>{e.name}</b><span>{e.designation || "-"}{e.department ? ` · ${e.department}` : ""}</span><small>{e.mobile || "-"}</small></div>
      <span className={e.status === "ACTIVE" ? "pill ok" : "pill danger"}>{e.status}</span>
      {(clickable || (showActions && admin && e.role !== "ADMIN")) && <div className="employee-mobile-actions">
        {clickable && <button className="light" onClick={() => onProfile(e)}>View</button>}
        {showActions && admin && e.role !== "ADMIN" && canEdit && <button className="light" onClick={() => onEdit?.(e)}>Edit</button>}
        {showActions && admin && e.role !== "ADMIN" && canDelete && <button className="light danger-action" onClick={() => del(e.id)}>Delete</button>}
      </div>}
    </div>) : <div className="empty-state">No employee records found</div>}
  </div>
  <div className="pagination-bar"><span>Showing {employees.length ? startIndex + 1 : 0}-{Math.min(startIndex + pageRows.length, employees.length)} of {employees.length}</span><div><button className="light" disabled={safePage <= 1} onClick={() => setPage(1)}>First</button><button className="light" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button><b>Page {safePage} / {totalPages}</b><button className="light" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button><button className="light" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>Last</button></div></div>
  </div>;
}

function EditEmployeeModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState<any>({
    name: user.name || "",
    mobile: user.mobile || "",
    password: "",
    dob: user.dob || "",
    role: user.role || "EMPLOYEE",
    designation: user.designation || "",
    department: user.department || "",
    doj: user.doj || "",
    exitDate: user.exitDate || "",
    status: user.status || "ACTIVE"
  });
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const escClose = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escClose);
    return () => window.removeEventListener("keydown", escClose);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Updating employee...");
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      await api(`/api/employees/${user.id}`, { method: "PUT", body: JSON.stringify(payload) });
      if (file) {
        const fd = new FormData();
        fd.append("photo", file);
        await api(`/api/employees/${user.id}/photo`, { method: "POST", body: fd });
      }
      setMsg("Employee updated.");
      await onSaved();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  const field = (k: string, label: string, type = "text") => <div><label>{label}</label><input type={type} value={form[k] || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} /></div>;

  return <div className="modal" onMouseDown={onClose}>
    <div className="modal-box wide" onMouseDown={e => e.stopPropagation()}>
      <button className="close" type="button" onClick={onClose}>×</button>
      <div className="edit-head">{avatar(user, true)}<div><h1>Edit Employee</h1><p>{user.name}</p></div></div>
      <form className="employee-form edit-form" onSubmit={save}>
        {field("name", "Name")}
        {field("mobile", "Username / Mobile")}
        {field("password", "New Password (blank = no change)", "text")}
        {field("dob", "Date of Birth DD/MM/YYYY")}
        <div><label>Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option>EMPLOYEE</option><option>HR</option><option>ADMIN</option></select></div>
        {field("designation", "Designation")}
        {field("department", "Department")}
        {field("doj", "Date of Joining DD/MM/YYYY")}
        {field("exitDate", "Exit / Leave Date DD/MM/YYYY")}
        <div><label>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>ACTIVE</option><option>INACTIVE</option></select></div>
        <div><label>Update Photo</label><input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
        <button className="primary">Update Employee</button>
        {msg && <div className="msg warn">{msg}</div>}
      </form>
    </div>
  </div>;
}

function UploadFormatDownload({ type }: { type: "employees" | "leaves" }) {
  const isEmployees = type === "employees";
  const href = isEmployees ? "/templates/employee-upload-template.xlsx" : "/templates/leave-upload-template.xlsx";
  const fileName = isEmployees ? "employee-upload-template.xlsx" : "leave-upload-template.xlsx";
  return <div className="bulk import-box">
    <div>
      <b>Upload File Format</b>
    </div>
    <a className="light button-link" href={href} download={fileName}>Download Excel Format</a>
  </div>;
}

function EmployeeForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<any>({ role: "EMPLOYEE", status: "ACTIVE", password: "1234" });
  const [file, setFile] = useState<File | null>(null);
  const [bulk, setBulk] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Saving employee...");
    try {
      const data = await api("/api/employees", { method: "POST", body: JSON.stringify(form) });
      if (file) {
        const fd = new FormData();
        fd.append("photo", file);
        await api(`/api/employees/${data.employee.id}/photo`, { method: "POST", body: fd });
      }
      setMsg("Employee saved.");
      onSaved();
    } catch (e: any) { setMsg(e.message); }
  }

  async function previewBulk() {
    if (!bulk) return setMsg("Select employee Excel.");
    setMsg("Checking employee Excel...");
    const fd = new FormData();
    fd.append("file", bulk);
    try {
      const d = await api("/api/employees/import/preview", { method: "POST", body: fd });
      setPreview(d);
      setMsg("Preview ready. Check summary before upload.");
    } catch (e: any) { setMsg(e.message); }
  }

  async function uploadBulk() {
    if (!bulk) return setMsg("Select employee Excel.");
    setMsg("Uploading employees...");
    const fd = new FormData();
    fd.append("file", bulk);
    try {
      const d = await api("/api/employees/import", { method: "POST", body: fd });
      setMsg(`Added ${d.added}, Updated ${d.updated}, Skipped ${d.skipped}`);
      setPreview(null);
      onSaved();
    } catch (e: any) { setMsg(e.message); }
  }

  const field = (k: string, label: string) => <div><label>{label}</label><input value={form[k] || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} /></div>;

  return <section className="panel"><h1>Add Employee</h1>
    <UploadFormatDownload type="employees" />
    <div className="bulk import-box">
      <input type="file" accept=".xlsx" onChange={e => { setBulk(e.target.files?.[0] || null); setPreview(null); }} />
      <button className="light" onClick={previewBulk}>Preview Excel</button>
      <button className="primary" onClick={uploadBulk} disabled={!preview}>Confirm Upload</button>
    </div>
    {preview && <ImportPreview title="Employee Import Preview" data={preview} />}
    <form className="employee-form" onSubmit={save}>
      {field("name", "Name")}{field("mobile", "Username / Mobile")}{field("password", "Password")}{field("dob", "Date of Birth DD/MM/YYYY")}
      <div><label>Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option>EMPLOYEE</option><option>HR</option><option>ADMIN</option></select></div>
      {field("designation", "Designation")}{field("department", "Department")}{field("doj", "Date of Joining DD/MM/YYYY")}{field("exitDate", "Exit / Leave Date DD/MM/YYYY")}
      <div><label>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>ACTIVE</option><option>INACTIVE</option></select></div>
      <div><label>Photo</label><input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
      <button className="primary">Save Employee</button>{msg && <div className="msg warn">{msg}</div>}
    </form>
  </section>;
}

function LeavesUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [editLeave, setEditLeave] = useState("");
  const [editReason, setEditReason] = useState("");
  const [manualEmployees, setManualEmployees] = useState<User[]>([]);
  const [manualEmployeeId, setManualEmployeeId] = useState("");
  const [manualMonth, setManualMonth] = useState("");
  const [manualLeave, setManualLeave] = useState("");
  const [manualReason, setManualReason] = useState("");

  function pickerToMonthYear(value: string) {
    if (!value) return "";
    const [year, month] = value.split("-");
    return month && year ? `${month}/${year}` : "";
  }

  async function loadHistory(nextSearch = search, nextMonth = monthFilter) {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      const monthYear = pickerToMonthYear(nextMonth);
      if (monthYear) params.set("monthYear", monthYear);
      const d = await api(`/api/leaves/history?${params.toString()}`);
      setHistory(d.records || []);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadHistory("", "");
    api("/api/employees").then(d => setManualEmployees((d.employees || []).filter((e: User) => e.role !== "ADMIN"))).catch(() => null);
  }, []);

  async function addManualLeave() {
    if (!manualEmployeeId) return setMsg("Select employee.");
    if (!manualMonth) return setMsg("Select month.");
    const leave = Number(manualLeave);
    if (!Number.isFinite(leave) || leave < 0) return setMsg("Leave must be a valid number 0 or greater.");

    try {
      const d = await api("/api/leaves/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: manualEmployeeId, monthYear: pickerToMonthYear(manualMonth), leave, reason: manualReason })
      });
      const successMessage = `${d.updated ? "Leave updated" : "Leave added"} for ${d.employeeName} (${d.monthYear}).`;
      setMsg(successMessage);
      showToast(successMessage, "success");
      setManualLeave("");
      setManualReason("");
      if (d.negativeBalance?.warning) showToast(`Warning: leave usage exceeds available balance by ${d.negativeBalance.excess}.`, "error");
      await loadHistory();
    } catch (e: any) { setMsg(e.message); }
  }

  async function previewExcel() {
    if (!file) return setMsg("Select leave Excel.");
    setMsg("Checking leave Excel...");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const d = await api("/api/leaves/import/preview", { method: "POST", body: fd });
      setPreview(d);
      setMsg("Preview ready. Check summary before upload.");
    } catch (e: any) { setMsg(e.message); }
  }

  async function upload() {
    if (!file) return setMsg("Select leave Excel.");
    setMsg("Uploading leave Excel...");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const d = await api("/api/leaves/import", { method: "POST", body: fd });
      const successMessage = `Upload complete — Total ${d.totalRows}, New ${d.added}, Updated ${d.updated}, Skipped ${d.skipped}, Duplicate rows ${d.duplicatesInFile}${d.missing?.length ? `, Mismatch: ${d.missing.join(", ")}` : ""}`;
      setMsg(successMessage);
      showToast(successMessage, "success");
      setPreview(null);
      setFile(null);
      await loadHistory();
    } catch (e: any) { setMsg(e.message); }
  }

  async function saveEdit() {
    if (!editing) return;
    const leave = Number(editLeave);
    if (!Number.isFinite(leave) || leave < 0) return setMsg("Leave must be a valid number 0 or greater.");
    try {
      const d = await api("/api/leaves/history", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, leave, reason: editReason }) });
      setEditing(null);
      setEditLeave("");
      setEditReason("");
      if (d.negativeBalance?.warning) showToast(`Warning: leave usage exceeds available balance by ${d.negativeBalance.excess}.`, "error");
      const successMessage = `Leave updated for ${editing.employee.name} (${editing.monthYear}).`;
      setMsg(successMessage);
      showToast(successMessage, "success");
      await loadHistory();
    } catch (e: any) { setMsg(e.message); }
  }

  async function deleteOne(record: any) {
    if (!(await requestConfirm("Move leave to Recycle Bin", `Move ${record.employee.name}'s leave for ${record.monthYear} to Recycle Bin?`, "Move to Recycle Bin"))) return;
    try {
      const d = await api(`/api/leaves/history?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
      setMsg(`Moved ${d.deleted} leave record to Recycle Bin.`);
      showToast(`Moved ${d.deleted} leave record to Recycle Bin.`, "success");
      await loadHistory();
    } catch (e: any) { setMsg(e.message); }
  }

  async function deleteMonth() {
    const monthYear = pickerToMonthYear(monthFilter);
    if (!monthYear) return setMsg("First select a Month/Year filter.");
    if (!(await requestConfirm("Move month leaves to Recycle Bin", `Move ALL uploaded leaves for ${monthYear} to Recycle Bin?`, "Move Month"))) return;
    try {
      const d = await api(`/api/leaves/history?monthYear=${encodeURIComponent(monthYear)}`, { method: "DELETE" });
      setMsg(`Moved ${d.deleted} leave records for ${monthYear} to Recycle Bin.`);
      showToast(`Moved ${d.deleted} leave records for ${monthYear} to Recycle Bin.`, "success");
      await loadHistory();
    } catch (e: any) { setMsg(e.message); }
  }

  async function deleteAll() {
    const typed = window.prompt('This will move every uploaded leave record to Recycle Bin. Type DELETE ALL LEAVES to confirm.');
    if (typed !== "DELETE ALL LEAVES") {
      if (typed !== null) setMsg("Delete cancelled. Confirmation text did not match.");
      return;
    }
    try {
      const d = await api("/api/leaves/history?all=1", { method: "DELETE" });
      setMsg(`Moved all ${d.deleted} leave records to Recycle Bin.`);
      showToast(`Moved all ${d.deleted} leave records to Recycle Bin.`, "success");
      await loadHistory();
    } catch (e: any) { setMsg(e.message); }
  }

  return <section className="panel leave-management">
    <h1>Leave Management</h1>
    <UploadFormatDownload type="leaves" />
    <div className="bulk import-box">
      <input key={file ? file.name : "empty"} type="file" accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
      <button className="light" onClick={previewExcel}>Preview Excel</button>
      <button className="primary" onClick={upload} disabled={!preview}>Confirm Upload</button>
    </div>
    {preview && <ImportPreview title="Leave Import Preview" data={preview} />}

    <div className="leave-history-head">
      <div>
        <h2>Manual Single Employee Leave</h2>
      </div>
    </div>
    <div className="leave-filters">
      <div><label>Employee</label><select value={manualEmployeeId} onChange={e => setManualEmployeeId(e.target.value)}><option value="">Select Employee</option>{manualEmployees.map(e => <option key={e.id} value={e.id}>{e.name} - {e.mobile}</option>)}</select></div>
      <div><label>Month</label><input type="month" value={manualMonth} onChange={e => setManualMonth(e.target.value)} /></div>
      <div><label>Leave</label><input type="number" min="0" step="0.5" value={manualLeave} onChange={e => setManualLeave(e.target.value)} placeholder="0" /></div>
      <div><label>Reason / Remark</label><input value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="Optional reason / remark" /></div>
      <div className="leave-filter-action"><button className="primary" onClick={addManualLeave}>Add Leave</button></div>
    </div>

    {msg && <div className="msg warn">{msg}</div>}

    <div className="leave-history-head">
      <div>
        <h2>Uploaded Leave History</h2>
      </div>
      <div className="leave-danger-actions">
        <button className="danger-btn" onClick={deleteMonth} disabled={!monthFilter}>Delete Selected Month</button>
        <button className="danger-btn solid" onClick={deleteAll}>Delete All Leaves</button>
      </div>
    </div>

    <div className="leave-filters">
      <div><label>Search Employee</label><input placeholder="Name / Mobile / Designation / Department" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") loadHistory(); }} /></div>
      <div><label>Month/Year</label><input type="month" value={monthFilter} onChange={e => { setMonthFilter(e.target.value); loadHistory(search, e.target.value); }} /></div>
      <div className="leave-filter-action"><button className="light" onClick={() => loadHistory()}>Search</button></div>
      <div className="leave-filter-action"><button className="light" onClick={() => { setSearch(""); setMonthFilter(""); loadHistory("", ""); }}>Clear</button></div>
    </div>

    <div className="leave-summary-line"><b>{historyLoading ? "Loading..." : `${history.length} record(s)`}</b>{monthFilter && <span>Month: {pickerToMonthYear(monthFilter)}</span>}</div>
    <div className="table-wrap leave-history-table">
      <table>
        <thead><tr><th>Month/Year</th><th>Employee</th><th>Mobile</th><th>Designation</th><th>Department</th><th>Leave</th><th>Reason / Remark</th><th>Actions</th></tr></thead>
        <tbody>
          {!historyLoading && history.length === 0 && <tr><td colSpan={8}>No leave records found.</td></tr>}
          {history.map(record => <tr key={record.id}>
            <td>{record.monthYear}</td>
            <td>{record.employee.name}</td>
            <td>{record.employee.mobile || "-"}</td>
            <td>{record.employee.designation || "-"}</td>
            <td>{record.employee.department || "-"}</td>
            <td><b>{record.leave}</b></td>
            <td>{record.reason || "-"}</td>
            <td><div className="action-buttons"><button className="light" onClick={() => { setEditing(record); setEditLeave(String(record.leave)); setEditReason(String(record.reason || "")); }}>Edit</button><button className="danger-btn small" onClick={() => deleteOne(record)}>Delete</button></div></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {editing && <div className="modal"><div className="modal-box leave-edit-modal">
      <button className="close" onClick={() => setEditing(null)}>×</button>
      <h2>Edit Leave</h2>
      <p><b>{editing.employee.name}</b> — {editing.monthYear}</p>
      <label>Leave</label><input type="number" min="0" step="0.5" value={editLeave} onChange={e => setEditLeave(e.target.value)} />
      <label>Reason / Remark</label><input value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Optional reason / remark" />
      <div className="leave-edit-actions"><button className="light" onClick={() => setEditing(null)}>Cancel</button><button className="primary" onClick={saveEdit}>Save Leave</button></div>
    </div></div>}
  </section>;
}

function ImportPreview({ title, data }: { title: string; data: any }) {
  return <div className="preview-box"><h3>{title}</h3><div className="preview-cards">{Object.entries(data).filter(([k]) => k !== "errors").map(([k, v]) => <div key={k}><span>{k}</span><b>{String(v)}</b></div>)}</div>{data.errors?.length ? <div className="preview-errors"><b>Error / Skipped Rows</b>{data.errors.slice(0, 20).map((e: any, i: number) => <p key={i}>Row {e.row}: {e.reason} {e.name || e.mobile || ""}</p>)}</div> : <div className="empty-state">No validation errors found.</div>}</div>;
}

function MyProfile({ user, leaves, loading, loadLeaves }: { user: User; leaves: LeaveInfo | null; loading: boolean; loadLeaves: (u: User) => Promise<void> }) {
  useEffect(() => { loadLeaves(user); }, [user.id]);
  return <section className="panel"><ProfileContent user={user} leaves={leaves} loading={loading} /></section>;
}


function ResetPassword({ employees }: { employees: User[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showList, setShowList] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const normalizedSearch = employeeSearch.trim().toLowerCase();
  const filteredEmployees = employees
    .filter(e =>
      !normalizedSearch ||
      e.name.toLowerCase().includes(normalizedSearch) ||
      e.mobile.includes(normalizedSearch) ||
      String(e.designation || "").toLowerCase().includes(normalizedSearch) ||
      String(e.department || "").toLowerCase().includes(normalizedSearch)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedEmployee = employees.find(e => e.id === employeeId);

  useEffect(() => {
    if (!showList) return;

    const closePicker = () => setShowList(false);
    const escClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowList(false);
    };

    // Delay keeps input click from closing the list immediately.
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", closePicker);
      window.addEventListener("touchstart", closePicker);
      window.addEventListener("keydown", escClose);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", closePicker);
      window.removeEventListener("touchstart", closePicker);
      window.removeEventListener("keydown", escClose);
    };
  }, [showList]);

  async function resetPassword() {
    if (!employeeId) return setMsg("Please select employee.");
    if (!password.trim()) return setMsg("Please enter new password.");
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return setMsg("Employee not found.");

    try {
      await api(`/api/employees/${employeeId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: employee.name,
          mobile: employee.mobile,
          password,
          role: employee.role,
          designation: employee.designation || "",
          department: employee.department || "",
          dob: employee.dob || "",
          doj: employee.doj || "",
          exitDate: employee.exitDate || "",
          status: employee.status || "ACTIVE"
        })
      });
      setPassword("");
      setMsg("Password reset successfully.");
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  function chooseEmployee(e: User) {
    setEmployeeId(e.id);
    setEmployeeSearch(e.name);
    setShowList(false);
  }

  return <section className="panel reset-panel portrait-panel"><h1>Reset Password</h1><div className="reset-portrait">
    <div className="custom-picker" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
      <label>Employee Name</label>
      <input value={employeeSearch} onFocus={() => setShowList(true)} onClick={() => setShowList(true)} onChange={e => { setEmployeeSearch(e.target.value); setEmployeeId(""); setShowList(true); }} placeholder="Type or select employee" />
      {showList && <div className="custom-picker-list">{filteredEmployees.length ? filteredEmployees.map(e => <button type="button" key={e.id} onMouseDown={event => { event.preventDefault(); chooseEmployee(e); }}><b>{e.name}</b><span>{e.designation || "-"} | {e.department || "-"} | {e.mobile}</span></button>) : <div className="empty-state">No employees found.</div>}</div>}
      {selectedEmployee && <div className="selected-chip">{selectedEmployee.name}</div>}
    </div>
    <div><label>New Password</label><input value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter new password" /></div>
    <button className="primary" onClick={resetPassword}>Reset Password</button>
  </div>{msg && <div className="msg warn">{msg}</div>}</section>;
}

function ProfileModal({ user, leaves, loading, onClose, employees, onSwitch }: { user: User; leaves: LeaveInfo | null; loading: boolean; onClose: () => void; employees: User[]; onSwitch: (u: User) => void }) {
  useEffect(() => {
    const escClose = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escClose);
    return () => window.removeEventListener("keydown", escClose);
  }, [onClose]);

  const ordered = [...employees].sort((a, b) => a.name.localeCompare(b.name));
  const index = ordered.findIndex(e => e.id === user.id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;

  return <div className="modal" onMouseDown={onClose}>
    <div className="modal-box" onMouseDown={e => e.stopPropagation()}>
      <button className="close" type="button" aria-label="Close profile" onClick={onClose}>×</button>
      <div className="profile-switcher print-exclude"><button className="light" disabled={!previous} onClick={() => previous && onSwitch(previous)}>← Previous</button><select value={user.id} onChange={event => { const selected = ordered.find(e => e.id === event.target.value); if (selected) onSwitch(selected); }}>{ordered.map(employee => <option key={employee.id} value={employee.id}>{employee.name} — {employee.mobile}</option>)}</select><button className="light" disabled={!next} onClick={() => next && onSwitch(next)}>Next →</button></div>
      <ProfileContent user={user} leaves={leaves} loading={loading} />
    </div>
  </div>;
}

function ProfileContent({ user, leaves, loading }: { user: User; leaves: LeaveInfo | null; loading: boolean }) {
  return <div className="profile-content"><div className="profile-head">{avatar(user, true)}<div><h1>{user.name}</h1><p>{user.designation} | {user.department}</p></div><button className="light print-btn" onClick={() => window.print()}><span>▣</span> Print / PDF</button></div><div className="profile-grid">
    <Info label="Mobile" value={user.mobile} /><Info label="DOB" value={user.dob} /><Info label="DOJ" value={user.doj} /><Info label="Exit / Leave Date" value={user.exitDate || "-"} />
    <Info label="Working Period" value={workingPeriod(user.doj, user.exitDate)} color={user.exitDate ? "red" : "green"} /><Info label="Status" value={user.status} /><Info label="Role" value={user.role} /><Info label="Designation" value={user.designation} /><Info label="Department" value={user.department} />
  </div>{user.role !== "ADMIN" && <><h2>Leave Balance</h2>{loading && <div className="profile-loading"><SkeletonCards count={4} /><div className="skeleton-table"><span /><span /><span /><span /></div></div>}{leaves && <><div className="cards small"><div className="stat"><span>Financial Year</span><b>{leaves.balance.financialYear}</b></div><div className="stat"><span>Earned Till Current Month</span><b>{leaves.balance.earned}</b></div><div className="stat"><span>Used Leaves</span><b>{leaves.balance.used}</b></div><div className={leaves.balance.negativeBalanceWarning ? "stat negative-balance-stat" : "stat"}><span>Current Balance</span><b>{leaves.balance.currentBalance}</b></div></div>{leaves.balance.negativeBalanceWarning && <div className="negative-balance-warning print-exclude">⚠ Leave usage exceeded the available balance by {leaves.balance.excessUsed || 0} leave(s) in the current financial year.</div>}<div className="mobile-cards-table leave-balance-table"><table><thead><tr><th>Month/Year</th><th>Earned</th><th>Used</th><th>Balance</th></tr></thead><tbody>{leaves.balance.rows.map(r => <tr key={r.monthYear}><td data-label="Month/Year">{r.monthYear}</td><td data-label="Earned">{r.earned}</td><td data-label="Used">{r.used}</td><td data-label="Balance" className="green">{r.balance}</td></tr>)}</tbody></table></div><h2 className="print-exclude">Monthwise Leaves</h2><div className="mobile-cards-table monthwise-leave-table print-exclude"><table><thead><tr><th>Month/Year</th><th>Leave</th><th>Reason / Remark</th></tr></thead><tbody>{leaves.records.map(r => <tr key={r.id}><td data-label="Month/Year">{r.monthYear}</td><td data-label="Leave">{r.leave}</td><td data-label="Reason / Remark">{r.reason || "-"}</td></tr>)}</tbody></table></div></>}</>}</div>;
}

function Info({ label, value, color }: { label: string; value?: any; color?: string }) { return <div className="info"><span>{label}</span><b className={color || ""}>{value || "-"}</b></div>; }

function Reminder({ employees }: { employees: User[] }) {
  const [data, setData] = useState<any>({ today: [], upcomingBirthdays: [], todayAnniversaries: [], upcomingAnniversaries: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => { api("/api/reminders").then(setData).catch(() => null).finally(() => setLoading(false)); }, []);

  const birthdayCard = (u: User & { daysUntil?: number }) => <div className="birthday" key={`birthday-${u.id}-${u.daysUntil || 0}`}>{avatar(u)}<div><b>{u.name}</b><span>{u.designation} | {u.dob}{typeof u.daysUntil === "number" && u.daysUntil > 0 ? ` | In ${u.daysUntil} day${u.daysUntil === 1 ? "" : "s"}` : ""}</span></div><a className="light" href={mobileUrl(u.mobile) + "?text=" + encodeURIComponent(`Happy Birthday ${u.name}! Wishing you a wonderful year ahead. - Motisons`)} target="_blank">Wish</a></div>;
  const anniversaryCard = (u: User & { daysUntil?: number; years?: number }) => <div className="birthday" key={`anniversary-${u.id}-${u.daysUntil || 0}`}>{avatar(u)}<div><b>{u.name}</b><span>{u.designation} | {u.years || 0} Year{u.years === 1 ? "" : "s"}{typeof u.daysUntil === "number" && u.daysUntil > 0 ? ` | In ${u.daysUntil} day${u.daysUntil === 1 ? "" : "s"}` : ""}</span></div><a className="light" href={mobileUrl(u.mobile) + "?text=" + encodeURIComponent(`Congratulations ${u.name} on your work anniversary! Wishing you continued success with Motisons.`)} target="_blank">Wish</a></div>;

  if (loading) return <section><div className="reminder-loading"><SkeletonCards count={4} /></div></section>;

  return <section>
    <div className="reminder-block"><h1>Birthday Reminders</h1><div className="reminders">
      <div className="panel"><h2>Today&apos;s Birthdays</h2>{data.today?.length ? data.today.map((u: User) => birthdayCard(u)) : <div className="empty-state">No birthdays today.</div>}</div>
      <div className="panel"><h2>Upcoming Birthdays - 30 Days</h2>{data.upcomingBirthdays?.length ? data.upcomingBirthdays.map((u: User & { daysUntil: number }) => birthdayCard(u)) : <div className="empty-state">No upcoming birthdays in the next 30 days.</div>}</div>
    </div></div>
    <div className="reminder-block"><h1>Work Anniversary Reminders</h1><div className="reminders">
      <div className="panel"><h2>Today&apos;s Work Anniversaries</h2>{data.todayAnniversaries?.length ? data.todayAnniversaries.map((u: User & { years: number }) => anniversaryCard(u)) : <div className="empty-state">No work anniversaries today.</div>}</div>
      <div className="panel"><h2>Upcoming Work Anniversaries - 30 Days</h2>{data.upcomingAnniversaries?.length ? data.upcomingAnniversaries.map((u: User & { daysUntil: number; years: number }) => anniversaryCard(u)) : <div className="empty-state">No upcoming work anniversaries in the next 30 days.</div>}</div>
    </div></div>
    <MessageDraft employees={employees} />
  </section>;
}

function MessageDraft({ employees }: { employees: User[] }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("Dear Team, you are invited for the upcoming event. Kindly be present on time. - Motisons");
  const [type, setType] = useState("INFORMATION");
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState("");
  const [designation, setDesignation] = useState("All");
  const [department, setDepartment] = useState("All");

  const designations = Array.from(new Set(employees.map(e => e.designation).filter(Boolean) as string[])).sort();
  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean) as string[])).sort();
  const visible = employees.filter(e => (designation === "All" || e.designation === designation) && (department === "All" || e.department === department));

  useEffect(() => {
    if (!open) return;
    const escClose = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", escClose);
    return () => window.removeEventListener("keydown", escClose);
  }, [open]);

  function toggleAll() {
    const ids = visible.map(e => e.id);
    const allSelected = ids.length > 0 && ids.every(id => selected.includes(id));
    setSelected(allSelected ? selected.filter(id => !ids.includes(id)) : Array.from(new Set([...selected, ...ids])));
  }

  async function send() {
    const fd = new FormData();
    fd.append("type", type);
    fd.append("text", msg);
    fd.append("employeeIds", selected.join(","));
    if (file) fd.append("attachment", file);
    try {
      const d = await api("/api/notifications", { method: "POST", body: fd });
      setRes(`Message saved and sent to ${d.sent} employees.`);
      setOpen(false);
    } catch (e: any) {
      setRes(e.message);
    }
  }

  return <div className="panel"><button className="primary" onClick={() => setOpen(true)}>Create Message</button>{res && <div className="msg warn">{res}</div>}{open && <div className="modal" onMouseDown={() => setOpen(false)}><div className="modal-box wide" onMouseDown={e => e.stopPropagation()}><button className="close" type="button" onClick={() => setOpen(false)}>×</button><div className="draft"><div><h2>Message Draft</h2><label>Type</label><select value={type} onChange={e => setType(e.target.value)}><option>INVITATION</option><option>INFORMATION</option><option>CELEBRATION</option><option>NOTICE</option></select><label>Attachment</label><input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /><label>Message Text</label><textarea value={msg} onChange={e => setMsg(e.target.value)} /></div><div><h2>Select Employees</h2><div className="draft-filters"><select value={designation} onChange={e => setDesignation(e.target.value)}><option>All</option>{designations.map(d => <option key={d}>{d}</option>)}</select><select value={department} onChange={e => setDepartment(e.target.value)}><option>All</option>{departments.map(d => <option key={d}>{d}</option>)}</select></div><button className="light" onClick={toggleAll}>Select All Visible</button><div className="pick-list">{visible.map(e => <label key={e.id}><input type="checkbox" checked={selected.includes(e.id)} onChange={ev => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter(x => x !== e.id))} /> <b>{e.name}</b><span>{e.designation} | {e.department}</span></label>)}</div><button className="primary" onClick={send}>Send Message</button></div></div></div></div>}</div>;
}


function RecycleBin() {
  const [filter, setFilter] = useState<"all" | "employees" | "leaves">("all");
  const [data, setData] = useState<any>({ employees: [], leaves: [], retentionDays: 30 });
  const [loading, setLoading] = useState(true);

  async function load(nextFilter = filter) {
    setLoading(true);
    try {
      const result = await api(`/api/recycle-bin?type=${nextFilter}`);
      setData(result);
    } catch {
      setData({ employees: [], leaves: [], retentionDays: 30 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(filter); }, [filter]);

  async function act(type: "employee" | "leave", id: string, action: "RESTORE" | "PERMANENT_DELETE", label: string) {
    const permanent = action === "PERMANENT_DELETE";
    if (!(await requestConfirm(
      permanent ? "Permanent Delete" : "Restore from Recycle Bin",
      permanent ? `Permanently delete ${label}? This cannot be undone.` : `Restore ${label}?`,
      permanent ? "Permanent Delete" : "Restore"
    ))) return;
    try {
      await api("/api/recycle-bin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, action })
      });
      showToast(permanent ? "Record permanently deleted." : "Record restored successfully.", "success");
      await load();
    } catch {
      // API helper already shows the restore/permanent-delete error, including conflicts.
    }
  }

  const employees = data.employees || [];
  const leaves = data.leaves || [];

  return <section className="panel recycle-bin-page">
    <div className="recycle-head"><div><h1>Recycle Bin</h1><p className="hint">Deleted records are kept for {data.retentionDays || 30} days, then permanently deleted automatically.</p></div><button className="light" onClick={() => load()}>Refresh</button></div>
    <div className="recycle-filters">
      <button className={filter === "all" ? "light active" : "light"} onClick={() => setFilter("all")}>All</button>
      <button className={filter === "employees" ? "light active" : "light"} onClick={() => setFilter("employees")}>Employees</button>
      <button className={filter === "leaves" ? "light active" : "light"} onClick={() => setFilter("leaves")}>Leaves</button>
    </div>
    {loading ? <div className="recycle-loading"><SkeletonCards count={3} /></div> : <>
      {(filter === "all" || filter === "employees") && <div className="recycle-section"><h2>Deleted Employees <span className="pill">{employees.length}</span></h2><div className="table-wrap"><table><thead><tr><th>Name</th><th>Mobile</th><th>Designation</th><th>Department</th><th>Deleted By</th><th>Deleted At</th><th>Actions</th></tr></thead><tbody>{employees.length ? employees.map((item: any) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.mobile}</td><td>{item.designation || "-"}</td><td>{item.department || "-"}</td><td>{item.deletedByName || "-"}</td><td>{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : "-"}</td><td><div className="action-buttons"><button className="light" onClick={() => act("employee", item.id, "RESTORE", item.name)}>Restore</button><button className="danger-btn small" onClick={() => act("employee", item.id, "PERMANENT_DELETE", item.name)}>Permanent Delete</button></div></td></tr>) : <tr><td colSpan={7}>No deleted employees.</td></tr>}</tbody></table></div></div>}
      {(filter === "all" || filter === "leaves") && <div className="recycle-section"><h2>Deleted Leaves <span className="pill">{leaves.length}</span></h2><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Month/Year</th><th>Leave</th><th>Reason / Remark</th><th>Deleted By</th><th>Deleted At</th><th>Actions</th></tr></thead><tbody>{leaves.length ? leaves.map((item: any) => <tr key={item.id}><td><b>{item.employee?.name || "-"}</b>{item.employee?.deletedAt && <small className="recycle-parent-note"> Employee also deleted</small>}</td><td>{item.monthYear}</td><td>{item.leave}</td><td>{item.reason || "-"}</td><td>{item.deletedByName || "-"}</td><td>{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : "-"}</td><td><div className="action-buttons"><button className="light" onClick={() => act("leave", item.id, "RESTORE", `${item.employee?.name || "employee"} - ${item.monthYear}`)}>Restore</button><button className="danger-btn small" onClick={() => act("leave", item.id, "PERMANENT_DELETE", `${item.employee?.name || "employee"} - ${item.monthYear}`)}>Permanent Delete</button></div></td></tr>) : <tr><td colSpan={7}>No deleted leave records.</td></tr>}</tbody></table></div></div>}
    </>}
  </section>;
}

function SystemHealth() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setData(await api("/api/system-health")); }
    catch { setData(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return <section className="panel system-health-page">
    <div className="system-health-head"><div><h1>System Health</h1></div><button className="light" onClick={load}>Refresh</button></div>
    {loading ? <SkeletonCards count={4} /> : data ? <>
      <div className="health-cards">
        <div className="health-card"><span>App Server</span><b className="health-ok">{data.server}</b></div>
        <div className="health-card"><span>Database</span><b className={data.database === "CONNECTED" ? "health-ok" : "health-bad"}>{data.database}</b></div>
        <div className="health-card"><span>Recycle Retention</span><b>{data.recycleBin?.retentionDays || 30} Days</b></div>
        <div className="health-card"><span>Recycle Bin</span><b>{(data.recycleBin?.deletedEmployees || 0) + (data.recycleBin?.deletedLeaves || 0)} Records</b></div>
      </div>
      <div className="health-detail"><div><span>Deleted Employees</span><b>{data.recycleBin?.deletedEmployees || 0}</b></div><div><span>Deleted Leaves</span><b>{data.recycleBin?.deletedLeaves || 0}</b></div><div><span>Auto Cleaned Now</span><b>{(data.recycleBin?.autoCleaned?.employees || 0) + (data.recycleBin?.autoCleaned?.leaves || 0)}</b></div><div><span>Checked At</span><b>{data.checkedAt ? new Date(data.checkedAt).toLocaleString() : "-"}</b></div></div>
    </> : <div className="msg error">System health could not be loaded.</div>}
  </section>;
}

function AuditTrail() {
  const [rows, setRows] = useState<any[]>([]);
  const [filters, setFilters] = useState({ action: "All", search: "", from: "", to: "" });

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.action !== "All") params.set("action", filters.action);
    if (filters.search) params.set("search", filters.search);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    api(`/api/audit?${params}`).then(d => setRows(d.logs)).catch(() => setRows([]));
  }, [filters]);

  const actions = ["All", "ADD_EMPLOYEE", "UPDATE_EMPLOYEE", "DELETE_EMPLOYEE", "IMPORT_EMPLOYEES", "BULK_ACTIVATE_EMPLOYEES", "BULK_DEACTIVATE_EMPLOYEES", "BULK_CHANGE_DEPARTMENT", "BULK_DELETE_EMPLOYEES", "BULK_EXPORT_EMPLOYEES", "IMPORT_LEAVES", "CREATE_NOTIFICATION", "RESET_PASSWORD_OR_UPDATE_EMPLOYEE", "UPDATE_PERMISSIONS"];

  return <section className="panel"><h1>Audit Trail</h1><div className="notification-filters"><select value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })}>{actions.map(a => <option key={a}>{a}</option>)}</select><input placeholder="Search actor / target / detail" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /><input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /><input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></div>{rows.length ? <div className="table-wrap audit-table"><table><thead><tr><th>Date</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.action}</td><td>{r.actorName || "-"}</td><td>{r.target || "-"}</td><td>{r.details || "-"}</td></tr>)}</tbody></table></div> : <div className="empty-state">No activity found.</div>}</section>;
}

function LoginHistory() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, success: 0, failed: 0 });
  const [filters, setFilters] = useState({ status: "All", search: "", from: "", to: "" });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status !== "All") params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    api(`/api/login-history?${params.toString()}`).then(data => {
      setRows(data.attempts || []);
      setSummary(data.summary || { total: 0, success: 0, failed: 0 });
      setMsg("");
    }).catch((e: any) => {
      setRows([]);
      setMsg(e.message);
    });
  }, [filters]);

  return <section className="panel"><h1>Login History</h1>
    <div className="cards small login-summary"><div className="stat"><span>Total Attempts</span><b>{summary.total}</b></div><div className="stat"><span>Successful</span><b>{summary.success}</b></div><div className="stat"><span>Failed Attempts</span><b>{summary.failed}</b></div></div>
    <div className="notification-filters"><select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option>All</option><option>Success</option><option>Failed</option></select><input placeholder="Search user / mobile / IP" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /><input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /><input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></div>
    {msg && <div className="msg warn">{msg}</div>}
    {rows.length ? <div className="table-wrap login-history-table"><table><thead><tr><th>Date / Time</th><th>Status</th><th>User / Mobile</th><th>Employee</th><th>IP Address</th><th>Reason</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td><span className={row.success ? "pill ok" : "pill danger"}>{row.success ? "SUCCESS" : "FAILED"}</span></td><td>{row.username}</td><td>{row.employeeName || "-"}</td><td>{row.ipAddress || "-"}</td><td>{row.success ? "-" : row.reason || "Login failed."}</td></tr>)}</tbody></table></div> : !msg && <div className="empty-state">No login attempts found.</div>}
  </section>;
}

function ExportData() {
  const exports = [
    ["Employees", "employees"],
    ["Leaves", "leaves"],
    ["Notifications", "notifications"],
    ["Chats", "chats"]
  ];

  return <section className="panel"><h1>Backup / Export Data</h1><div className="export-grid">{exports.map(([label, type]) => <a key={type} className="export-card" href={`/api/export?type=${type}`} target="_blank"><b>{label}</b><span>Download CSV</span></a>)}</div></section>;
}

function LeaveReports() {
  const [report, setReport] = useState<any>(null);

  useEffect(() => { api("/api/reports/leaves").then(setReport).catch(() => setReport(null)); }, []);

  if (!report) return <section className="panel"><h1>Leave Reports</h1><div className="msg warn">Loading report...</div></section>;

  return <section className="panel"><h1>Leave Reports</h1><div className="cards small"><div className="stat"><span>Financial Year</span><b>{report.financialYear}</b></div><div className="stat"><span>Current Month</span><b>{report.currentMonth}</b></div><div className="stat"><span>Current Month Used</span><b>{report.currentMonthUsed}</b></div></div>
    <h2>Department Wise Leave</h2><div className="table-wrap"><table><thead><tr><th>Department</th><th>Employees</th><th>Earned</th><th>Used</th><th>Balance</th></tr></thead><tbody>{report.departments.map((r: any) => <tr key={r.department}><td>{r.department}</td><td>{r.employees}</td><td>{r.earned}</td><td>{r.used}</td><td>{r.balance}</td></tr>)}</tbody></table></div>
    <h2>Highest Leave Employees</h2><div className="table-wrap"><table><thead><tr><th>S.No</th><th>Name</th><th>Department</th><th>Designation</th><th>Used</th><th>Balance</th></tr></thead><tbody>{report.highestLeaves.map((r: any, i: number) => <tr key={r.id}><td>{i + 1}</td><td>{r.name}</td><td>{r.department}</td><td>{r.designation}</td><td>{r.used}</td><td>{r.balance}</td></tr>)}</tbody></table></div>
  </section>;
}

function PermissionsPanel({ session }: { session: User }) {
  const [permissions, setPermissions] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { api("/api/permissions").then(d => setPermissions(d.permissions)).catch((e: any) => setMsg(e.message)); }, []);

  async function save() {
    try {
      await api("/api/permissions", { method: "POST", body: JSON.stringify(permissions) });
      setMsg("Permissions saved.");
      showToast("Permissions saved.", "success");
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  if (!permissions) return <section className="panel"><h1>Role Permission Control</h1>{msg ? <div className="msg error">{msg}</div> : <div className="permission-skeleton"><SkeletonCards count={4} /><span className="skeleton-button" /></div>}</section>;

  const rows = [
    ["hrCanEditEmployee", "HR can edit employee"],
    ["hrCanDeleteEmployee", "HR can delete employee"],
    ["hrCanResetPassword", "HR can reset password"],
    ["hrCanUploadLeaves", "HR can upload leaves"]
  ];

  return <section className="panel permission-panel"><h1>Role Permission Control</h1>{rows.map(([key, label]) => <label className="permission-row" key={key}><span>{label}</span><select disabled={session.role !== "ADMIN"} value={permissions[key]} onChange={e => setPermissions({ ...permissions, [key]: e.target.value })}><option value="true">Yes</option><option value="false">No</option></select></label>)}{session.role === "ADMIN" && <button className="primary" onClick={save}>Save Permissions</button>}{msg && <div className="msg warn">{msg}</div>}</section>;
}

function LeaveRequests({ session }: { session: User }) {
  const canReview = session.role === "ADMIN" || session.role === "HR";
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [minimumLeaveDate, setMinimumLeaveDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [form, setForm] = useState({ fromDate: "", toDate: "", fromDayType: "FULL", toDayType: "FULL", reason: "" });
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/leave-requests");
      setRows(data.requests || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const tomorrow = new Date();
    tomorrow.setHours(12, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMinimumLeaveDate(`${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.fromDate || !form.toDate || !form.reason.trim()) {
      setMsg("From date, To date and leave reason are required.");
      return;
    }
    if (minimumLeaveDate && form.fromDate < minimumLeaveDate) {
      setMsg("From date must be after today.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      await api("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setForm({ fromDate: "", toDate: "", fromDayType: "FULL", toDayType: "FULL", reason: "" });
      setMsg("Leave request submitted successfully.");
      showToast("Leave request submitted successfully.", "success");
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function decide(row: any, status: "APPROVED" | "REJECTED", reason = "") {
    if (status === "APPROVED") {
      const confirmed = await requestConfirm("Approve leave request", `Approve ${row.requester.name}'s leave request?`, "Approve");
      if (!confirmed) return;
    }
    setSaving(true);
    setMsg("");
    try {
      const data = await api("/api/leave-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status, rejectionReason: reason })
      });
      setRejecting(null);
      setRejectionReason("");
      const resultText = status === "APPROVED" ? "approved" : "rejected";
      const addedText = status === "APPROVED" && data.monthlyLeaveAdded?.length
        ? ` ${data.monthlyLeaveAdded.map((item: any) => `${item.leave} day(s) added in ${item.monthYear}`).join(", ")}.`
        : "";
      setMsg(`Leave request ${resultText}.${addedText} Notification sent to ${row.requester.name}.`);
      showToast(`Leave request ${resultText}.`, "success");
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setSaving(false);
    }
  }

  function displayDate(value: string) {
    if (!value) return "-";
    const date = new Date(value);
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
  }

  function leaveDayCount(fromValue: string, toValue: string, fromDayType = "FULL", toDayType = "FULL") {
    const from = String(fromValue || "").slice(0, 10);
    const to = String(toValue || "").slice(0, 10);
    if (!from || !to) return 0;
    const fromTime = Date.parse(`${from}T00:00:00.000Z`);
    const toTime = Date.parse(`${to}T00:00:00.000Z`);
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime < fromTime) return 0;
    const calendarDays = Math.floor((toTime - fromTime) / 86400000) + 1;
    if (calendarDays === 1) return fromDayType === "HALF" ? 0.5 : 1;
    return calendarDays - (fromDayType === "HALF" ? 0.5 : 0) - (toDayType === "HALF" ? 0.5 : 0);
  }

  const visibleRows = statusFilter === "ALL" ? rows : rows.filter(row => row.status === statusFilter);
  const formDays = leaveDayCount(form.fromDate, form.toDate, form.fromDayType, form.toDayType);

  return <section className="panel leave-request-panel">
    <div className="leave-request-title"><div><h1>Leave Requests</h1></div>{canReview && <span className="leave-pending-count">{rows.filter(row => row.status === "PENDING").length} Pending</span>}</div>

    {!canReview && <form className="leave-request-form" onSubmit={submit}>
      <div className="leave-date-block"><label>From Date</label><input type="date" min={minimumLeaveDate || undefined} value={form.fromDate} onChange={event => { const fromDate = event.target.value; const toDate = form.toDate && form.toDate < fromDate ? fromDate : form.toDate; setForm({ ...form, fromDate, toDate, toDayType: toDate && toDate === fromDate ? form.fromDayType : form.toDayType }); }} required /><small>From Day Type</small><select value={form.fromDayType} onChange={event => { const fromDayType = event.target.value; setForm({ ...form, fromDayType, toDayType: form.toDate && form.toDate === form.fromDate ? fromDayType : form.toDayType }); }}><option value="FULL">Full Day</option><option value="HALF">Half Day</option></select></div>
      <div className="leave-date-block"><label>To Date</label><input type="date" min={form.fromDate || minimumLeaveDate || undefined} value={form.toDate} onChange={event => { const toDate = event.target.value; setForm({ ...form, toDate, toDayType: toDate === form.fromDate ? form.fromDayType : form.toDayType }); }} required /><small>To Day Type</small><select value={form.toDate && form.toDate === form.fromDate ? form.fromDayType : form.toDayType} disabled={!form.toDate || form.toDate === form.fromDate} onChange={event => setForm({ ...form, toDayType: event.target.value })}><option value="FULL">Full Day</option><option value="HALF">Half Day</option></select></div>
      <div className="leave-days-preview"><span>Total Leave Days</span><b>{formDays || "-"}</b></div>
      <div className="leave-reason-field"><label>Leave Reason</label><textarea rows={3} placeholder="Enter reason for leave" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} required /></div>
      <div className="leave-request-submit"><button className="primary" disabled={saving}>{saving ? "Submitting..." : "Submit Leave Request"}</button></div>
    </form>}

    {canReview && <div className="leave-request-filters"><button className={statusFilter === "ALL" ? "light active" : "light"} onClick={() => setStatusFilter("ALL")}>All</button><button className={statusFilter === "PENDING" ? "light active" : "light"} onClick={() => setStatusFilter("PENDING")}>Pending</button><button className={statusFilter === "APPROVED" ? "light active" : "light"} onClick={() => setStatusFilter("APPROVED")}>Approved</button><button className={statusFilter === "REJECTED" ? "light active" : "light"} onClick={() => setStatusFilter("REJECTED")}>Rejected</button></div>}
    {msg && <div className="msg warn">{msg}</div>}

    <div className="table-wrap leave-request-table"><table><thead><tr>{canReview && <th>Employee / Manager</th>}<th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Decision</th>{canReview && <th>Action</th>}</tr></thead><tbody>
      {loading && <tr><td colSpan={canReview ? 8 : 7}>Loading leave requests...</td></tr>}
      {!loading && visibleRows.length === 0 && <tr><td colSpan={canReview ? 8 : 7}>No leave requests found.</td></tr>}
      {!loading && visibleRows.map(row => <tr key={row.id}>
        {canReview && <td><b>{row.requester.name}</b><small className="leave-request-person-meta">{row.requester.designation || "Employee"}{row.requester.department ? ` · ${row.requester.department}` : ""}</small></td>}
        <td>{displayDate(row.fromDate)}<small className="leave-day-type-label">{row.fromDayType === "HALF" ? "Half Day" : "Full Day"}</small></td><td>{displayDate(row.toDate)}<small className="leave-day-type-label">{row.toDayType === "HALF" ? "Half Day" : "Full Day"}</small></td><td><b>{leaveDayCount(row.fromDate, row.toDate, row.fromDayType, row.toDayType)}</b></td><td className="leave-request-reason">{row.reason}</td>
        <td><span className={`leave-status ${String(row.status).toLowerCase()}`}>{row.status}</span></td>
        <td>{row.status === "PENDING" ? "-" : <><b>{row.decidedBy?.name || "-"}</b>{row.status === "REJECTED" && <small className="leave-rejection-text">Reason: {row.rejectionReason}</small>}</>}</td>
        {canReview && <td>{row.status === "PENDING" ? <div className="action-buttons"><button className="primary small" disabled={saving} onClick={() => decide(row, "APPROVED")}>Approve</button><button className="danger-btn small" disabled={saving} onClick={() => { setRejecting(row); setRejectionReason(""); }}>Reject</button></div> : "Completed"}</td>}
      </tr>)}
    </tbody></table></div>

    {rejecting && <div className="modal"><div className="modal-box leave-reject-modal"><h2>Reject Leave Request</h2><p><b>{rejecting.requester.name}</b> · {displayDate(rejecting.fromDate)} to {displayDate(rejecting.toDate)} · {leaveDayCount(rejecting.fromDate, rejecting.toDate, rejecting.fromDayType, rejecting.toDayType)} day(s)</p><label>Rejection Reason</label><textarea rows={4} autoFocus placeholder="Enter reason for rejection" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} /><div className="leave-reject-actions"><button className="light" disabled={saving} onClick={() => { setRejecting(null); setRejectionReason(""); }}>Cancel</button><button className="danger-btn" disabled={saving || !rejectionReason.trim()} onClick={() => decide(rejecting, "REJECTED", rejectionReason)}>{saving ? "Rejecting..." : "Reject & Notify"}</button></div></div></div>}
  </section>;
}

function NotificationBell({ onOpen }: { onOpen: () => void }) {
  const [unread, setUnread] = useState(0);

  async function refresh() {
    try {
      const data = await api("/api/notifications?view=center");
      setUnread(data.unread || 0);
    } catch {
      setUnread(0);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);

  return <button className="notification-bell" onClick={onOpen} aria-label="Open notification center"><span>◴</span>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</button>;
}

function Notifications({ session, employees }: { session: User; employees: User[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [mode, setMode] = useState<"center" | "history">("center");
  const [filters, setFilters] = useState({ search: "", type: "All", designation: "All", department: "All", from: "", to: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const designations = Array.from(new Set(employees.map(e => e.designation).filter(Boolean) as string[])).sort();
  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean) as string[])).sort();
  const canViewHistory = session.role === "ADMIN" || session.role === "HR";

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (mode === "center") params.set("view", "center");
    if (filters.search) params.set("search", filters.search);
    if (filters.type !== "All") params.set("type", filters.type);
    if (mode === "history" && filters.designation !== "All") params.set("designation", filters.designation);
    if (mode === "history" && filters.department !== "All") params.set("department", filters.department);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    try {
      const data = await api(`/api/notifications?${params}`);
      setRows(data.notifications);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filters, mode]);

  async function markRead(id?: string) {
    try {
      await api("/api/notifications", { method: "PATCH", body: JSON.stringify(id ? { id } : {}) });
      await load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function clearAll() {
    if (!(await requestConfirm("Clear notifications", "Clear all notifications from your notification center?", "Clear All"))) return;
    try {
      await api("/api/notifications", { method: "DELETE" });
      setRows([]);
      setMsg("Notification center cleared.");
      showToast("Notification center cleared.", "success");
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return <section className="panel notification-panel"><div className="notification-title-row"><div><h1>{mode === "center" ? "Alerts" : "Notification History"}</h1></div>{canViewHistory && <div className="notification-mode-buttons"><button className={mode === "center" ? "primary" : "light"} onClick={() => setMode("center")}>My Alerts</button><button className={mode === "history" ? "primary" : "light"} onClick={() => setMode("history")}>Sent History</button></div>}</div>
    {mode === "center" && <div className="notification-center-actions"><button className="light" onClick={() => markRead()}>Mark All Read</button><button className="light danger-action" onClick={clearAll}>Clear All</button></div>}
    {msg && <div className="msg warn">{msg}</div>}
    {mode === "center" ? <div className="notification-center-filters"><select aria-label="Alert type" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option>All</option><option>INVITATION</option><option>INFORMATION</option><option>CELEBRATION</option><option>NOTICE</option></select><input placeholder="Search alerts" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /></div> : <div className="notification-filters"><select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option>All</option><option>INVITATION</option><option>INFORMATION</option><option>CELEBRATION</option><option>NOTICE</option></select><select value={filters.designation} onChange={e => setFilters({ ...filters, designation: e.target.value })}><option>All</option>{designations.map(d => <option key={d}>{d}</option>)}</select><select value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })}><option>All</option>{departments.map(d => <option key={d}>{d}</option>)}</select><input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /><input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /><input placeholder="Search text" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /></div>}
    {loading ? <div className="notification-loading"><SkeletonCards count={3} /></div> : rows.length ? rows.map(r => {
      if (mode === "center") {
        const unread = !r.readAt;
        return <button className={unread ? "history notification-item unread" : "history notification-item"} key={r.id} onClick={() => unread && markRead(r.id)}><div className="notification-item-head"><b>{r.filterType === "SYSTEM" ? "SYSTEM" : r.type}</b>{unread && <span className="unread-dot">Unread</span>}</div><p>{r.text}</p>{r.attachmentUrl && <a href={r.attachmentUrl} target="_blank" onClick={e => e.stopPropagation()}>Attachment</a>}<small>{new Date(r.createdAt).toLocaleString()} | By {r.createdBy}</small></button>;
      }
      const read = (r.recipients || []).filter((x: any) => x.readAt).length;
      const total = (r.recipients || []).length;
      return <div className="history" key={r.id}><b>{r.filterType === "SYSTEM" ? `SYSTEM | ${r.filterValue || r.type}` : `${r.type} | ${new Date(r.createdAt).toLocaleString()}`}</b><p>{r.text}</p>{r.attachmentUrl && <a href={r.attachmentUrl} target="_blank">Attachment</a>}<small>{`Sent: ${total} | Read: ${read} | Unread: ${total - read}`}</small></div>;
    }) : <div className="empty-state">No notifications found.</div>}
  </section>;
}

function SkeletonCards({ count = 3 }: { count?: number }) {
  return <div className="skeleton-cards">{Array.from({ length: count }).map((_, index) => <div className="skeleton-card" key={index}><span /><b /><i /></div>)}</div>;
}

function ToastHost() {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      const id = Date.now() + Math.random();
      setItems(current => [...current.slice(-3), { id, message: String(detail.message || ""), kind: detail.kind || "info" }]);
      window.setTimeout(() => setItems(current => current.filter(item => item.id !== id)), 3800);
    }
    window.addEventListener("motisons-toast", handle);
    return () => window.removeEventListener("motisons-toast", handle);
  }, []);
  return <div className="toast-stack" aria-live="polite">{items.map(item => <div className={`toast ${item.kind}`} key={item.id}><span>{item.kind === "success" ? "✓" : item.kind === "error" ? "!" : "i"}</span><div><b>{item.kind === "success" ? "Success" : item.kind === "error" ? "Error" : "Information"}</b><p>{item.message}</p></div><button onClick={() => setItems(current => current.filter(x => x.id !== item.id))}>×</button></div>)}</div>;
}

function ConfirmHost() {
  const [request, setRequest] = useState<{ id: number; title: string; message: string; confirmLabel: string } | null>(null);
  useEffect(() => {
    function handle(event: Event) { setRequest((event as CustomEvent).detail); }
    window.addEventListener("motisons-confirm", handle);
    return () => window.removeEventListener("motisons-confirm", handle);
  }, []);
  function respond(value: boolean) {
    if (!request) return;
    confirmResolvers.get(request.id)?.(value);
    confirmResolvers.delete(request.id);
    setRequest(null);
  }
  if (!request) return null;
  return <div className="confirm-backdrop" onMouseDown={() => respond(false)}><div className="confirm-dialog" onMouseDown={e => e.stopPropagation()}><div className="confirm-icon">!</div><h2>{request.title}</h2><p>{request.message}</p><div className="confirm-actions"><button className="light" onClick={() => respond(false)}>Cancel</button><button className="primary confirm-danger" onClick={() => respond(true)}>{request.confirmLabel}</button></div></div></div>;
}

function Chat({ session }: { session: User }) {
  const [users, setUsers] = useState<User[]>([]); const [threads, setThreads] = useState<any[]>([]); const [active, setActive] = useState<any>(null); const [messages, setMessages] = useState<any[]>([]); const [q, setQ] = useState(""); const [text, setText] = useState(""); const [file, setFile] = useState<File | null>(null); const timer = useRef<any>(null); const openedDeepLink = useRef("");
  async function bootstrap() { const d = await api("/api/chat/bootstrap"); setUsers(d.users.filter((u: User) => u.id !== session.id && String(u.status || "").toUpperCase() !== "INACTIVE")); setThreads(d.threads); }
  useEffect(() => { bootstrap(); timer.current = setInterval(() => { bootstrap(); if (active) loadMessages(active.id); }, 3000); return () => clearInterval(timer.current); }, [active?.id]);
  useEffect(() => {
    if (!users.length || active) return;
    const params = new URLSearchParams(window.location.search);
    const employeeId = params.get("employeeId") || "";
    if (!employeeId || openedDeepLink.current === employeeId) return;
    const employee = users.find(user => user.id === employeeId);
    if (!employee) return;
    openedDeepLink.current = employeeId;
    ensureThread(employee).catch(() => null);
    params.delete("employeeId");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [users, active]);
  async function ensureThread(u: User) { const d = await api("/api/chat/threads", { method: "POST", body: JSON.stringify({ employeeId: u.id }) }); const t = { id: d.threadId, other: u }; setActive(t); loadMessages(d.threadId); }
  async function loadMessages(id: string) { const d = await api(`/api/chat/threads/${id}`); setMessages(d.messages); }
  async function send() { if (!active || (!text.trim() && !file)) return; const fd = new FormData(); fd.append("threadId", active.id); fd.append("text", text); if (file) fd.append("attachment", file); setText(""); setFile(null); await api("/api/chat/messages", { method: "POST", body: fd }); await loadMessages(active.id); await bootstrap(); }
  async function edit(m: any) { const next = prompt("Edit message", m.text); if (next === null) return; await api(`/api/chat/messages/${m.id}`, { method: "PUT", body: JSON.stringify({ text: next }) }); loadMessages(active.id); }
  const list = users.filter(u => !q || `${u.name} ${u.mobile}`.toLowerCase().includes(q.toLowerCase()));
  const threadFor = (u: User) => threads.find((t: any) => t.other?.id === u.id);
  const sortedList = [...list].sort((a, b) => {
    const ta = threadFor(a)?.updatedAt ? new Date(threadFor(a).updatedAt).getTime() : 0;
    const tb = threadFor(b)?.updatedAt ? new Date(threadFor(b).updatedAt).getTime() : 0;
    return tb - ta;
  });
  return <section className="panel chat-page"><div className="chat-grid-title"><h1>Chats</h1><span>{sortedList.length} contacts</span></div><div className={active ? "chat-grid chat-active" : "chat-grid"}><aside className="chat-contacts"><div className="chat-search"><span>⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or mobile" /></div><div className="chat-list">{sortedList.length ? sortedList.map(u => { const t = threadFor(u); return <button key={u.id} className="chat-user" onClick={() => ensureThread(u)}>{avatar(u)}<span><b>{u.name}</b><small>{t?.lastMessage?.text || "No messages yet"}</small></span><div className="chat-user-meta">{Boolean(t?.unread) && <strong className="unread-badge">{t.unread}</strong>}{isOnline(u) && <em>online</em>}</div></button>; }) : <div className="chat-empty">No employee found</div>}</div></aside><div className="chat-box"><div className="chat-head">{active?.other ? <><button className="mobile-chat-back" type="button" aria-label="Back to chats" onClick={() => { setActive(null); setMessages([]); }}>←</button>{avatar(active.other)}<div><b>{active.other.name}</b><span>{isOnline(active.other) ? "online" : "offline"}</span></div></> : <b>Select an employee to start chat</b>}</div><div className="chat-messages">{messages.length ? messages.map(m => <div key={m.id} className={m.senderId === session.id ? "bubble me" : "bubble"}><p>{m.text}</p>{m.attachmentUrl && <a href={m.attachmentUrl} target="_blank">{m.attachmentName || "Attachment"}</a>}<small>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {m.isEdited ? "edited" : ""} {m.senderId === session.id ? "✓✓" : ""} {m.senderId === session.id && Date.now() - new Date(m.createdAt).getTime() < 300000 && <button onClick={() => edit(m)}>Edit</button>}</small></div>) : active && <div className="chat-conversation-empty"><span>✉</span><b>Start your conversation</b></div>}</div><div className="chat-input">
  <label className={file ? "attach-btn has-file" : "attach-btn"} title={file ? file.name : "Attach file"}>
    📎
    <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
  </label>
  <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.repeat) { e.preventDefault(); send(); } }} placeholder={file ? `Attached: ${file.name}` : "Type message"} />
  <button className="primary" onClick={send}>Send</button>
</div></div></div></section>;
}
