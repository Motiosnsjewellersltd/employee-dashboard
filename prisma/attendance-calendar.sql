-- Additive only: existing employees, attendance, leaves and schemes remain intact.
CREATE TABLE IF NOT EXISTS "MonthlyAttendance" (
  "employeeId" TEXT NOT NULL,
  "monthYear" TEXT NOT NULL,
  "days" JSONB NOT NULL,
  "sourceName" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonthlyAttendance_pkey" PRIMARY KEY ("employeeId", "monthYear"),
  CONSTRAINT "MonthlyAttendance_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
