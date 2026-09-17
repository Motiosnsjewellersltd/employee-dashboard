import { prisma } from "@/lib/prisma";

export const permissionDefaults: Record<string, string> = {
  hrMenuDashboard: "true",
  hrMenuEmployees: "true",
  hrMenuAddUpload: "true",
  hrMenuLeaveRequests: "true",
  hrMenuReminder: "true",
  hrMenuNotifications: "true",
  hrMenuChat: "true",
  hrMenuResetPassword: "true",
  hrMenuLoginExport: "true",
  hrMenuRecycleBin: "true",
  hrCanAddEmployee: "true",
  hrCanEditEmployee: "true",
  hrCanDeleteEmployee: "false",
  hrCanResetPassword: "false",
  hrCanUploadLeaves: "true",
  hrCanReviewLeaveRequests: "true",
  hrCanCreateNotifications: "true",
  hrCanViewLoginHistory: "true",
  hrCanExportData: "true",
  hrCanManageRecycleBin: "true"
};

export async function getPermissionValues() {
  const rows = await (prisma as any).permissionSetting.findMany();
  const values: Record<string, string> = { ...permissionDefaults };
  for (const row of rows) if (row.key in permissionDefaults) values[row.key] = String(row.value);
  return values;
}

export async function requireHrPermission(role: string, key: string, message = "This action is not allowed for HR.") {
  if (role === "ADMIN") return;
  if (role !== "HR") throw new Error("Only Admin/HR allowed.");
  const row = await (prisma as any).permissionSetting.findUnique({ where: { key } });
  const allowed = String(row?.value ?? permissionDefaults[key] ?? "false") === "true";
  if (!allowed) throw new Error(message);
}
