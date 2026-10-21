"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./BiometricPunchTimes.module.css";

type Punch = { id: string; punchedAt: string; direction: string };
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function BiometricPunchTimes({ employeeId, monthYear }: { employeeId: string; monthYear: string }) {
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

  const grouped = new Map<string, Punch[]>();
  for (const punch of punches) {
    const date = dateFormat.format(new Date(punch.punchedAt));
    grouped.set(date, [...(grouped.get(date) || []), punch]);
  }

  return <section className={styles.section} aria-label="Biometric punch times">
    <div className={styles.header}>
      <h3>Punch IN / OUT</h3>
      <button type="button" onClick={() => setRefresh(value => value + 1)} aria-label="Refresh punch times">Refresh</button>
    </div>
    {loading && <p role="status">Loading punch times…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!loading && !error && !configured && <p>Punch integration setup pending.</p>}
    {!loading && !error && configured && !punches.length && <p>No punch records received for this month.</p>}
    {!loading && !error && punches.length > 0 && <div className={styles.list}>
      <div className={styles.columns} aria-hidden="true"><strong>Date</strong><strong>First IN</strong><strong>Last OUT</strong></div>
      {[...grouped].map(([date, events]) => {
        const firstIn = events.find(punch => punch.direction === "IN");
        const lastOut = [...events].reverse().find(punch => punch.direction === "OUT");
        return <details key={date} className={styles.day}>
          <summary aria-label={`${date}: First IN ${firstIn ? timeFormat.format(new Date(firstIn.punchedAt)) : "not received"}; Last OUT ${lastOut ? timeFormat.format(new Date(lastOut.punchedAt)) : "not received"}. Show all punches.`}>
            <span>{date}</span>
            <span>{firstIn ? timeFormat.format(new Date(firstIn.punchedAt)) : "—"}</span>
            <span>{lastOut ? timeFormat.format(new Date(lastOut.punchedAt)) : "—"}</span>
          </summary>
          <ul>{events.map(punch => <li key={punch.id}><time dateTime={punch.punchedAt}>{timeFormat.format(new Date(punch.punchedAt))}</time><span>{punch.direction === "IN" || punch.direction === "OUT" ? punch.direction : "Direction unavailable"}</span></li>)}</ul>
        </details>;
      })}
    </div>}
  </section>;
}
