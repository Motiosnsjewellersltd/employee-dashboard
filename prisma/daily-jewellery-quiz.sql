-- Additive quiz tables only. No employee/attendance/leave rows are modified.
CREATE TABLE IF NOT EXISTS "DailyQuizQuestion" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "date" TEXT NOT NULL,
 "question" TEXT NOT NULL,
 "options" JSONB NOT NULL,
 "correctIndex" INTEGER NOT NULL,
 "explanation" TEXT NOT NULL,
 "isPublished" BOOLEAN NOT NULL DEFAULT false,
 "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyQuizQuestion_date_key" ON "DailyQuizQuestion"("date");
CREATE TABLE IF NOT EXISTS "DailyQuizAnswer" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "questionId" TEXT NOT NULL REFERENCES "DailyQuizQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "selectedIndex" INTEGER NOT NULL,
 "isCorrect" BOOLEAN NOT NULL,
 "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyQuizAnswer_questionId_employeeId_key" ON "DailyQuizAnswer"("questionId", "employeeId");
CREATE INDEX IF NOT EXISTS "DailyQuizAnswer_employeeId_answeredAt_idx" ON "DailyQuizAnswer"("employeeId", "answeredAt");
