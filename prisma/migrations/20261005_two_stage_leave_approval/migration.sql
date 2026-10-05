ALTER TABLE "LeaveRequest"
ADD COLUMN "managerStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "managerRejectionReason" TEXT,
ADD COLUMN "managerDecidedById" TEXT,
ADD COLUMN "managerDecidedAt" TIMESTAMP(3);

CREATE INDEX "LeaveRequest_managerStatus_createdAt_idx"
ON "LeaveRequest"("managerStatus", "createdAt");

ALTER TABLE "LeaveRequest"
ADD CONSTRAINT "LeaveRequest_managerDecidedById_fkey"
FOREIGN KEY ("managerDecidedById") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
