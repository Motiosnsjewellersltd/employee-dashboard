export type AvailabilityGroup = "available" | "pending" | "approved" | "weekOff" | "absent" | "unrecorded";
export type AvailabilityPerson = {
  id: string; name: string; employeeCode: string | null; department: string | null;
  designation: string | null; branch: string | null; floor: string | null;
};
export type AvailabilityEmployee = AvailabilityPerson & {
  status: string; doj: Date | null; exitDate: Date | null;
};
export type AvailabilityLeave = {
  requesterId: string; fromDate: Date; toDate: Date; fromDayType: string; toDayType: string;
  status: string; managerStatus: string;
};
export type AvailabilityEntry = AvailabilityPerson & { note: string };
export type AvailabilityGroups = Record<AvailabilityGroup, AvailabilityEntry[]>;
export type DesignationAvailability = { key: string; designation: string; total: number; groups: AvailabilityGroups };

export function indiaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function availabilityDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Select a valid date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Select a valid date.");
  return date;
}

// Factory is a department-only view in this popup, not a stored branch.
export function availabilityScopeMatches(employee: Pick<AvailabilityPerson, "branch" | "department">, scope: string) {
  const factory = employee.department?.trim().toUpperCase() === "FACTORY";
  if (scope === "FACTORY") return factory;
  return employee.branch?.trim().toUpperCase() === scope && !(scope === "MT" && factory);
}

export function buildBranchAvailability(
  employees: AvailabilityEmployee[], leaves: AvailabilityLeave[],
  records: Array<{ employeeId: string; days: unknown }>, dateKey: string, branch: string, today = indiaDateKey()
) {
  const date = availabilityDate(dateKey);
  const future = dateKey > today;
  const day = String(date.getUTCDate());
  const attendance = new Map(records.map(record => [record.employeeId, record.days]));
  const overlapping = new Map<string, AvailabilityLeave[]>();
  for (const leave of leaves) {
    if (leave.fromDate > date || leave.toDate < date || leave.status === "REJECTED" || leave.managerStatus === "REJECTED") continue;
    if (leave.status !== "APPROVED" && leave.status !== "PENDING") continue;
    const list = overlapping.get(leave.requesterId) || [];
    list.push(leave); overlapping.set(leave.requesterId, list);
  }
  const groups: AvailabilityGroups = { available: [], pending: [], approved: [], weekOff: [], absent: [], unrecorded: [] };
  for (const employee of employees) {
    if (employee.status !== "ACTIVE" || !availabilityScopeMatches(employee, branch)) continue;
    if (employee.doj && employee.doj.toISOString().slice(0, 10) > dateKey) continue;
    if (employee.exitDate && employee.exitDate.toISOString().slice(0, 10) <= dateKey) continue;
    const stored = attendance.get(employee.id);
    const code = stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)[day] : undefined;
    const requests = overlapping.get(employee.id) || [];
    const approved = requests.filter(request => request.status === "APPROVED");
    const pending = requests.filter(request => request.status === "PENDING");
    const halfDay = (request: AvailabilityLeave) => {
      const first = request.fromDate.toISOString().slice(0, 10);
      const last = request.toDate.toISOString().slice(0, 10);
      return (first === dateKey && request.fromDayType === "HALF") || (first !== last && last === dateKey && request.toDayType === "HALF");
    };
    let group: AvailabilityGroup;
    let note: string;
    if (approved.length) {
      group = "approved";
      note = approved.every(halfDay) ? "Approved half-day leave; excluded from available count" : "Approved leave; excluded from available count";
    } else if (pending.length) {
      group = "pending";
      note = pending.every(halfDay) ? "Half-day leave pending" : "Leave pending";
      if (pending.some(request => request.managerStatus === "APPROVED")) note += "; final HR approval pending";
      if (code === "P" || code === "H" || code === "SL") note += "; attendance recorded as present";
    } else if (code === "R") {
      group = "weekOff"; note = "Week Off (uploaded attendance)";
    } else if (code === "A") {
      group = "absent"; note = future ? "Marked absent in uploaded attendance" : "Absent (recorded attendance)";
    } else if (future || code === "P" || code === "H" || code === "SL") {
      group = "available";
      note = future ? "Expected available; no approved or pending leave" : "Present (recorded attendance)";
      if (code === "H") note += "; Half Day";
      if (code === "SL") note += "; Short Leave";
    } else {
      group = "unrecorded"; note = "Attendance not recorded; presence not confirmed";
    }
    const { id, name, employeeCode, department, designation, floor, branch: employeeBranch } = employee;
    groups[group].push({ id, name, employeeCode, department, designation, floor, branch: employeeBranch, note });
  }
  for (const entries of Object.values(groups)) entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  const byDesignation = new Map<string, DesignationAvailability>();
  for (const [group, people] of Object.entries(groups) as [AvailabilityGroup, AvailabilityEntry[]][]) {
    for (const person of people) {
      const name = person.designation?.trim().replace(/\s+/g, " ") || "Not Assigned";
      const key = person.designation?.trim().replace(/\s+/g, " ").toLowerCase() || "";
      let item = byDesignation.get(key);
      if (!item) {
        item = { key, designation: name, total: 0, groups: { available: [], pending: [], approved: [], weekOff: [], absent: [], unrecorded: [] } };
        byDesignation.set(key, item);
      }
      item.total++; item.groups[group].push(person);
    }
  }
  const designations = Array.from(byDesignation.values()).sort((a, b) => a.designation.localeCompare(b.designation, "en"));
  return { date: dateKey, branch, future, today, groups, designations, total: Object.values(groups).reduce((count, entries) => count + entries.length, 0) };
}
