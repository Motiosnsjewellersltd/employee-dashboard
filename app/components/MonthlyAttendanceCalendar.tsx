"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./MonthlyAttendanceCalendar.module.css";

type CalendarEmployee = {
  id: string;
  name: string;
  employeeCode?: string | null;
  branch?: string | null;
};

type AttendanceCode = "P" | "A" | "R" | "H" | "SL";
type UploadResult = { matched: number; skipped: number; issues: Array<{ row: number; name: string; reason: string }> };
const labels: Record<AttendanceCode, string> = { P: "Present", A: "Absent", H: "Half Day", R: "Week Off", SL: "Short Leave" };

function indiaTodayKey() {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return value("year") * 10000 + value("month") * 100 + value("day");
}

function MonthPopup({ employee, monthYear, onClose }: {
  employee: CalendarEmployee;
  monthYear: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [todayKey, setTodayKey] = useState(indiaTodayKey);
  const [days, setDays] = useState<Record<string, AttendanceCode>>({});
  const [canUpload, setCanUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canonicalMonth = monthYear.replace(/^(\d)\//, "0$1/");
  closeRef.current = onClose;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/attendance-calendar?${new URLSearchParams({ employeeId: employee.id, monthYear: canonicalMonth })}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Could not load attendance.");
        setDays(result.data.days); setCanUpload(result.data.canUpload);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load attendance.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [employee.id, canonicalMonth]);

  async function upload(action: "preview" | "import", selected: File) {
    setBusy(true); setError(""); setNotice("");
    if (action === "preview") setPreview(null);
    try {
      const form = new FormData();
      form.append("file", selected); form.append("monthYear", canonicalMonth); form.append("action", action);
      const response = await fetch("/api/attendance-calendar", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Attendance upload failed.");
      setPreview(result.data);
      if (action === "import") {
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        setNotice(`Attendance saved for ${result.data.matched} employees. ${result.data.skipped} rows skipped.`);
        const refresh = await fetch(`/api/attendance-calendar?${new URLSearchParams({ employeeId: employee.id, monthYear: canonicalMonth })}`, { cache: "no-store" });
        const refreshed = await refresh.json();
        if (!refresh.ok || !refreshed.ok) throw new Error("Upload saved. Close and reopen the calendar to reload attendance.");
        setDays(refreshed.data.days);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Attendance upload failed."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const refreshDate = () => setTodayKey(indiaTodayKey());
    const dateTimer = window.setInterval(refreshDate, 60000);
    window.addEventListener("focus", refreshDate);

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Do not let the underlying employee-profile modal also close.
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }

    window.addEventListener("keydown", handleKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey, true);
      window.clearInterval(dateTimer);
      window.removeEventListener("focus", refreshDate);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const [month, year] = monthYear.split("/").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const counts: Record<AttendanceCode, number> = { P: 0, A: 0, H: 0, R: 0, SL: 0 };
  for (let day = 1; day <= daysInMonth; day++) {
    if (year * 10000 + month * 100 + day > todayKey) continue;
    const code = days[String(day)];
    if (code && Object.prototype.hasOwnProperty.call(counts, code)) counts[code]++;
  }

  return createPortal(<div className={styles.backdrop} onMouseDown={event => {
    event.stopPropagation();
    if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label={`${employee.name} — ${monthLabel} attendance calendar`}>
      <header className={styles.header}>
        <div><h2>Monthly Attendance Calendar</h2><p>{employee.name}{employee.employeeCode ? ` · ${employee.employeeCode}` : ""}{employee.branch ? ` · ${employee.branch}` : ""}</p></div>
        <button type="button" className={styles.close} aria-label="Close attendance calendar" onClick={onClose}>×</button>
      </header>
      <h3 className={styles.month}>{monthLabel}</h3>
      {!loading && !error && <dl className={styles.summary} aria-label="Monthly attendance counts">
        {(["P", "A", "H", "SL", "R"] as AttendanceCode[]).map(code => <div key={code} className={styles[`status${code}`]}>
          <dt>{labels[code]} ({code})</dt><dd>{counts[code]}</dd>
        </div>)}
      </dl>}
      {loading && <p className={styles.message} role="status">Loading attendance…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.message} role="status">{notice}</p>}
      <table className={styles.calendar} aria-label={monthLabel}>
        <thead><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>
          {cells.slice(week * 7, week * 7 + 7).map((day, index) => {
            const future = day !== null && year * 10000 + month * 100 + day > todayKey;
            const code = day !== null && !future ? days[String(day)] : undefined;
            return <td key={index} className={day === null ? styles.blank : future ? styles.future : code ? styles[`status${code}`] : undefined}
              title={day === null ? undefined : `${day} ${monthLabel} — ${future ? "Upcoming date" : code ? labels[code] : "No attendance data"}`}
              aria-label={day === null ? undefined : `${day} ${monthLabel} — ${future ? "upcoming date" : code ? labels[code] : "No attendance data"}`}>
              {day !== null && <span>{day}{code && <small className={styles.code}>{code}</small>}</span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      <div className={styles.legend} aria-label="Attendance colour guide">{(["P", "A", "H", "R", "SL"] as AttendanceCode[]).map(code => <span key={code}><i className={styles[`status${code}`]} />{code} · {labels[code]}</span>)}</div>
      {!loading && !Object.keys(days).length && !error && <p className={styles.message}>No attendance uploaded for this employee and month.</p>}
      {canUpload && <section className={styles.upload} aria-label="Import monthly attendance">
        <label htmlFor="attendance-file">Upload {monthLabel} Excel — all employees in the file</label>
        <input ref={fileInput} id="attendance-file" type="file" accept=".xlsx" disabled={busy} onChange={event => {
          const selected = event.target.files?.[0] || null;
          setFile(selected); setPreview(null); setNotice("");
          if (selected) void upload("preview", selected);
        }} />
        <p>Matches by employee code. Re-upload replaces that month’s attendance for matched employees only. Blank dates remain unmarked.</p>
        {busy && <p role="status">Processing attendance…</p>}
        {preview && <>
          <p>{preview.matched} matched · {preview.skipped} skipped</p>
          {preview.issues.length > 0 && <div className={styles.issues}>{preview.issues.map((issue, index) => <p key={index}>Row {issue.row} · {issue.name}: {issue.reason}</p>)}</div>}
          {file && <button className={styles.importButton} type="button" disabled={busy} onClick={() => void upload("import", file)}>Import attendance for {preview.matched} employees</button>}
        </>}
      </section>}
    </div>
  </div>, document.body);
}

// Mounted only for Admin/HR in the existing employee-details month cells.
// Attendance imports are internal; no employee notifications are sent.
export default function MonthlyAttendanceCalendar({ employee, monthYear }: {
  employee: CalendarEmployee;
  monthYear: string;
}) {
  const [open, setOpen] = useState(false);
  const validMonth = /^(0?[1-9]|1[0-2])\/\d{4}$/.test(monthYear);
  if (!validMonth) return <>{monthYear}</>;

  return <>
    <button type="button" className={styles.monthLink} aria-label={`Open ${monthYear} calendar for ${employee.name}`} onClick={() => setOpen(true)}>{monthYear}</button>
    {open && <MonthPopup employee={employee} monthYear={monthYear} onClose={() => setOpen(false)} />}
  </>;
}
