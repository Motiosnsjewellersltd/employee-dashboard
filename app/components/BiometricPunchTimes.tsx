"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./BiometricPunchTimes.module.css";

type Punch = { id: string; punchedAt: string; direction: string };
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function BiometricPunchTimes({ employeeId, monthYear, day, employeeName, onClose }: {
  employeeId: string; monthYear: string; day: number; employeeName: string; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    busy.current = false;
    async function load() {
      if (document.hidden || busy.current) return;
      busy.current = true;
      try {
        const response = await fetch(`/api/biometric-punches?${new URLSearchParams({ employeeId, monthYear })}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Could not load punch times.");
        if (controller.signal.aborted) return;
        setPunches(result.data.punches);
        setConfigured(result.data.configured !== false);
        setError("");
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load punch times.");
      } finally {
        if (!controller.signal.aborted) { busy.current = false; setLoading(false); }
      }
    }
    void load();
    // Refresh this Admin/HR view only. This does not poll or connect the machine.
    const timer = window.setInterval(() => void load(), 15000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [employeeId, monthYear, refresh]);

  const [month, year] = monthYear.split("/").map(Number);
  const selectedDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  const events = punches.filter(punch => dateFormat.format(new Date(punch.punchedAt)) === selectedDate)
    .sort((a, b) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt));
  const latestIn = [...events].reverse().find(punch => punch.direction === "IN");
  const lastOut = [...events].reverse().find(punch => punch.direction === "OUT");

  return <div className={styles.backdrop} onMouseDown={event => {
    event.stopPropagation();
    if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={dialogRef} data-punch-dialog className={styles.dialog} role="dialog" aria-modal="true" aria-label={`${employeeName} — ${selectedDate} punch times`}>
      <div className={styles.header}>
        <div><h3>{selectedDate}</h3><p>{employeeName}</p></div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close punch times">×</button>
      </div>
      {loading && <p role="status">Loading punch times…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!loading && !error && !configured && <p>Punch integration setup pending.</p>}
      {!loading && !error && configured && <>
        <div className={styles.totals}>
          <div><span>Latest IN</span><strong>{latestIn ? timeFormat.format(new Date(latestIn.punchedAt)) : "—"}</strong></div>
          <div><span>Latest OUT</span><strong>{lastOut ? timeFormat.format(new Date(lastOut.punchedAt)) : "—"}</strong></div>
        </div>
        {!events.length && <p>No punch records received for this date.</p>}
      </>}
      <button type="button" className={styles.refresh} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    </div>
  </div>;
}
