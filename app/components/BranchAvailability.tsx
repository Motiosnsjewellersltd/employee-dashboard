"use client";

import FourDotsLoader from "./FourDotsLoader";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { indiaDateKey } from "@/lib/branchAvailability";
import type { AvailabilityGroup, AvailabilityGroups, DesignationAvailability } from "@/lib/branchAvailability";
import styles from "./BranchAvailability.module.css";

type Result = { date: string; branch: string; future: boolean; today: string; total: number; groups: AvailabilityGroups; designations: DesignationAvailability[] };
type Detail = { item: DesignationAvailability; group: AvailabilityGroup; allDesignations?: boolean };
const order: AvailabilityGroup[] = ["available", "pending", "approved", "weekOff", "absent", "unrecorded"];
const labels: Record<AvailabilityGroup, string> = {
  available: "Present", pending: "Leave Request Pending", approved: "Leave Request Approved",
  weekOff: "Week Off", absent: "Absent", unrecorded: "Not Recorded"
};
function groupTitle(group: AvailabilityGroup, future: boolean) {
  return group === "available" && future ? "Expected" : labels[group];
}

function EmployeeCountPopup({ detail, date, branch, future, onClose, returnFocus }: {
  detail: Detail; date: string; branch: string; future: boolean; onClose: () => void; returnFocus: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const fallbackFocus = useRef(returnFocus);
  close.current = onClose;
  fallbackFocus.current = returnFocus;
  const [query, setQuery] = useState("");
  const people = detail.item.groups[detail.group];
  const term = query.trim().toLowerCase();
  const visible = people.filter(person => `${person.name} ${person.employeeCode || ""} ${person.department || ""} ${person.floor || ""} ${person.designation || ""}`.toLowerCase().includes(term));

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      else fallbackFocus.current();
    };
  }, []);

  return createPortal(<div className={`${styles.backdrop} ${styles.detailBackdrop}`} onMouseDown={event => {
    event.stopPropagation(); if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={dialog} className={`${styles.dialog} ${styles.detailDialog}`} role="dialog" aria-modal="true" aria-labelledby="availability-detail-title">
      <header className={styles.header}>
        <div><h2 id="availability-detail-title">{detail.item.designation}</h2><p className={styles.detailMeta}>{date.split("-").reverse().join("/")} · {branch === "FACTORY" ? "Factory" : branch} · {groupTitle(detail.group, future)} <strong>{people.length}</strong></p></div>
        <button type="button" className={styles.close} aria-label="Close employee list" onClick={onClose}>×</button>
      </header>
      <input className={styles.search} type="search" aria-label="Search employee list" placeholder={detail.allDesignations ? "Search name, ID, floor or designation" : "Search name, ID or department"} value={query} onChange={event => setQuery(event.target.value)} />
      <div className={styles.people}>
        {visible.length === 0 ? <p className={styles.notice}>No employees found.</p> : visible.map(person => <article key={person.id} className={styles.person}>
          <h3>{person.name}{person.employeeCode && <small> · {person.employeeCode}</small>}</h3>
          <dl><div><dt>{detail.allDesignations ? "Floor" : "Department"}</dt><dd>{(detail.allDesignations ? person.floor : person.department) || "—"}</dd></div><div><dt>Designation</dt><dd>{person.designation || "—"}</dd></div></dl>
          {(detail.group === "pending" || /half.day|short leave/i.test(person.note)) && <p className={detail.group === "pending" ? styles.pendingText : styles.personNote}>
            {[detail.group === "pending" ? person.note.includes("final HR") ? "Pending HR" : "Pending" : "", /half.day/i.test(person.note) ? "Half Day" : "", /short leave/i.test(person.note) ? "Short Leave" : ""].filter(Boolean).join(" · ")}
          </p>}
        </article>)}
      </div>
    </div>
  </div>, document.body);
}

function AvailabilityPopup({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(indiaDateKey);
  const [branch, setBranch] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (detailRef.current) return;
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
    setError("");
    if (!branch || !date) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    async function load() {
      try {
        const response = await fetch(`/api/branch-availability?${new URLSearchParams({ date, branch })}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Could not load availability.");
        if (!controller.signal.aborted) {
          const next = data.data as Result;
          setResult(next);
          setDetail(previous => {
            if (!previous) return null;
            if (previous.allDesignations) return { ...previous, item: { key: "", designation: "All Designations", total: next.total, groups: next.groups } };
            const item = next.designations.find(entry => entry.key === previous.item.key);
            return item ? { item, group: previous.group } : null;
          });
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load availability."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [date, branch, version]);

  const current = result?.date === date && result.branch === branch ? result : null;
  const term = query.trim().toLowerCase();
  const designations = current?.designations.filter(item => item.designation.toLowerCase().includes(term)) || [];
  const resetFilters = () => { setDetail(null); setQuery(""); };

  return createPortal(<>
    <div className={styles.backdrop} onMouseDown={event => {
      event.stopPropagation(); if (event.target === event.currentTarget && !detail) onClose();
    }}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal={!detail} aria-hidden={detail ? true : undefined} inert={Boolean(detail)} aria-labelledby="branch-availability-title">
        <header className={styles.header}><h2 id="branch-availability-title">Employee Availability</h2><button className={styles.close} type="button" aria-label="Close availability calendar" onClick={onClose}>×</button></header>
        <div className={styles.filters}>
          <label>Date<input type="date" value={date} onChange={event => { setDate(event.target.value); resetFilters(); }} /></label>
          <label>Branch<select value={branch} onChange={event => { setBranch(event.target.value); resetFilters(); }}><option value="">Select branch</option><option value="MT">MT</option><option value="JB">JB</option><option value="VN">VN</option><option value="FACTORY">Factory</option></select></label>
          <button type="button" className={styles.refresh} disabled={loading || !date || !branch} onClick={() => setVersion(value => value + 1)}>Refresh</button>
        </div>
        {!branch && <p className={styles.notice}>Select branch.</p>}
        {loading && <FourDotsLoader label="Loading…" />}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {current && <>
          <input className={styles.search} type="search" aria-label="Search designation" placeholder="Search designation" value={query} onChange={event => setQuery(event.target.value)} />
          <div className={styles.roster} aria-label="Availability by designation">
            <div className={styles.rosterHeader} aria-label="Selected branch totals"><span>Designation</span>{order.map(group => <button key={group} type="button" className={styles.headerCount} aria-haspopup="dialog" aria-label={`All designations: ${groupTitle(group, current.future)} ${current.groups[group].length}`} onClick={() => setDetail({ item: { key: "", designation: "All Designations", total: current.total, groups: current.groups }, group, allDesignations: true })}>{groupTitle(group, current.future)}<strong className={styles.headerTotal}>{current.groups[group].length}</strong></button>)}</div>
            {designations.length === 0 ? <p className={styles.notice}>No designations found.</p> : designations.map(item => <article key={item.key} className={styles.rosterRow}>
              <h3>{item.designation}<small>{item.total}</small></h3>
              {order.map(group => <button key={group} type="button" className={`${styles.count} ${styles[group]}`} aria-haspopup="dialog" aria-label={`${item.designation}: ${groupTitle(group, current.future)} ${item.groups[group].length}`} onClick={() => setDetail({ item, group })}>
                <span>{groupTitle(group, current.future)}</span><strong>{item.groups[group].length}</strong>
              </button>)}
            </article>)}
          </div>
        </>}
      </div>
    </div>
    {detail && current && <EmployeeCountPopup detail={detail} date={date} branch={branch} future={current.future} onClose={() => setDetail(null)} returnFocus={() => dialog.current?.querySelector<HTMLButtonElement>("button")?.focus()} />}
  </>, document.body);
}

export default function BranchAvailability() {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={`light ${styles.trigger}`} onClick={() => setOpen(true)}><span aria-hidden="true">▦</span> Branch Calendar</button>{open && <AvailabilityPopup onClose={() => setOpen(false)} />}</>;
}
