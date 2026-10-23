-- Run on the DASHBOARD PostgreSQL database, not the Realtime SQL Server.
-- Additive and repeatable; no existing employee, attendance, leave or scheme data is changed.
BEGIN;
SET LOCAL lock_timeout = '10s';

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssetHandover" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "identifier" TEXT,
    "identifierKey" TEXT,
    "employeeId" TEXT,
    "holderName" TEXT NOT NULL,
    "holderCode" TEXT,
    "holderBranch" TEXT,
    "holderDepartment" TEXT,
    "holderDesignation" TEXT,
    "assignedOn" DATE NOT NULL,
    "movementDate" DATE NOT NULL,
    "condition" TEXT NOT NULL,
    "accessories" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetHandover_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetHandover_status_check" CHECK ("status" IN ('ASSIGNED', 'RETURNED')),
    CONSTRAINT "AssetHandover_type_check" CHECK ("itemType" IN ('MOBILE', 'LAPTOP', 'SIM', 'PEN_DRIVE', 'OTHER')),
    CONSTRAINT "AssetHandover_version_check" CHECK ("version" >= 0)
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssetHandoverEvent" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "fromEmployee" JSONB,
    "toEmployee" JSONB,
    "details" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetHandoverEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetHandoverEvent_action_check" CHECK ("action" IN ('CREATE', 'EDIT', 'TRANSFER', 'RETURN', 'ASSIGN'))
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssetHandoverAttachment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,

    CONSTRAINT "AssetHandoverAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetHandoverAttachment_size_check" CHECK ("fileSize" > 0 AND "fileSize" <= 4194304)
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssetHandover_identifierKey_key" ON "AssetHandover"("identifierKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssetHandover_employeeId_status_idx" ON "AssetHandover"("employeeId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssetHandover_holderBranch_status_idx" ON "AssetHandover"("holderBranch", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssetHandover_updatedAt_idx" ON "AssetHandover"("updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssetHandoverEvent_handoverId_createdAt_idx" ON "AssetHandoverEvent"("handoverId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssetHandoverAttachment_eventId_idx" ON "AssetHandoverAttachment"("eventId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetHandover_employeeId_fkey' AND conrelid = '"AssetHandover"'::regclass) THEN
        ALTER TABLE "AssetHandover" ADD CONSTRAINT "AssetHandover_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetHandoverEvent_handoverId_fkey' AND conrelid = '"AssetHandoverEvent"'::regclass) THEN
        ALTER TABLE "AssetHandoverEvent" ADD CONSTRAINT "AssetHandoverEvent_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "AssetHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetHandoverAttachment_eventId_fkey' AND conrelid = '"AssetHandoverAttachment"'::regclass) THEN
        ALTER TABLE "AssetHandoverAttachment" ADD CONSTRAINT "AssetHandoverAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AssetHandoverEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;


COMMIT;
