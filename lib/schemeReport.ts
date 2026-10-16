import { readSchemeSheets } from "@/lib/schemeSheets";

export type SchemeSource = "gold" | "bonus";

type Row = Array<string | number | boolean | null>;
const str = (value: unknown): string => String(value ?? "").trim();
const sameName = (value: unknown): string => str(value).replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
const money = (value: unknown): number => {
  const number = typeof value === "number" ? value : Number(str(value).replace(/[,₹\s]/g, ""));
  return Number.isFinite(number) ? number : 0;
};
const rounded = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Google serial dates are timezone-independent spreadsheet calendar days. */
export function readSchemeDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const raw = str(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|\s|$)/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // Source Google Sheets use the US M/D/YYYY display format (visible in supplied sheets).
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (us) return validDate(Number(us[3]), Number(us[1]), Number(us[2]));
  const indian = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s|$)/);
  if (indian) return validDate(Number(indian[3]), Number(indian[2]), Number(indian[1]));
  return null;
}

function validDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

const keyOf = (mobile: unknown, startDate: string): string => str(mobile).replace(/\D/g, "") + "|" + startDate;
const normalizedKey = (value: unknown): string => {
  const key = str(value);
  const sep = key.indexOf("|");
  if (sep < 0) return "";
  const date = readSchemeDate(key.slice(sep + 1));
  return date ? keyOf(key.slice(0, sep), date) : "";
};

