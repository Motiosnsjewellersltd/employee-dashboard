import { prisma } from "@/lib/prisma";
import { sendPushToEmployees } from "@/lib/webPush";
import { employeeNotificationTarget } from "@/lib/notificationTargets";

export const profileNotificationSelect = {
  id: true, name: true, employeeCode: true, mobile: true,
  dob: true, doj: true, exitDate: true, designation: true,
  department: true, branch: true, floor: true, role: true,
  status: true, isFloorManager: true, managerScope: true, photoUrl: true
} as const;

const profileFields = {
  employeeCode: "Employee ID", name: "Name", mobile: "Mobile",
  dob: "Date of Birth", doj: "Joining Date", exitDate: "Exit Date",
  designation: "Designation", department: "Department", branch: "Branch",
  floor: "Floor", role: "Role", status: "Status",
  isFloorManager: "Manager / Head", managerScope: "Manager Scope", photoUrl: "Profile Photo"
} as const;

function comparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value === null || value === undefined ? "" : String(value);
}

export function changedProfileFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.entries(profileFields)
    .filter(([key]) => key in before && key in after && comparable(before[key]) !== comparable(after[key]))
    .map(([, label]) => label);
}

export async function addEmployeeNotification(input: {
  actorId: string;
  employeeId: string;
  action: "EMPLOYEE_PROFILE_UPDATED" | "EMPLOYEE_REPORT" | "EMPLOYEE_REPORT_UPDATED";
  title: string;
  text: string;
}) {
  try {
    // Send only to the affected employee, including inactive accounts for later review.
    const employee = await prisma.employee.findFirst({
      where: { id: input.employeeId, role: "EMPLOYEE", deletedAt: null },
      select: { id: true }
    });
    if (!employee) return;
    const notification = await prisma.notificationBlast.create({
      data: {
        type: "INFORMATION", text: input.text,
        filterType: "SYSTEM", filterValue: input.action, createdById: input.actorId,
        recipients: { create: [{ employeeId: employee.id }] }
      }
    });
    await sendPushToEmployees([employee.id], {
      title: input.title, body: input.text,
      url: employeeNotificationTarget(input.action)!, tag: `employee-update-${notification.id}`
    });
  } catch {
    // A notification/push failure must not turn a saved update into a failed request.
  }
}

export async function notifyProfileChanges(input: {
  actorId: string;
  employeeId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const fields = changedProfileFields(input.before, input.after);
  if (!fields.length) return;
  await addEmployeeNotification({
    actorId: input.actorId, employeeId: input.employeeId,
    action: "EMPLOYEE_PROFILE_UPDATED", title: "Profile Updated",
    text: `Your profile has been updated. Changed: ${fields.join(", ")}.`
  });
}

export async function notifyProfileBatch(input: {
  actorId: string;
  before: Array<Record<string, unknown> & { id: string }>;
}) {
  if (!input.before.length) return;
  try {
    const after = await prisma.employee.findMany({
      where: { id: { in: input.before.map(employee => employee.id) }, deletedAt: null },
      select: profileNotificationSelect
    });
    const beforeById = new Map(input.before.map(employee => [employee.id, employee]));
    for (let i = 0; i < after.length; i += 10) {
      await Promise.all(after.slice(i, i + 10).map(async employee => {
        const before = beforeById.get(employee.id);
        if (before) await notifyProfileChanges({ actorId: input.actorId, employeeId: employee.id, before, after: employee });
      }));
    }
  } catch {
    // Preserve successfully saved bulk changes if notification lookup fails.
  }
}

export async function notifyProfileRecords(input: {
  actorId: string;
  employeeIds: string[];
  title: string;
  text: string;
}) {
  const ids = Array.from(new Set(input.employeeIds));
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map(employeeId => addEmployeeNotification({
      actorId: input.actorId, employeeId, action: "EMPLOYEE_PROFILE_UPDATED",
      title: input.title, text: input.text
    })));
  }
}
