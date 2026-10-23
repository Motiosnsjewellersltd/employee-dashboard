"use client";

import { useEffect, useState } from "react";
import MonthlyAttendanceCalendar from "./MonthlyAttendanceCalendar";
import EmployeeReportViewer from "./EmployeeReportViewer";
import FourDotsLoader from "./FourDotsLoader";
import { attendanceCalendarMonths } from "@/lib/attendanceCalendarAccess";
import { monthLabel, readEmployeeRecent, rememberEmployeePage, type RecentEmployeePage } from "@/lib/employeeExperience";
import type { ProfileChange } from "@/lib/employeeProfileHistory";
import styles from "./EmployeeExperience.module.css";

type Employee = { id: string; name: string; employeeCode?: string | null; branch?: string | null };
type Navigate = (section: "reporting" | "schemes" | "leaveRequests") => void;
export type ExperienceIconName = "calendar" | "chart" | "document" | "leaf" | "clock" | "profile" | "branch" | "open" | "sun";
export function ExperienceIcon({ name }: { name: ExperienceIconName }) {
  const paths: Record<ExperienceIconName, React.ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3v3H8z"/></>,
    chart: <><path d="M5 20v-7M12 20V8M19 20V3" strokeWidth="3"/></>,
    document: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h8"/></>,
    leaf: <><path d="M20 3C9 2 3 6 4 13c1 6 11 7 15-2 1-3 1-6 1-8ZM4 21 16 8"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    profile: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-3c0-6 16-6 16 0v3z"/></>,
    branch: <><path d="M4 21V6h10v15M14 10h6v11M8 9h2M8 13h2M8 17h2M17 14h1M17 17h1M2 21h20"/></>,
    open: <><path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/></>
  };
  return <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const recentTitles = { reports: "My Reports", incentive: "My Incentive", leave: "Apply Leave" };
