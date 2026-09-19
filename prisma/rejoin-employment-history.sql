CREATE TABLE IF NOT EXISTS "EmploymentHistory" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "joiningDate" TIMESTAMP(3),
  "exitDate" TIMESTAMP(3),
  "designation" TEXT,
  "department" TEXT,
  "branch" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT,
  "recordedByName" TEXT,
  CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmploymentHistory_employeeId_joiningDate_idx"
  ON "EmploymentHistory"("employeeId", "joiningDate");

CREATE INDEX IF NOT EXISTS "EmploymentHistory_employeeId_exitDate_idx"
  ON "EmploymentHistory"("employeeId", "exitDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmploymentHistory_employeeId_fkey'
  ) THEN
    ALTER TABLE "EmploymentHistory"
      ADD CONSTRAINT "EmploymentHistory_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
