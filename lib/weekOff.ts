/** Week-off events are stored independently of HR permissions and leave records. */
export const WEEK_OFF_PREFIX = "employeeWeekOff:";

export const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type WeekOffChange = {
  kind: "PERMANENT" | "TEMPORARY";
  weekday: number;
  effectiveDate: string; // Permanent: date of first effect. Temporary: Monday of affected week.
  previousWeekday: number | null;
  changedAt: string;
  changedById: string;
  changedByName: string;
  reason: string;
};

export function validISODate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const weekday = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((weekday + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function istToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(x => x.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseWeekOffEvents(raw: string): WeekOffChange | null {
  try {
    const x = JSON.parse(raw);
    if (!x || !["PERMANENT", "TEMPORARY"].includes(x.kind) || !Number.isInteger(x.weekday) || x.weekday < 0 || x.weekday > 6 || !validISODate(x.effectiveDate)) return null;
    return {
      kind: x.kind,
      weekday: x.weekday,
      effectiveDate: x.effectiveDate,
      previousWeekday: Number.isInteger(x.previousWeekday) && x.previousWeekday >= 0 && x.previousWeekday <= 6 ? x.previousWeekday : null,
      changedAt: String(x.changedAt || ""),
      changedById: String(x.changedById || ""),
      changedByName: String(x.changedByName || ""),
      reason: String(x.reason || "")
    };
  } catch {
    return null;
  }
}

export function permanentDayOn(events: WeekOffChange[], date: string): number | null {
  const applicable = events.filter(e => e.kind === "PERMANENT" && e.effectiveDate <= date)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.changedAt.localeCompare(b.changedAt));
  return applicable.length ? applicable[applicable.length - 1].weekday : null;
}

export function weekOffOn(events: WeekOffChange[], date: string): number | null {
  const fixed = permanentDayOn(events, date);
  const start = mondayOf(date);
  const temporary = events.filter(e => e.kind === "TEMPORARY" && e.effectiveDate === start)
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  return temporary.length ? temporary[temporary.length - 1].weekday : fixed;
}

export function weekOffSummary(events: WeekOffChange[], date = istToday()) {
  const fixedWeekday = permanentDayOn(events, date);
  const weekday = weekOffOn(events, date);
  const nextPermanent = events.filter(e => e.kind === "PERMANENT" && e.effectiveDate > date)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.changedAt.localeCompare(b.changedAt))[0] || null;
  return {
    fixedWeekday,
    weekday,
    temporaryThisWeek: weekday !== fixedWeekday,
    nextPermanent: nextPermanent ? { effectiveDate: nextPermanent.effectiveDate, weekday: nextPermanent.weekday } : null
  };
}