export async function makeSchemeReport(source: SchemeSource, salesperson: string, branch: string, snapshot?: Awaited<ReturnType<typeof readSchemeSheets>>) {
  const sheets = snapshot ?? await readSchemeSheets(source);
  const salespersonKey = sameName(salesperson);
  const branchKey = str(branch).toUpperCase();
  if (!salespersonKey || !branchKey) {
    return { source, customers: [], months: [], totalCustomers: 0, totalIncentive: 0, warnings: ["Salesperson name or branch is missing from employee profile."] };
  }
  const warnings: string[] = [];
  const statusByKey = new Map<string, string>();
  for (const row of sheets.statuses) {
    const key = normalizedKey(row[1]);
    if (key) statusByKey.set(key, str(row[5]).toUpperCase());
  }

  const registrationByKey = new Map<string, { key: string; customerName: string; branch: string; amount: number; startDate: string; salespersonName: string }>();
  const branchesForName = new Set<string>();
  for (const row of sheets.registrations) {
    const entryName = sameName(row[5]);
    if (entryName === salespersonKey) branchesForName.add(str(row[6]).toUpperCase());
    if (entryName !== salespersonKey || str(row[6]).toUpperCase() !== branchKey) continue;
    const startDate = readSchemeDate(row[3]);
    const mobile = str(row[4]).replace(/\D/g, "");
    if (!startDate || !mobile) { warnings.push("Some registrations have an invalid date or customer key and were excluded."); continue; }
    const key = keyOf(mobile, startDate);
    if (registrationByKey.has(key)) {
      warnings.push("Duplicate customer registration keys were found; each scheme/customer is counted only once.");
      continue;
    }
    registrationByKey.set(key, {
      key,
      customerName: str(row[2]),
      salespersonName: str(row[5]),
      branch: branchKey,
      startDate,
      amount: money(row[8])
    });
  }

  const paidByKey = new Map<string, Map<number, string[]>>();
  for (const row of sheets.installments) {
    if (str(row[10]).toUpperCase() !== "PAID") continue;
    const key = normalizedKey(row[1]);
    if (!registrationByKey.has(key)) continue;
    const no = Number(row[6]);
    if (!Number.isInteger(no) || no < 1 || no > 10) continue;
    if (!paidByKey.has(key)) paidByKey.set(key, new Map());
    const numbers = paidByKey.get(key)!;
    if (!numbers.has(no)) numbers.set(no, []);
    const date = readSchemeDate(row[8]);
    if (date) numbers.get(no)!.push(date);
    else numbers.get(no)!.push("");
  }

  const customers: Array<{
    customerKey: string; customerName: string; startDate: string; installmentAmount: number;
    paidInstallments: number; thirdPaidDate: string | null; incentive: number; status: string;
  }> = [];
  const monthMap = new Map<string, { month: string; gross: number; deductions: number; net: number; items: Array<{ customerKey: string; customerName: string; installmentAmount: number; paidInstallments: number; thirdPaidDate: string; incentive: number }>;
    deductionRows: Array<{ id: string; amount: number; reason: string; customerName: string }> }>();
  const monthFor = (month: string) => {
    if (!monthMap.has(month)) monthMap.set(month, { month, gross: 0, deductions: 0, net: 0, items: [], deductionRows: [] });
    return monthMap.get(month)!;
  };

  for (const entry of registrationByKey.values()) {
    const numbers = paidByKey.get(entry.key) || new Map<number, string[]>();
    const count = numbers.size;
    const status = statusByKey.get(entry.key) || (count === 10 ? "CLOSED" : "RUNNING");
    const thirdRows = numbers.get(3) || [];
    const thirdDates = thirdRows.filter(Boolean);
    const distinctDates = Array.from(new Set(thirdDates));
    // A missing date is never replaced by a guessed month, even if another
    // duplicate row has a date. Count the incentive only after reconciliation.
    const thirdPaidDate = thirdRows.length > 0 && thirdDates.length === thirdRows.length && distinctDates.length === 1
      ? distinctDates[0] : null;
    if (numbers.has(3) && !thirdPaidDate) {
      warnings.push("One or more third installments have missing/conflicting paid dates. Their incentive is withheld until dates are verified.");
    }
    // One customer + one scheme can earn incentive only once, after 3 unique paid installments.
    const incentive = status !== "CANCELLED" && count >= 3 && thirdPaidDate ? rounded(entry.amount * 0.075) : 0;
    customers.push({
      customerKey: entry.key, customerName: entry.customerName, startDate: entry.startDate,
      installmentAmount: entry.amount, paidInstallments: count, thirdPaidDate,
      incentive, status
    });
    if (!incentive || !thirdPaidDate) continue;
    const paidYear = Number(thirdPaidDate.slice(0, 4));
    const paidMonth = Number(thirdPaidDate.slice(5, 7));
    // Calendar rollover also handles December -> January without day overflow.
    const incentiveMonth = new Date(Date.UTC(paidYear, paidMonth, 1)).toISOString().slice(0, 7);
    const month = monthFor(incentiveMonth);
    month.gross = rounded(month.gross + incentive);
    month.items.push({
      customerKey: entry.key, customerName: entry.customerName,
      installmentAmount: entry.amount, paidInstallments: count,
      thirdPaidDate, incentive
    });
  }

  // The source deductions sheet has only salesperson name, no branch.
  // To prevent deductions leaking between employees with the same name at two branches,
  // exclude such ambiguous deductions rather than guessing ownership.
  if (branchesForName.size > 1) {
    warnings.push("Manual deductions are not applied: the salesperson name occurs in multiple branches, but deductions have no branch field.");
  } else {
    const deductionIds = new Set<string>();
    for (const row of sheets.deductions) {
      if (sameName(row[4]) !== salespersonKey) continue;
      const id = str(row[1]);
      if (!id || deductionIds.has(id)) continue;
      deductionIds.add(id);
      const monthNumber = Number(row[2]);
      const year = Number(row[3]);
      if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12 || !Number.isInteger(year) || year < 2000) continue;
      const amount = money(row[5]);
      const selectedMonth = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const month = monthFor(selectedMonth);
      month.deductions = rounded(month.deductions + amount);
      month.deductionRows.push({ id, amount, reason: str(row[6]), customerName: str(row[7]) });
    }
  }
  const months = Array.from(monthMap.values())
    .map(month => ({ ...month, net: rounded(month.gross - month.deductions), items: month.items.sort((a,b) => a.customerName.localeCompare(b.customerName)) }))
    .sort((a,b) => b.month.localeCompare(a.month));
  customers.sort((a,b) => a.customerName.localeCompare(b.customerName));
  const totalIncentive = rounded(months.reduce((sum, m) => sum + m.net, 0));
  return { source, customers, months, totalCustomers: customers.length, totalIncentive, warnings: Array.from(new Set(warnings)) };
}
