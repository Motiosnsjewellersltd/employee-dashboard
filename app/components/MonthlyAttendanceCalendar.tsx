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
  closeRef.current = onClose;

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
        // The close button is the only interactive item in this read-only view.
        event.preventDefault();
        dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
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
      <table className={styles.calendar} aria-label={monthLabel}>
        <thead><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>
          {cells.slice(week * 7, week * 7 + 7).map((day, index) => {
            const future = day !== null && year * 10000 + month * 100 + day > todayKey;
            return <td key={index} className={day === null ? styles.blank : future ? styles.future : undefined}
              aria-label={future ? `${day} ${monthLabel} — upcoming date` : undefined}>
              {day !== null && <span>{day}</span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </div>, document.body);
}

// Mounted only for Admin/HR in the existing employee-details month cells.
// No API requests, attendance edits, storage writes or notifications.
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
