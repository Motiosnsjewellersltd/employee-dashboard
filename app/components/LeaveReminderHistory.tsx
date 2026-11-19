"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NotificationDelivery, { type DeliveryRecipient } from "./NotificationDelivery";
import FourDotsLoader from "./FourDotsLoader";
import styles from "./LeaveReminderHistory.module.css";
export type ReminderSummary = { count: number; lastAt: string | null };
type Entry = { id: string; type: string; createdAt: string; recipients: DeliveryRecipient[] };
export function reminderHistoryTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(date).replace(/\b(am|pm)\b/g, text => text.toUpperCase()) + " IST";
}
function HistoryDialog({ requestId, employeeName, onClose, onSummary }: { requestId: string; employeeName: string; onClose: () => void; onSummary?: (summary: ReminderSummary) => void }) {
  const dialog = useRef<HTMLDivElement>(null), pending = useRef<AbortController | null>(null);
  const close = useRef(onClose), update = useRef(onSummary); close.current = onClose; update.current = onSummary;
  const [items, setItems] = useState<Entry[]>([]), [total, setTotal] = useState<number | null>(null), [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  async function load(cursor = "") {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/leave-reminders/history?${new URLSearchParams({ requestId, ...(cursor ? { cursor } : {}) })}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not load reminder history.");
      if (controller.signal.aborted) return;
      const data = result.data;
      setItems(previous => cursor ? [...previous, ...data.items] : data.items); setTotal(data.total); setNextCursor(data.nextCursor);
      if (!cursor) update.current?.({ count: data.total, lastAt: data.items[0]?.createdAt || null });
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load reminder history."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => pending.current?.abort(); }, [requestId]);
  useEffect(() => {
    const previousFocus = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []), first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", handleKey, true); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  return createPortal(<div className={styles.backdrop} onMouseDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-label={`Reminder history for ${employeeName}`}>
      <header className={styles.header}><div><h2>Reminder History</h2><p>{employeeName}</p></div><button type="button" className={styles.close} aria-label="Close reminder history" onClick={onClose}>×</button></header>
      <div className={styles.toolbar}><strong>Total reminders: {total ?? "—"}</strong><button type="button" className={styles.refresh} disabled={loading} onClick={() => void load()}>Refresh</button></div>
      <div className={styles.content}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && <FourDotsLoader label="Loading reminder history…" />}
        {!loading && !error && !items.length && <p className={styles.empty}>No reminders recorded for this request.</p>}
        {items.length > 0 && <ol className={styles.list}>{items.map(item => <li key={item.id}>
          <div className={styles.event}><strong>{item.type}</strong><time dateTime={item.createdAt}>{reminderHistoryTime(item.createdAt)}</time></div>
          <p><span className={styles.recipientLabel}>Sent to: </span>{item.recipients.length ? item.recipients.map((person, index) => <span key={index}>{index ? ", " : ""}{person.name}{person.role === "HR" || person.role === "ADMIN" ? ` (${person.role})` : ""}</span>) : "Recipient record unavailable"}</p>
          <NotificationDelivery createdAt={item.createdAt} recipients={item.recipients} />
        </li>)}</ol>}
        {nextCursor && <button type="button" className={styles.more} disabled={loading} onClick={() => void load(nextCursor)}>Load More</button>}
      </div>
      <p className={styles.note}>App notification records; phone delivery is not confirmed.</p>
    </div>
  </div>, document.body);
}
export default function LeaveReminderHistory({ requestId, employeeName, summary, onSummary }: { requestId: string; employeeName: string; summary?: ReminderSummary; onSummary?: (summary: ReminderSummary) => void }) {
  const [open, setOpen] = useState(false);
  return <div className={styles.row}>
    <button type="button" className={styles.trigger} aria-label={`View reminder history for ${employeeName}`} onClick={() => setOpen(true)}>Reminders: {summary?.count ?? "—"}</button>
    {summary?.lastAt && <small className={styles.last}>Last: <time dateTime={summary.lastAt}>{reminderHistoryTime(summary.lastAt)}</time></small>}
    {open && <HistoryDialog requestId={requestId} employeeName={employeeName} onClose={() => setOpen(false)} onSummary={onSummary} />}
  </div>;
}
