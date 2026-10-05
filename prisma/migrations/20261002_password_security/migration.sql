-- Existing employees keep their current access state.
-- New employees default to a forced password change.
ALTER TABLE "Employee" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ALTER COLUMN "mustChangePassword" SET DEFAULT true;
