import { prisma } from "@/lib/prisma";

// No migration required: visibility is stored in the existing PermissionSetting table.
// Default is always HIDDEN, including for newly created employees.
const keyForEmployee = (employeeId: string) => `employeeSchemeVisible:${employeeId}`;

export function isEligibleSchemeDepartment(
  _value: string | null | undefined
): boolean {
  return true;
}

export async function hasSchemeAccess(employeeId: string, role: string): Promise<boolean> {
  if (role !== "EMPLOYEE") return false;
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { department: true, deletedAt: true, status: true }
  });
  if (!employee || employee.deletedAt || employee.status !== "ACTIVE" || !isEligibleSchemeDepartment(employee.department)) return false;
  const setting = await prisma.permissionSetting.findUnique({
    where: { key: keyForEmployee(employeeId) },
    select: { value: true }
  });
  return setting?.value === "true";
}

export { keyForEmployee };
