import { NextRequest } from "next/server";
import { findEmployeeByRegisteredMobile } from "@/lib/passwordReset";
import { ok } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const mobile = req.nextUrl.searchParams.get("mobile") || "";
  const employee = await findEmployeeByRegisteredMobile(mobile);
  const eligible = Boolean(
    employee &&
    employee.status === "ACTIVE" &&
    !employee.exitDate &&
    !employee.mustChangePassword
  );
  return ok({ eligible });
}
