-- Additive only: no existing rows, history or attendance is removed.
ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "closureReason" TEXT;
ALTER TABLE "MessageRecipient"
  ADD COLUMN IF NOT EXISTS "pushStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "pushAttemptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pushAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pushAttemptedDevices" INTEGER,
  ADD COLUMN IF NOT EXISTS "pushAcceptedDevices" INTEGER;
