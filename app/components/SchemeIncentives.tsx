"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SchemeIncentives.module.css";

type Customer = {
  customerKey: string;
  customerName: string;
  installmentAmount: number;
  paidInstallments: number;
  thirdPaidDate: string | null;
  incentive: number;
  status: string;
};
type IncentiveItem = {
  customerKey: string;
  customerName: string;
  installmentAmount: number;
  paidInstallments: number;
  thirdPaidDate: string;
  incentive: number;
};
type Month = {
  month: string;
  gross: number;
  deductions: number;
  net: number;
  items: IncentiveItem[];
  deductionRows: { id: string; amount: number; reason: string; customerName: string }[];
};
type Report = {
  customers: Customer[];
  months: Month[];
  totalCustomers: number;
  totalIncentive: number;
  warnings: string[];
};
const rupees = (value: number) => `₹${(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = (date?: string | null) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const monthText = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

type Scheme = "gold" | "bonus";
type SchemeView = { report: Report | null; error: string; loading: boolean };
const initialView = (): SchemeView => ({ report: null, error: "", loading: true });

export default function SchemeIncentives({ onAccessRevoked }: { onAccessRevoked: () => void }) {
  const revokedRef = useRef(onAccessRevoked);
  revokedRef.current = onAccessRevoked;
  const [scheme, setScheme] = useState<Scheme>("gold");
  // Keep independent cached results/errors for each tab: a failing Gold request
  // must never briefly appear over a working Bonus report (or vice versa).
  const [views, setViews] = useState<Record<Scheme, SchemeView>>({
    gold: initialView(), bonus: initialView()
  });
  const [selectedMonths, setSelectedMonths] = useState<Record<Scheme, string>>({ gold: "", bonus: "" });
  const [activeView, setActiveView] = useState<"customers" | "monthly">("customers");

  useEffect(() => {
    let alive = true;
    async function refresh() {
      setViews(previous => ({
        ...previous,
        [scheme]: { ...previous[scheme], loading: !previous[scheme].report, error: "" }
      }));
      try {
        const response = await fetch(`/api/schemes?scheme=${scheme}`, { cache: "no-store" });
        if (!alive) return;
        if (response.status === 403) {
          revokedRef.current();
          return;
        }
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Unable to load scheme data.");
        if (!alive) return;
        const next: Report = result.data;
        setViews(previous => ({ ...previous, [scheme]: { report: next, error: "", loading: false } }));
        setSelectedMonths(previous => ({
          ...previous,
          [scheme]: next.months.some(m => m.month === previous[scheme])
            ? previous[scheme] : next.months[0]?.month || ""
        }));
      } catch (e) {
        if (!alive) return;
        const message = e instanceof Error ? e.message : "Unable to load scheme data.";
        setViews(previous => ({
          ...previous,
          [scheme]: {
            ...previous[scheme],
            // Retain previously fetched data if a later background refresh fails.
            error: previous[scheme].report ? "" : message,
            loading: false
          }
        }));
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 90_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [scheme]);

  const { report, error, loading } = views[scheme];
  const selectedMonth = selectedMonths[scheme];
  const currentMonth = report?.months.find(item => item.month === selectedMonth);
  return <section className={styles.page}>
    <div className={styles.heading}>
      <h1>Scheme &amp; Incentives</h1>
    </div>
    <div className={styles.tabs} role="tablist" aria-label="Scheme selection">
      <button type="button" role="tab" aria-selected={scheme === "gold"} className={scheme === "gold" ? styles.selected : ""} onClick={() => { setScheme("gold"); setActiveView("customers"); }}>Neev Gold</button>
      <button type="button" role="tab" aria-selected={scheme === "bonus"} className={scheme === "bonus" ? styles.selected : ""} onClick={() => { setScheme("bonus"); setActiveView("customers"); }}>Neev Bonus</button>
    </div>
    {loading && !report ? <div className={styles.message} role="status">Loading scheme data...</div> : null}
    {error && !report ? <p className={styles.error} role="alert">{scheme === "gold" ? "Neev Gold data load nahi ho paaya." : "Neev Bonus data load nahi ho paaya."}</p> : null}
    {report && <>
      <div className={styles.stats}>
        <div className={styles.stat}><small>Total Customers</small><strong>{report.totalCustomers}</strong></div>
        <div className={styles.stat}><small>Total Incentive</small><strong>{rupees(report.totalIncentive)}</strong></div>
      </div>

      {/* Customer list is the default view directly below the two summary boxes.
          Month-wise incentive remains one tap away without a long page scroll. */}
      <div className={styles.viewTabs} role="tablist" aria-label="Scheme details view">
        <button type="button" role="tab" aria-selected={activeView === "customers"}
          className={activeView === "customers" ? styles.viewTabSelected : ""}
          onClick={() => setActiveView("customers")}>Customer Details</button>
        <button type="button" role="tab" aria-selected={activeView === "monthly"}
          className={activeView === "monthly" ? styles.viewTabSelected : ""}
          onClick={() => setActiveView("monthly")}>Month-wise Incentive</button>
      </div>
      {activeView === "customers" ? <div className={styles.panel} role="tabpanel">
        <h2>Customer Details</h2>
        <div className={styles.tableWrap}>
          <table className={styles.customerTable}><thead><tr><th>Customer Name</th><th>Installment Amount</th><th>Paid Installments</th><th>Incentive</th><th>Status</th></tr></thead>
            <tbody>{report.customers.map(c => <tr key={c.customerKey}>
              <td>{c.customerName}</td><td>{rupees(c.installmentAmount)}</td>
              <td>{c.paidInstallments} / 10</td><td>{rupees(c.incentive)}</td>
              <td><span className={`${styles.status} ${c.status === "CLOSED" ? styles.statusClosed : c.status === "CANCELLED" ? styles.statusCancelled : styles.statusRunning}`}>{c.status}</span></td>
            </tr>)}
              {!report.customers.length && <tr><td colSpan={5} className={styles.empty}>No customers assigned to your name and branch in this scheme.</td></tr>}
            </tbody>
          </table>
        </div>
      </div> : <div className={styles.panel} role="tabpanel">
        <div className={styles.monthHeading}>
          <h2>Month-wise Incentive</h2>
          <label>Month
            <select value={selectedMonth} onChange={event => setSelectedMonths(previous => ({ ...previous, [scheme]: event.target.value }))} disabled={!report.months.length}>
              {!report.months.length && <option value="">No incentive months yet</option>}
              {report.months.map(item => <option key={item.month} value={item.month}>{monthText(item.month)}</option>)}
            </select>
          </label>
        </div>
        {currentMonth ? <>
          <div className={styles.monthStats}>
            <div><small>Gross Incentive</small><strong>{rupees(currentMonth.gross)}</strong></div>
            <div><small>Deductions</small><strong>{rupees(currentMonth.deductions)}</strong></div>
            <div><small>Final Incentive</small><strong>{rupees(currentMonth.net)}</strong></div>
          </div>
          <h3>Customer Details</h3>
          <div className={styles.tableWrap}>
            <table><thead><tr><th>Customer</th><th>3rd Paid Date</th><th>Monthly Installment</th><th>Incentive (7.5%)</th></tr></thead>
              <tbody>{currentMonth.items.map(c => <tr key={c.customerKey}>
                <td>{c.customerName}</td><td>{dateText(c.thirdPaidDate)}</td><td>{rupees(c.installmentAmount)}</td><td>{rupees(c.incentive)}</td>
              </tr>)}
                {!currentMonth.items.length && <tr><td colSpan={4} className={styles.empty}>No eligible customer installments in this month.</td></tr>}
              </tbody>
            </table>
          </div>
          {currentMonth.deductionRows.length > 0 && <>
            <h3>Manual Deductions</h3>
            <div className={styles.tableWrap}>
              <table><thead><tr><th>Customer</th><th>Reason</th><th>Deduction</th></tr></thead>
                <tbody>{currentMonth.deductionRows.map(item => <tr key={item.id}>
                  <td>{item.customerName || "—"}</td><td>{item.reason || "—"}</td><td>{rupees(item.amount)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
        </> : <p className={styles.empty}>No month-wise incentive earned yet.</p>}
      </div>}
      {report.warnings.length > 0 && <p className={styles.warning}>{report.warnings.join(" ")}</p>}
    </>}
  </section>;
}
