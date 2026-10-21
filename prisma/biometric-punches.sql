-- Run once on the DASHBOARD PostgreSQL database, not Realtime SQL Server.
-- Additive only; does not alter employees, leaves or monthly attendance.
CREATE TABLE IF NOT EXISTS "BiometricPunch" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "punchedAt" TIMESTAMPTZ(3) NOT NULL,
  "direction" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BiometricPunch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BiometricPunch_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BiometricPunch_direction_check" CHECK ("direction" IN ('IN', 'OUT', 'UNKNOWN'))
);
CREATE INDEX IF NOT EXISTS "BiometricPunch_employeeId_punchedAt_idx"
  ON "BiometricPunch"("employeeId", "punchedAt");
