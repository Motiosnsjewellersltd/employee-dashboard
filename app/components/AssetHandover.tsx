"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AssetHandover.module.css";
import FourDotsLoader from "./FourDotsLoader";

type Employee = { id: string; name: string; employeeCode?: string | null; branch?: string | null; department?: string | null; designation?: string | null; status?: string };
type Item = { id: string; itemType: string; itemName: string; identifier: string | null; employeeId: string | null; holderName: string; holderCode: string | null; holderBranch: string | null; holderDepartment: string | null; holderDesignation: string | null; assignedOn: string; movementDate: string; condition: string; accessories: string; remarks: string; status: string; version: number };
type Event = { id: string; action: string; eventDate: string; actorName: string; createdAt: string; fromEmployee?: Employee | null; toEmployee?: Employee | null; details: { itemType: string; itemName: string; identifier: string | null; condition: string; accessories: string; remarks: string; previous?: { itemName: string; identifier?: string | null; condition: string; accessories: string; remarks: string } }; attachments: Array<{ id: string; fileName: string }> };
type Detail = Item & { events: Event[] };
type Mode = "CREATE" | "DELETE" | "DETAIL" | "EDIT" | "TRANSFER" | "RETURN" | "ASSIGN";
const types: Record<string, string> = { MOBILE: "Mobile", LAPTOP: "Laptop", SIM: "SIM Card", PEN_DRIVE: "Pen Drive", OTHER: "Other" };
const actions: Record<string, string> = { CREATE: "Handover", EDIT: "Edit Details", TRANSFER: "Transfer", RETURN: "Return Received", ASSIGN: "Handover Again" };
function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
function date(value: string) { return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC" }); }
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const json = await response.json();
  if (!response.ok || !json.ok) throw Object.assign(new Error(json.error || "Could not load handovers."), { status: response.status });
  return json.data;
}

