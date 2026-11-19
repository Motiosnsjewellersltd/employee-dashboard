"use client";
import { useEffect, useRef, useState } from "react";
import { notificationTime } from "@/lib/notificationTime";
import styles from "./LeaveWorkflow.module.css";
type Workflow = { id: string; status: string; overdue?: boolean; waiting?: { stage: string; since: string; next: string; owners: string[] } | null; closureReason?: string | null; decidedAt?: string | null; decidedBy?: { name: string } | null; requester?: { name: string } };
function CloseDialog({ row, onClose, onResolved }: { row: Workflow; onClose: () => void; onResolved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(""), [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!reason.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/leave-requests/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, reason: reason.trim() }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not close request.");
      onResolved(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not close request."); setSaving(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} aria-labelledby="close-leave-title">
    <form onSubmit={submit}><h2 id="close-leave-title">Close Overdue Request</h2><p>{row.requester?.name}</p><p>Closes this request without approval, rejection or attendance / leave balance changes.</p>
      <label htmlFor="leave-closure-reason">Closure Reason</label><textarea id="leave-closure-reason" autoFocus required maxLength={2000} rows={4} value={reason} onChange={event => setReason(event.target.value)} disabled={saving} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" className="light" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving || !reason.trim()}>{saving ? "Closing…" : "Close Request"}</button></div>
    </form>
  </dialog>;
}
export default function LeaveWorkflowDetails({ row, isAdmin, onResolved }: { row: Workflow; isAdmin: boolean; onResolved: () => void }) {
  const [closing, setClosing] = useState(false);
  return <div className={styles.workflow}>
    {row.overdue && <strong className={styles.overdue}>Overdue—Review Required</strong>}
    {row.waiting && <details><summary>Waiting: {row.waiting.stage}</summary><div className={styles.waiting}>
      <span>With: {row.waiting.owners.length ? row.waiting.owners.join(", ") : "No active approver found"}</span>
      <span>Since: {notificationTime(row.waiting.since)}</span><span>Next: {row.waiting.next}</span>
    </div></details>}
    {row.status === "CLOSED" && <div className={styles.waiting}><span>Closed by: {row.decidedBy?.name || "—"}</span><span>{notificationTime(row.decidedAt || null)}</span><span>Reason: {row.closureReason || "—"}</span></div>}
    {isAdmin && row.status === "PENDING" && row.overdue && <button className={styles.closeButton} type="button" onClick={() => setClosing(true)}>Close Request</button>}
    {closing && <CloseDialog row={row} onClose={() => setClosing(false)} onResolved={onResolved} />}
  </div>;
}
