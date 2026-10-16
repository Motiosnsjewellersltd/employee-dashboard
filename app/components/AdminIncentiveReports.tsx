"use client";

import { useCallback, useEffect, useState } from "react";
import type { makeSchemeReport, SchemeSource } from "@/lib/schemeReport";
import styles from "./AdminIncentiveReports.module.css";

type Report = Awaited<ReturnType<typeof makeSchemeReport>>;
type Employee = { id: string; name: string; employeeCode: string | null; branch: string | null; department: string | null; status: string };
type Entry = { employee: Employee; report: Report };
type Data = { employees: Employee[]; schemes: { source: SchemeSource; reports: Entry[]; error: string }[] };
const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = (value: string | null) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC" }) : "—";
const monthText = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const schemeText = (value: SchemeSource) => value === "gold" ? "Neev Gold" : "Neev Bonus";

export default function AdminIncentiveReports() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scheme, setScheme] = useState<SchemeSource | "">("");
  const [branch, setBranch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/incentive-reports", { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to load incentive reports.");
      if (!signal?.aborted) setData(result.data);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load incentive reports.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const branches = Array.from(new Set((data?.employees || []).map(e => e.branch || "").filter(Boolean))).sort();
  const employees = (data?.employees || []).filter(e => !branch || e.branch === branch);
  const schemes = (data?.schemes || []).filter(s => !scheme || s.source === scheme);
  const entries = schemes.flatMap(s => s.reports
    .filter(e => (!branch || e.employee.branch === branch) && (!employeeId || e.employee.id === employeeId))
    .map(e => ({ ...e, source: s.source })));
  const months = Array.from(new Set(entries.flatMap(e => e.report.months.map(m => m.month)))).sort().reverse();
  const rows = entries.map(e => {
    const selected = e.report.months.filter(m => !month || m.month === month);
    const sum = (key: "gross" | "deductions" | "net") => Math.round(selected.reduce((total, m) => total + m[key], 0) * 100) / 100;
    return { ...e, selected, gross: sum("gross"), deductions: sum("deductions"), net: sum("net") };
  });
  const total = (key: "gross" | "deductions" | "net") => Math.round(rows.reduce((value, row) => value + row[key], 0) * 100) / 100;

  return <section className={`panel ${styles.page}`}>
    <div className={styles.heading}><h1>Incentive Reports</h1><button type="button" className="light" disabled={loading} onClick={() => void load()}>{loading ? "Loading..." : "Refresh"}</button></div>
    <p className={styles.hint}>7.5% once per customer per scheme. Incentive month is the calendar month after the actual 3rd installment paid date. Deductions use their recorded month.</p>
    <div className={styles.filters}>
      <label>Scheme<select value={scheme} onChange={e => { setScheme(e.target.value as SchemeSource | ""); setMonth(""); }}><option value="">All Schemes</option><option value="gold">Neev Gold</option><option value="bonus">Neev Bonus</option></select></label>
      <label>Branch<select value={branch} onChange={e => { setBranch(e.target.value); setEmployeeId(""); setMonth(""); }}><option value="">All Branches</option>{branches.map(b => <option key={b}>{b}</option>)}</select></label>
      <label>Employee<select value={employeeId} onChange={e => { setEmployeeId(e.target.value); setMonth(""); }}><option value="">All Employees</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ""} — {e.branch || "No branch"}</option>)}</select></label>
      <label>Month<select value={month} onChange={e => setMonth(e.target.value)}><option value="">All Months</option>{months.map(m => <option key={m} value={m}>{monthText(m)}</option>)}</select></label>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading && <p role="status">Loading incentive reports...</p>}
    {schemes.filter(s => s.error).map(s => <p className={styles.error} role="alert" key={s.source}>{schemeText(s.source)}: {s.error}</p>)}
    {data && <>
      <div className={styles.stats}>{([['Gross Incentive', 'gross'], ['Deductions', 'deductions'], ['Final Incentive', 'net']] as const).map(([label, key]) => <div key={key}><small>{label}</small><strong>{money(total(key))}</strong></div>)}</div>
      <div className={styles.tableWrap}><table><thead><tr><th>Employee</th><th>Employee ID</th><th>Branch</th><th>Scheme</th><th>Gross Incentive</th><th>Deductions</th><th>Final Incentive</th></tr></thead><tbody>
        {rows.map(e => <tr key={`${e.source}:${e.employee.id}`}><td>{e.employee.name}</td><td>{e.employee.employeeCode || "—"}</td><td>{e.employee.branch || "—"}</td><td>{schemeText(e.source)}</td><td>{money(e.gross)}</td><td>{money(e.deductions)}</td><td>{money(e.net)}</td></tr>)}
        {!rows.length && <tr><td colSpan={7} className={styles.empty}>No employee reports match these filters.</td></tr>}
      </tbody></table></div>
      {rows.map(e => {
        const credited = new Map(e.report.months.flatMap(m => m.items.map(c => [c.customerKey, m.month] as const)));
        const customers = e.report.customers.filter(c => !month || credited.get(c.customerKey) === month);
        return <details className={styles.details} key={`${e.source}:${e.employee.id}`}>
          <summary>{e.employee.name} · {e.employee.employeeCode || "No employee ID"} · {e.employee.branch || "No branch"} · {schemeText(e.source)} · Customer Details ({customers.length})</summary>
          <h3>Customer Details</h3>
          <div className={styles.tableWrap}><table><thead><tr><th>Customer</th><th>Customer Key</th><th>Start Date</th><th>Installment Amount</th><th>Paid Installments</th><th>3rd Paid Date</th><th>Incentive Month</th><th>Incentive (7.5%)</th><th>Status</th></tr></thead><tbody>
            {customers.map(c => <tr key={c.customerKey}><td>{c.customerName}</td><td>{c.customerKey}</td><td>{dateText(c.startDate)}</td><td>{money(c.installmentAmount)}</td><td>{c.paidInstallments} / 10</td><td>{dateText(c.thirdPaidDate)}</td><td>{credited.has(c.customerKey) ? monthText(credited.get(c.customerKey)!) : "—"}</td><td>{money(c.incentive)}</td><td>{c.status}</td></tr>)}
            {!customers.length && <tr><td colSpan={9} className={styles.empty}>No customers match this month.</td></tr>}
          </tbody></table></div>
          <h3>Monthly Incentive</h3>
          <div className={styles.tableWrap}><table><thead><tr><th>Month</th><th>Gross Incentive</th><th>Deductions</th><th>Final Incentive</th></tr></thead><tbody>{e.selected.map(m => <tr key={m.month}><td>{monthText(m.month)}</td><td>{money(m.gross)}</td><td>{money(m.deductions)}</td><td>{money(m.net)}</td></tr>)}{!e.selected.length && <tr><td colSpan={4} className={styles.empty}>No incentive months.</td></tr>}</tbody></table></div>
          <h3>Deduction Details</h3>
          <div className={styles.tableWrap}><table><thead><tr><th>Month</th><th>Deduction ID</th><th>Customer</th><th>Reason</th><th>Deduction</th></tr></thead><tbody>{e.selected.flatMap(m => m.deductionRows.map(d => <tr key={`${m.month}:${d.id}`}><td>{monthText(m.month)}</td><td>{d.id}</td><td>{d.customerName || "—"}</td><td>{d.reason || "—"}</td><td>{money(d.amount)}</td></tr>))}{!e.selected.some(m => m.deductionRows.length) && <tr><td colSpan={5} className={styles.empty}>No deductions.</td></tr>}</tbody></table></div>
          {e.report.warnings.map(w => <p className={styles.warning} key={w}>{w}</p>)}
        </details>;
      })}
    </>}
  </section>;
}