export function EmployeeQuickAccess({ employee, canReport, canIncentive, onNavigate }: {
  employee: Employee; canReport: boolean; canIncentive: boolean; onNavigate: Navigate;
}) {
  const [recent, setRecent] = useState<RecentEmployeePage[]>([]);
  const [greeting, setGreeting] = useState("Welcome back");
  const months = attendanceCalendarMonths(), currentMonth = months.at(-1);
  useEffect(() => {
    const refresh = () => setRecent(readEmployeeRecent(employee.id));
    refresh();
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
    setGreeting(hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening");
    window.addEventListener("motisons-recent-updated", refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("motisons-recent-updated", refresh); window.removeEventListener("storage", refresh); };
  }, [employee.id]);
  const visible = recent.filter(row => (row.kind !== "reports" || canReport) && (row.kind !== "incentive" || canIncentive) &&
    (row.kind !== "attendance" || months.includes(row.monthYear || "")));
  const open = (kind: "reports" | "incentive" | "leave") => onNavigate(kind === "reports" ? "reporting" : kind === "incentive" ? "schemes" : "leaveRequests");
  const calendar = (monthYear: string, full: boolean) => <MonthlyAttendanceCalendar employee={employee} monthYear={monthYear}
    onOpen={() => rememberEmployeePage(employee.id, { kind: "attendance", monthYear })}>
    <ExperienceIcon name="calendar" />{full ? monthLabel(monthYear) : "Attendance"}
  </MonthlyAttendanceCalendar>;
  return <div className={`${styles.experience} ${styles.quickArea}`}>
    <p className={styles.greeting}><ExperienceIcon name="sun" />{greeting}, {employee.name.split(/\s+/)[0]}</p>
    <section className={styles.box} aria-label="Quick Access"><h2 className={styles.title}><ExperienceIcon name="document" />Quick Access</h2>
      <div className={styles.quickGrid}>
        {currentMonth && <div>{calendar(currentMonth, false)}</div>}
        {canIncentive && <button type="button" aria-label="My Incentive" onClick={() => open("incentive")}><ExperienceIcon name="chart" />My Incentive</button>}
        {canReport && <button type="button" aria-label="My Reports" onClick={() => open("reports")}><ExperienceIcon name="document" />My Reports</button>}
        <button type="button" aria-label="Apply Leave" onClick={() => open("leave")}><ExperienceIcon name="leaf" />Apply Leave</button>
      </div>
    </section>
    {visible.length > 0 && <section className={styles.box} aria-label="Recently Opened"><h2 className={styles.title}><ExperienceIcon name="clock" />Recently Opened</h2>
      <div className={styles.recent}>{visible.map(row => row.kind === "attendance" ? <div key={row.kind + row.monthYear}>{calendar(row.monthYear!, true)}</div> :
        <button key={row.kind} type="button" onClick={() => open(row.kind as "reports" | "incentive" | "leave")}><ExperienceIcon name={row.kind === "reports" ? "document" : row.kind === "incentive" ? "chart" : "leaf"} />{recentTitles[row.kind]}</button>)}</div>
    </section>}
  </div>;
}

type HistoryItem = { id: string; kind: "profile" | "report"; createdAt: string; actorName?: string; changes?: ProfileChange[]; title?: string; report?: { id: string; title: string } | null };
export function EmployeeChangeHistory({ employeeId }: { employeeId: string }) {
  const [filter, setFilter] = useState("all"), [page, setPage] = useState(1);
  const [items, setItems] = useState<HistoryItem[]>([]), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [report, setReport] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setItems([]);
    fetch(`/api/profile-history?${new URLSearchParams({ filter, page: String(page) })}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not load history."); return result.data; })
      .then(data => { if (!controller.signal.aborted) { setItems(data.items); setHasMore(data.hasMore); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [employeeId, filter, page, retry]);
  return <section className={styles.experience} aria-label="Profile change history">
    <div className={styles.filters}>{["all", "profile", "reports"].map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div>
    {loading ? <FourDotsLoader label="Loading history…" /> : error ? <div className={styles.error} role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : <>
      {!items.length && <p>No history recorded yet.</p>}
      {items.map(item => <article key={item.id} className={styles.historyCard}>
        <h3 className={styles.historyTitle}><ExperienceIcon name={item.kind === "report" ? "document" : item.changes?.some(change => change.field === "branch") ? "branch" : "profile"} />{item.kind === "report" ? item.title : item.changes?.length === 1 ? `${item.changes[0].label} updated` : "Profile updated"}</h3>
        {item.changes?.map(change => <div key={change.field}>{item.changes!.length > 1 && <small>{change.label}</small>}<p className={styles.change}><del>{change.before || "Not set"}</del><span aria-label="changed to">→</span><strong>{change.after || "Not set"}</strong></p></div>)}
        {item.report && <><p>{item.report.title}</p><button type="button" className={styles.reportButton} onClick={() => setReport(item.report!)}><ExperienceIcon name="open" />View Report</button></>}
        <p className={styles.meta}>{new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · Updated by {item.actorName || "HR / Admin"}</p>
      </article>)}
      <div className={styles.filters}>{page > 1 && <button type="button" onClick={() => setPage(value => value - 1)}>Previous</button>}{hasMore && <button type="button" onClick={() => setPage(value => value + 1)}>Next</button>}</div>
    </>}
    {report && <EmployeeReportViewer report={report} onClose={() => setReport(null)} />}
  </section>;
}

type Balance = { financialYear: string; earned: number; used: number; currentBalance: number; rows: { monthYear: string; earned: number; used: number; balance: number }[] };
type LeaveRecord = { id: string; monthYear: string; leave: number; reason?: string };
export function EmployeeAttendanceLeaves({ employee, showLeaves, leaves, loading }: {
  employee: Employee; showLeaves: boolean; leaves: { balance: Balance; records: LeaveRecord[] } | null; loading: boolean;
}) {
  const [tab, setTab] = useState("attendance"), [selected, setSelected] = useState("");
  const months = attendanceCalendarMonths().reverse();
  const balanceRows = leaves?.balance.rows || [], records = leaves?.records || [];
  const sortKey = (value: string) => { const [m, y] = value.split("/").map(Number); return y * 12 + m; };
  const choices = Array.from(new Set((tab === "balance" ? balanceRows : records).map(row => row.monthYear))).sort((a, b) => sortKey(b) - sortKey(a));
  const month = choices.includes(selected) ? selected : choices[0] || "";
  const rowIndex = balanceRows.findIndex(row => row.monthYear === month), row = balanceRows[rowIndex];
  const overused = row && Number(row.used || 0) > (rowIndex > 0 ? Number(balanceRows[rowIndex - 1]?.balance || 0) : 0) + Number(row.earned || 0);
  const activeTab = !showLeaves ? "attendance" : tab;
  return <section className={`${styles.leaveSection} ${styles.experience}`} aria-label="Attendance and leaves">
    <div className={styles.leaveHead}><h2 className={styles.title}><ExperienceIcon name="calendar" />Attendance &amp; Leaves</h2>{showLeaves && leaves && <span>Financial Year: {leaves.balance.financialYear}</span>}</div>
    {showLeaves && leaves && <div className={styles.balanceSummary}>
      <div><span>Earned Till Current Month</span><b>{leaves.balance.earned}</b></div><div><span>Used Till Last Month</span><b>{leaves.balance.used}</b></div><div><span>Current Balance</span><b>{leaves.balance.currentBalance}</b></div>
    </div>}
    {showLeaves && <div className={styles.tabs} role="tablist" aria-label="Attendance and leave sections">{[["attendance", "Attendance"], ["balance", "Leave Balance"], ["leaves", "Monthwise Leaves"]].map(([key, label]) => <button key={key} role="tab" type="button" aria-selected={activeTab === key} onClick={() => { setTab(key); setSelected(""); }}>{label}</button>)}</div>}
    {loading ? <FourDotsLoader label="Loading attendance and leaves…" /> : <>
      {activeTab === "attendance" && <div className={styles.months}>{months.map(monthYear => <div key={monthYear} className={styles.monthButton}><MonthlyAttendanceCalendar employee={employee} monthYear={monthYear} onOpen={() => rememberEmployeePage(employee.id, { kind: "attendance", monthYear })}><ExperienceIcon name="calendar" />{monthLabel(monthYear)}</MonthlyAttendanceCalendar></div>)}</div>}
      {activeTab !== "attendance" && <>
        {choices.length > 0 ? <label className={styles.monthSelect}>Month<select aria-label="Leave month" value={month} onChange={event => setSelected(event.target.value)}>{choices.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label> : <p>No leave records available.</p>}
        {activeTab === "balance" && row && <><div className={styles.numbers}><div><span>Earned</span><b>{row.earned}</b></div><div><span>Used</span><b>{row.used}</b></div><div><span>Balance</span><b>{row.balance}</b></div></div>{overused && <p className={styles.overused}>Used leaves exceed the available balance for this month.</p>}</>}
        {activeTab === "leaves" && records.filter(record => record.monthYear === month).map(record => <div key={record.id} className={styles.remark}><strong>Leaves: {record.leave}</strong><p>Reason / Remark: {record.reason || "—"}</p></div>)}
      </>}
    </>}
  </section>;
}
