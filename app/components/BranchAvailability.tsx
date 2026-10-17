"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { indiaDateKey } from "@/lib/branchAvailability";
import type { AvailabilityGroup, AvailabilityGroups } from "@/lib/branchAvailability";
import styles from "./BranchAvailability.module.css";

type Result = { date: string; branch: string; future: boolean; today: string; total: number; groups: AvailabilityGroups };
const order: AvailabilityGroup[] = ["available", "pending", "approved", "weekOff", "absent", "unrecorded"];
const labels: Record<AvailabilityGroup, string> = {
  available: "Recorded Present", pending: "Pending Leave", approved: "Approved Leave",
  weekOff: "Week Off", absent: "Recorded Absent", unrecorded: "Not Recorded"
};

function AvailabilityPopup({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(indiaDateKey);
  const [branch, setBranch] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<AvailabilityGroup>("available");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []);
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setVersion(value => value + 1);
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError("");
    if (!branch || !date) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    async function load() {
      try {
        const response = await fetch(`/api/branch-availability?${new URLSearchParams({ date, branch })}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Could not load availability.");
        if (!controller.signal.aborted) setResult(data.data);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load availability."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [date, branch, version]);

  // Never show a previous date/branch response under newly selected filters.
  const current = result?.date === date && result.branch === branch ? result : null;
  const title = (group: AvailabilityGroup) => group === "available" && current?.future ? "Expected Available"
    : group === "absent" && current?.future ? "Marked Absent" : labels[group];

  return createPortal(<div className={styles.backdrop} onMouseDown={event => {
    event.stopPropagation(); if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="branch-availability-title">
      <header className={styles.header}><h2 id="branch-availability-title">Salesperson Availability</h2><button className={styles.close} type="button" aria-label="Close availability calendar" onClick={onClose}>×</button></header>
      <p className={styles.scope}>Sales Executive designation · Current active team and branch assignments</p>
      <div className={styles.filters}>
        <label>Date<input type="date" value={date} onChange={event => { setDate(event.target.value); setSelected("available"); }} /></label>
        <label>Branch<select value={branch} onChange={event => { setBranch(event.target.value); setSelected("available"); }}><option value="">Select branch</option><option value="MT">MT</option><option value="JB">JB</option><option value="VN">VN</option></select></label>
        <button type="button" className={styles.refresh} disabled={loading || !date || !branch} onClick={() => setVersion(value => value + 1)}>Refresh</button>
      </div>
      {!branch && <p className={styles.notice}>Select a branch to see counts.</p>}
      {loading && <p className={styles.notice} role="status">Loading availability…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {current && <>
        <p className={styles.notice}>{current.future ? "Expected availability: pending leave is shown separately. Future attendance is an estimate." : "Presence is based on recorded attendance. Missing attendance is shown as Not Recorded."} Approved leave, including half-day requests, is excluded from the available count.</p>
        <div className={styles.counts} aria-label="Salesperson availability counts">
          {order.map(group => <button key={group} type="button" className={`${styles.count} ${styles[group]} ${selected === group ? styles.selected : ""}`} aria-pressed={selected === group} onClick={() => setSelected(group)}>
            <span>{title(group)}</span><strong>{current.groups[group].length}</strong>
          </button>)}
        </div>
        <h3 className={styles.listTitle}>{title(selected)} · {current.groups[selected].length}<small>Total eligible salespersons: {current.total}</small></h3>
        <div className={styles.people}>
          {current.groups[selected].length === 0 ? <p className={styles.notice}>No employees in this category.</p> : current.groups[selected].map(person => <article key={person.id} className={styles.person}>
            <h4>{person.name}{person.employeeCode && <small> · {person.employeeCode}</small>}</h4>
            <dl><div><dt>Department</dt><dd>{person.department || "—"}</dd></div><div><dt>Designation</dt><dd>{person.designation || "—"}</dd></div></dl>
            <p className={selected === "pending" ? styles.pendingText : styles.personNote}>{selected === "pending" && <strong>Pending · </strong>}{person.note}</p>
          </article>)}
        </div>
      </>}
    </div>
  </div>, document.body);
}

export default function BranchAvailability() {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={`light ${styles.trigger}`} onClick={() => setOpen(true)}><span aria-hidden="true">▦</span> Branch Calendar</button>{open && <AvailabilityPopup onClose={() => setOpen(false)} />}</>;
}
