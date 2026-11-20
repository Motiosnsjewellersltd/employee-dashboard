-- Additive and repeatable. Existing questions, answers and employee data are retained.
BEGIN;
ALTER TABLE "DailyQuizQuestion" ADD COLUMN IF NOT EXISTS "activity" JSONB;
ALTER TABLE "DailyQuizAnswer" ADD COLUMN IF NOT EXISTS "gameResult" JSONB;
CREATE TABLE IF NOT EXISTS "DailyQuizGameAttempt" (
 "id" TEXT NOT NULL,
 "questionId" TEXT NOT NULL,
 "employeeId" TEXT NOT NULL,
 "version" TEXT NOT NULL,
 "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DailyQuizGameAttempt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DailyQuizGameAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DailyQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DailyQuizGameAttempt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyQuizGameAttempt_questionId_employeeId_key" ON "DailyQuizGameAttempt"("questionId", "employeeId");
CREATE INDEX IF NOT EXISTS "DailyQuizGameAttempt_employeeId_idx" ON "DailyQuizGameAttempt"("employeeId");
COMMIT;
