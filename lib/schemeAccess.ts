import { prisma } from "@/lib/prisma";

// No migration required: visibility is stored in the existing PermissionSetting table.
// Default is always HIDDEN, including for newly created employees.
const keyForEmployee = (employeeId: string) => `employeeSchemeVisible:${employeeId}`;

export async function hasSchemeAccess(employeeId: string, role: string): Promise<boolean> {
  if (role !== "EMPLOYEE") return false;
  const setting = await prisma.permissionSetting.findUnique({
    where: { key: keyForEmployee(employeeId) },
    select: { value: true }
  });
  return setting?.value === "true";
}

export { keyForEmployee };
