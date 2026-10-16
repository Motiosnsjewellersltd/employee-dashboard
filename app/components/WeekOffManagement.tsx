"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type WeekOffRow = {
  id: string; employeeCode?: string | null; name: string; branch?: string | null;
  department?: string | null; designation?: string | null;
  fixedWeekday: number | null; weekday: number | null; temporaryThisWeek: boolean;
  nextPermanent?: { effectiveDate: string; weekday: number } | null;
};
type Change = { kind: "PERMANENT" | "TEMPORARY"; weekday: number; previousWeekday: number | null; effectiveDate: string; changedAt: string; changedByName: string; reason: string };
const dayName = (day: number | null | undefined) => typeof day === "number" && day >= 0 && day <= 6 ? DAYS[day] : "Not Set";
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function weekOffApi(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || "Unable to load week-off data.");
  return body.data;
}

export function WeekOffProfile({ employeeId }: { employeeId: string }) {
  const [info, setInfo] = useState<{ fixedWeekday: number | null; weekday: number | null; temporaryThisWeek: boolean; nextPermanent: { effectiveDate: string; weekday: number } | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setInfo(null);
    setFailed(false);
    const refresh = () => {
      weekOffApi(`/api/week-off?employeeId=${encodeURIComponent(employeeId)}`)
        .then(data => { if (active) { setInfo(data); setFailed(false); } })
        .catch(() => { if (active) setFailed(true); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("motisons-week-off-updated", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("motisons-week-off-updated", refresh); };
  }, [employeeId]);
  return <div className="info">
    <span>Weekly Off</span>
    <b>{info ? dayName(info.weekday) : failed ? "Unavailable" : "Loading..."}</b>
    {info?.temporaryThisWeek && <small style={{ display: "block", marginTop: 3 }}>This week only (Fixed: {dayName(info.fixedWeekday)})</small>}
    {info?.nextPermanent && <small style={{ display: "block", marginTop: 3 }}>From {info.nextPermanent.effectiveDate}: {dayName(info.nextPermanent.weekday)}</small>}
  </div>;
}

export default function WeekOffManagement() {
  const [employees, setEmployees] = useState<WeekOffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("All");
  const [department, setDepartment] = useState("All");
  const [selected, setSelected] = useState<string[]>([]);
  const [editIds, setEditIds] = useState<string[]>([]);
  const [kind, setKind] = useState<"PERMANENT" | "TEMPORARY">("PERMANENT");
  const [weekday, setWeekday] = useState("0");
  const [date, setDate] = useState(todayLocal);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Change[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await weekOffApi("/api/week-off");
      setEmployees(data.employees || []);
      setError("");
    } catch (e: any) { setError(e.message || "Unable to load employees."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const branches = useMemo(() => [...new Set(employees.map(x => x.branch).filter(Boolean) as string[])].sort(), [employees]);
  const departments = useMemo(() => [...new Set(employees.map(x => x.department).filter(Boolean) as string[])].sort(), [employees]);
  const filtered = useMemo(() => employees.filter(e =>
    (branch === "All" || e.branch === branch) &&
    (department === "All" || e.department === department) &&
    `${e.name} ${e.employeeCode || ""} ${e.branch || ""} ${e.department || ""} ${e.designation || ""}`.toLowerCase().includes(search.toLowerCase().trim())
  ), [employees, search, branch, department]);

  const startEdit = async (ids: string[]) => {
    if (!ids.length) return;
    setEditIds(ids);
    setKind("PERMANENT");
    setWeekday(String(employees.find(x => x.id === ids[0])?.fixedWeekday ?? 0));
    setDate(todayLocal());
    setReason("");
    setHistory([]);
    setError("");
    if (ids.length === 1) {
      try {
        const data = await weekOffApi(`/api/week-off?employeeId=${encodeURIComponent(ids[0])}`);
        setHistory(data.history || []);
      } catch (e: any) { setError(e.message || "Unable to load change history."); }
    }
  };

  const save = async () => {
    if (saving || !editIds.length) return;
    const count = editIds.length;
    if (count > 1 && !window.confirm(`Set ${dayName(Number(weekday))} as fixed weekly off for ${count} selected employees, effective ${date}?`)) return;
    setSaving(true);
    setError("");
    try {
      const data = await weekOffApi("/api/week-off", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: editIds, kind, weekday: Number(weekday), effectiveDate: date, reason })
      });
      setSuccess(`Week off saved for ${data.updated} employee(s).`);
      setEditIds([]);
      setSelected([]);
      await reload();
      window.dispatchEvent(new Event("motisons-week-off-updated"));
    } catch (e: any) { setError(e.message || "Unable to save week off."); }
    finally { setSaving(false); }
  };

  const editingOne = editIds.length === 1 ? employees.find(x => x.id === editIds[0]) : null;
  const shownSelected = filtered.length > 0 && filtered.every(x => selected.includes(x.id));
  const toggleAll = () => setSelected(current => shownSelected
    ? current.filter(x => !filtered.some(e => e.id === x))
    : Array.from(new Set([...current, ...filtered.map(x => x.id)])));

  return <section className="panel" style={{ maxWidth: "100%" }}>
    <h1>Employee Week Off</h1>
    <p className="muted">Set a fixed weekly off, or approve a temporary/permanent change. Past changes are kept for attendance history.</p>
    <div className="filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Employee ID / name" aria-label="Search employees" style={{ flex: "2 1 185px" }} />
      <select aria-label="Filter branch" value={branch} onChange={e => setBranch(e.target.value)} style={{ flex: "1 1 115px" }}><option value="All">All Branches</option>{branches.map(x => <option key={x}>{x}</option>)}</select>
      <select aria-label="Filter department" value={department} onChange={e => setDepartment(e.target.value)} style={{ flex: "1 1 155px" }}><option value="All">All Departments</option>{departments.map(x => <option key={x}>{x}</option>)}</select>
    </div>
    <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
      <span><b>{filtered.length}</b> employees | <b>{employees.filter(x => x.fixedWeekday !== null).length}</b> assigned</span>
      <button className="primary" type="button" disabled={!selected.length || loading} onClick={() => startEdit(selected)}>Assign Selected ({selected.length})</button>
    </div>
    {success && <div className="msg success">{success}</div>}
    {error && <div className="msg error" role="alert">{error}</div>}
    {loading ? <p>Loading employees...</p> : <div className="table-wrap" style={{ maxHeight: 445, overflow: "auto" }}>
      <table><thead><tr><th><input type="checkbox" aria-label="Select filtered employees" checked={shownSelected} onChange={toggleAll} /></th><th>Employee ID</th><th>Employee</th><th>Branch</th><th>Department</th><th>Fixed Week Off</th><th>This Week</th><th>Action</th></tr></thead>
      <tbody>{filtered.map(e => <tr key={e.id}>
        <td><input type="checkbox" aria-label={`Select ${e.name}`} checked={selected.includes(e.id)} onChange={event => setSelected(current => event.target.checked ? [...current, e.id] : current.filter(x => x !== e.id))} /></td>
        <td>{e.employeeCode || "-"}</td><td><b>{e.name}</b></td><td>{e.branch || "-"}</td><td>{e.department || "-"}</td>
        <td>{dayName(e.fixedWeekday)}</td><td>{dayName(e.weekday)}{e.temporaryThisWeek ? " (Temporary)" : ""}</td>
        <td><button className="light small" type="button" onClick={() => startEdit([e.id])}>Change / History</button></td>
      </tr>)}{!filtered.length && <tr><td colSpan={8}>No employees found.</td></tr>}</tbody></table>
    </div>}

    {editIds.length > 0 && <div style={{ border: "1px solid #c9dfea", borderRadius: 16, padding: 16, marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>{editingOne ? `Week Off - ${editingOne.name}` : `Set Week Off - ${editIds.length} Employees`}</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {editIds.length === 1 && <div style={{ flex: "1 1 160px" }}><label>Change Type</label><select value={kind} onChange={e => setKind(e.target.value as "PERMANENT" | "TEMPORARY")}><option value="PERMANENT">Permanent / Fixed</option><option value="TEMPORARY">Temporary (one week)</option></select></div>}
        <div style={{ flex: "1 1 140px" }}><label>Week Off Day</label><select value={weekday} onChange={e => setWeekday(e.target.value)}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
        <div style={{ flex: "1 1 160px" }}><label>{kind === "TEMPORARY" ? "Date in Affected Week" : "Effective From"}</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div style={{ flex: "2 1 200px" }}><label>Reason (Optional)</label><input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="Reason for week-off change" /></div>
      </div>
      {kind === "TEMPORARY" && <p className="hint">Only the selected Monday-Sunday week changes; the usual fixed off returns the following week.</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}><button className="primary" type="button" disabled={saving || !date} onClick={save}>{saving ? "Saving..." : "Save Week Off"}</button><button className="light" type="button" disabled={saving} onClick={() => setEditIds([])}>Cancel</button></div>
      {editingOne && <div style={{ marginTop: 20 }}>
        <h3>Week-Off Change History</h3>
        <div className="table-wrap"><table><thead><tr><th>Type</th><th>Effective Date / Week</th><th>Previous</th><th>New Day</th><th>Updated By</th><th>Updated At</th><th>Reason</th></tr></thead>
          <tbody>{history.map((h, i) => <tr key={`${h.changedAt}-${i}`}><td>{h.kind === "TEMPORARY" ? "Temporary" : "Permanent"}</td><td>{h.effectiveDate}</td><td>{dayName(h.previousWeekday)}</td><td>{dayName(h.weekday)}</td><td>{h.changedByName}</td><td>{new Date(h.changedAt).toLocaleString("en-IN")}</td><td>{h.reason || "-"}</td></tr>)}
          {!history.length && <tr><td colSpan={7}>No previous week-off changes.</td></tr>}</tbody></table></div>
      </div>}
    </div>}
  </section>;
}