function HandoverDialog({ item, employees, employeeId, mode: initialMode, canManage, onClose, onSaved }: {
  item: Item | null; employees: Employee[]; employeeId?: string; mode: Mode; canManage: boolean; onClose: () => void; onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const [mode, setMode] = useState<Mode>(initialMode === "DELETE" ? "DETAIL" : initialMode);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(item));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(initialMode === "DELETE");
  const busyRef = useRef(false);
  const requestId = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ itemType: item?.itemType || "MOBILE", itemName: item?.itemName || "", identifier: item?.identifier || "", employeeId: employeeId || "", date: today(), condition: item?.condition || "Good", accessories: item?.accessories || "", remarks: "" });

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; ref.current?.showModal();
    const closeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (!busyRef.current) onCloseRef.current(); }
    };
    window.addEventListener("keydown", closeKey, true);
    return () => { window.removeEventListener("keydown", closeKey, true); document.body.style.overflow = previousOverflow; if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  useEffect(() => {
    if (!item) return;
    const controller = new AbortController();
    request(`/api/asset-handovers?${new URLSearchParams({ id: item.id })}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail(data.handover); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [item?.id]);

  const current = detail || item;
  const selected = employees.find(employee => employee.id === form.employeeId);
  const field = (name: keyof typeof form, value: string) => setForm(currentForm => ({ ...currentForm, [name]: value }));
  function start(next: Mode) {
    if (!detail || busyRef.current) return;
    setForm({ itemType: detail.itemType, itemName: detail.itemName, identifier: detail.identifier || "", employeeId: "", date: today(), condition: detail.condition, accessories: detail.accessories, remarks: next === "EDIT" ? detail.remarks : "" });
    setConfirmDelete(false); setError(""); setMode(next);
  }
  async function deleteHandover() {
    if (!detail || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await request("/api/asset-handovers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.id, version: detail.version }) });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete handover."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.set(key, value));
      data.set("action", mode);
      if (mode === "CREATE") { requestId.current ||= crypto.randomUUID(); data.set("requestId", requestId.current); }
      if (current) { data.set("id", current.id); data.set("version", String(current.version)); }
      const attachment = fileRef.current?.files?.[0];
      if (attachment) { if (attachment.size > 4 * 1024 * 1024) throw new Error("Receipt/photo must be 4 MB or smaller."); data.set("attachment", attachment); }
      await request("/api/asset-handovers", { method: "POST", body: data });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save handover."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return createPortal(<dialog ref={ref} className={styles.dialog} aria-label={mode === "DETAIL" ? "Handover details" : actions[mode]}
    onCancel={event => { event.preventDefault(); if (!busyRef.current) onClose(); }}>
    <header className={styles.dialogHead}><h2>{mode === "DETAIL" ? "Handover Details" : mode === "CREATE" ? "Add Handover" : actions[mode]}</h2>
      <button type="button" className={styles.close} aria-label="Close handover" disabled={busy} onClick={onClose}>×</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading && <FourDotsLoader label="Loading details…" />}
    {mode === "DETAIL" && current && <>
      <div className={styles.detailTop}><strong>{types[current.itemType]} · {current.itemName}</strong><span>{current.identifier || "—"}</span>
        <span className={styles.badge}>{current.status === "ASSIGNED" ? "Assigned" : "Returned"}</span></div>
      <dl className={styles.details}>
        <div><dt>{current.status === "ASSIGNED" ? "Current Holder" : "Last Holder"}</dt><dd>{current.holderName}{current.holderCode ? ` · ${current.holderCode}` : ""}</dd></div>
        <div><dt>Branch / Department</dt><dd>{[current.holderBranch, current.holderDepartment].filter(Boolean).join(" · ") || "—"}</dd></div>
        <div><dt>Designation</dt><dd>{current.holderDesignation || "—"}</dd></div>
        <div><dt>Given On</dt><dd>{date(current.assignedOn)}</dd></div>
        <div><dt>Condition</dt><dd>{current.condition}</dd></div>
        <div><dt>Accessories</dt><dd>{current.accessories || "—"}</dd></div>
      </dl>
      {current.remarks && <p className={styles.remarks}>{current.remarks}</p>}
      {canManage && !loading && detail && <div className={styles.buttons}>
        {current.status === "ASSIGNED" ? <><button type="button" onClick={() => start("TRANSFER")}>Transfer</button><button type="button" onClick={() => start("RETURN")}>Return Received</button></> : <button type="button" onClick={() => start("ASSIGN")}>Handover Again</button>}
        <button type="button" disabled={busy} onClick={() => start("EDIT")}>Edit Details</button>
        <button type="button" className={styles.danger} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>
      </div>}
      {confirmDelete && canManage && !loading && detail && <div className={styles.deleteConfirm} role="alert">
        <strong>Delete this handover?</strong>
        <p>{current.holderName} · {current.itemName}{current.identifier ? ` · ${current.identifier}` : ""}</p>
        <p>This handover, its complete history and receipts/photos will be permanently deleted.</p>
        <div className={styles.buttons}><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className={styles.danger} disabled={busy} onClick={deleteHandover}>{busy ? "Deleting…" : "Yes, Delete"}</button></div>
      </div>}
      <h3 className={styles.historyTitle}>History</h3>
      <ol className={styles.history}>{detail?.events.map(event => <li key={event.id}>
        <div className={styles.eventHead}><strong>{actions[event.action] || event.action}</strong><time>{date(event.eventDate)}</time></div>
        <p>{event.action === "EDIT" ? "Details updated" : event.fromEmployee && event.toEmployee ? `${event.fromEmployee.name} → ${event.toEmployee.name}` : event.toEmployee ? `Given to ${event.toEmployee.name}` : `Received from ${event.fromEmployee?.name || "previous holder"}`}</p>
        <p>{event.details.itemName}{event.details.identifier ? ` · ${event.details.identifier}` : ""}</p>
        <p>Condition: {event.details.condition}{event.details.accessories ? ` · Accessories: ${event.details.accessories}` : ""}</p>
        {event.details.previous && <p>Previously: {event.details.previous.itemName} · {event.details.previous.identifier || "—"} · {event.details.previous.condition}{event.details.previous.accessories ? ` · ${event.details.previous.accessories}` : ""}{event.details.previous.remarks ? ` · ${event.details.previous.remarks}` : ""}</p>}
        {event.details.remarks && <p>{event.details.remarks}</p>}
        <small>Recorded by {event.actorName}</small>
        {event.attachments.map(file => <a key={file.id} className={styles.attachment} href={`/api/asset-handovers/attachments/${encodeURIComponent(file.id)}`}>Download · {file.fileName}</a>)}
      </li>)}</ol>
    </>}
    {mode !== "DETAIL" && <form onSubmit={save} className={styles.form}>
      {(mode === "CREATE" || mode === "EDIT") && <>
        <label>Item Type<select value={form.itemType} onChange={event => field("itemType", event.target.value)}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Item Details<input required maxLength={200} value={form.itemName} onChange={event => field("itemName", event.target.value)} placeholder="Brand / model or item name" /></label>
        <label className={styles.full}>Serial / IMEI / Mobile Number<input maxLength={120} value={form.identifier} onChange={event => field("identifier", event.target.value)} /></label>
      </>}
      {["CREATE", "TRANSFER", "ASSIGN"].includes(mode) && <label className={styles.full}>{mode === "TRANSFER" ? "Transfer To" : "Employee"}<select aria-label={mode === "TRANSFER" ? "Transfer To" : "Employee"} required value={form.employeeId} onChange={event => field("employeeId", event.target.value)}>
        <option value="">Choose employee</option>{employees.filter(employee => mode !== "TRANSFER" || employee.id !== current?.employeeId).map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.employeeCode ? ` · ${employee.employeeCode}` : ""}{employee.status === "INACTIVE" ? " (Inactive)" : ""}</option>)}
      </select></label>}
      {selected && <p className={`${styles.selectedEmployee} ${styles.full}`}>{[selected.branch, selected.department, selected.designation].filter(Boolean).join(" · ") || "—"}</p>}
      {mode !== "EDIT" && <label>{mode === "RETURN" ? "Return Date" : mode === "TRANSFER" ? "Transfer Date" : "Handover Date"}<input type="date" required min={current?.movementDate?.slice(0, 10)} max={today()} value={form.date} onChange={event => field("date", event.target.value)} /></label>}
      <label>Condition<input required maxLength={200} value={form.condition} onChange={event => field("condition", event.target.value)} placeholder="Good / New / Damaged…" /></label>
      <label className={styles.full}>Accessories<input maxLength={500} value={form.accessories} onChange={event => field("accessories", event.target.value)} placeholder="Charger, case, cable…" /></label>
      <label className={styles.full}>Remarks<textarea maxLength={2000} value={form.remarks} onChange={event => field("remarks", event.target.value)} /></label>
      <label className={styles.full}>Photo / Receipt (optional · maximum 4 MB)<input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" /></label>
      <div className={`${styles.buttons} ${styles.full}`}><button type="button" disabled={busy} onClick={() => item ? (setMode("DETAIL"), setError("")) : onClose()}>Cancel</button><button className={styles.primary} type="submit" disabled={busy}>{busy ? "Saving…" : mode === "CREATE" ? "Save Handover" : actions[mode]}</button></div>
    </form>}
  </dialog>, document.body);
}

export default function AssetHandover({ employees = [], employeeId }: { employees?: Employee[]; employeeId?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [reload, setReload] = useState(0);
  const [filter, setFilter] = useState({ q: "", branch: "", employeeId: employeeId || "", itemType: "", status: "ASSIGNED" });
  const [dialog, setDialog] = useState<{ mode: Mode; item: Item | null } | null>(null);
  const compact = Boolean(employeeId);
  useEffect(() => {
    const refresh = () => { setPage(1); setReload(value => value + 1); };
    window.addEventListener("motisons-assets-updated", refresh);
    return () => window.removeEventListener("motisons-assets-updated", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ ...filter, employeeId: employeeId || filter.employeeId, page: String(page) });
      request(`/api/asset-handovers?${params}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total); setCanManage(data.canManage); setHidden(false); } })
        .catch(e => { if (!controller.signal.aborted) { if (compact && e.status === 403) setHidden(true); else setError(e.message); setItems([]); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filter, page, reload, employeeId, compact]);
  const change = (key: keyof typeof filter, value: string) => { setPage(1); setFilter(current => ({ ...current, [key]: value })); };
  if (hidden) return null;
  const branches = [...new Set([...employees.map(employee => employee.branch), ...items.map(item => item.holderBranch)].filter(Boolean) as string[])].sort();
  return <section className={`${styles.panel}${compact ? ` ${styles.compact}` : " panel"}`}>
    <header className={styles.head}>{compact ? <h2>Asset Handover</h2> : <h1>Asset Handover</h1>}
      <div className={styles.buttons}><button type="button" onClick={() => setReload(value => value + 1)} disabled={loading}>Refresh</button>{canManage && <button type="button" className={styles.primary} onClick={() => setDialog({ mode: "CREATE", item: null })}>+ Add Handover</button>}</div>
    </header>
    {!compact && <div className={styles.filters}>
      <input aria-label="Search handovers" placeholder="Employee, item or serial number" maxLength={200} value={filter.q} onChange={event => change("q", event.target.value)} />
      <select aria-label="Branch" value={filter.branch} onChange={event => change("branch", event.target.value)}><option value="">All Branches</option>{branches.map(branch => <option key={branch}>{branch}</option>)}</select>
      <select aria-label="Employee" value={filter.employeeId} onChange={event => change("employeeId", event.target.value)}><option value="">All Employees</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.employeeCode ? ` · ${employee.employeeCode}` : ""}</option>)}</select>
      <select aria-label="Item type" value={filter.itemType} onChange={event => change("itemType", event.target.value)}><option value="">All Items</option>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="Handover status" value={filter.status} onChange={event => change("status", event.target.value)}><option value="ASSIGNED">Assigned</option><option value="RETURNED">Returned</option><option value="">All Status</option></select>
    </div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <FourDotsLoader label="Loading handovers…" /> : !error && <>
      {!items.length ? <p className={styles.empty}>No handovers found.</p> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Employee</th><th>Item</th><th>Serial / Number</th><th>Given On</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td data-label="Employee"><strong>{item.holderName}</strong><small>{[item.holderCode, item.holderBranch].filter(Boolean).join(" · ")}</small></td>
          <td data-label="Item"><strong>{types[item.itemType]}</strong><small>{item.itemName}</small></td>
          <td data-label="Serial / Number">{item.identifier || "—"}</td><td data-label="Given On">{date(item.assignedOn)}</td>
          <td data-label="Status"><span className={styles.badge}>{item.status === "ASSIGNED" ? "Assigned" : "Returned"}</span></td>
          <td data-label="Action"><div className={styles.rowActions}><button type="button" onClick={() => setDialog({ mode: "DETAIL", item })}>View</button>{canManage && <button type="button" className={styles.danger} onClick={() => setDialog({ mode: "DELETE", item })}>Delete</button>}</div></td>
        </tr>)}</tbody></table></div>}
      {total > 50 && <div className={styles.pagination}><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} / {Math.ceil(total / 50)}</span><button type="button" disabled={page * 50 >= total} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    </>}
    {dialog && <HandoverDialog item={dialog.item} employees={employees} employeeId={employeeId} mode={dialog.mode} canManage={canManage} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); window.dispatchEvent(new Event("motisons-assets-updated")); }} />}
  </section>;
}
