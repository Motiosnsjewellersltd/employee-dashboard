CREATE TABLE IF NOT EXISTS "OfficialDutyRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "sentById" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expectedStartAt" TIMESTAMP(3),
  "expectedReturnAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING_SENDER',
  "senderStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "senderRejectionReason" TEXT,
  "senderDecidedAt" TIMESTAMP(3),
  "hrStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "hrRejectionReason" TEXT,
  "hrDecidedById" TEXT,
  "hrDecidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfficialDutyRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OfficialDutyLocation" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "addressText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfficialDutyLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OfficialDutyEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "locationId" TEXT,
  "eventType" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyMeters" DOUBLE PRECISION,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfficialDutyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OfficialDutyRequest_requesterId_createdAt_idx" ON "OfficialDutyRequest"("requesterId", "createdAt");
CREATE INDEX IF NOT EXISTS "OfficialDutyRequest_sentById_createdAt_idx" ON "OfficialDutyRequest"("sentById", "createdAt");
CREATE INDEX IF NOT EXISTS "OfficialDutyRequest_status_createdAt_idx" ON "OfficialDutyRequest"("status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "OfficialDutyLocation_requestId_sequence_key" ON "OfficialDutyLocation"("requestId", "sequence");
CREATE INDEX IF NOT EXISTS "OfficialDutyLocation_requestId_idx" ON "OfficialDutyLocation"("requestId");
CREATE INDEX IF NOT EXISTS "OfficialDutyEvent_requestId_capturedAt_idx" ON "OfficialDutyEvent"("requestId", "capturedAt");
CREATE INDEX IF NOT EXISTS "OfficialDutyEvent_locationId_idx" ON "OfficialDutyEvent"("locationId");

DO $$ BEGIN
  ALTER TABLE "OfficialDutyRequest" ADD CONSTRAINT "OfficialDutyRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OfficialDutyRequest" ADD CONSTRAINT "OfficialDutyRequest_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OfficialDutyRequest" ADD CONSTRAINT "OfficialDutyRequest_hrDecidedById_fkey" FOREIGN KEY ("hrDecidedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OfficialDutyLocation" ADD CONSTRAINT "OfficialDutyLocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OfficialDutyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OfficialDutyEvent" ADD CONSTRAINT "OfficialDutyEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OfficialDutyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OfficialDutyEvent" ADD CONSTRAINT "OfficialDutyEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "OfficialDutyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
