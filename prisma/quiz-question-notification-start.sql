-- New questions wait for the Admin row's one-time Send / Check Now action.
ALTER TABLE "DailyQuizQuestion" ADD COLUMN IF NOT EXISTS "notificationsStartedAt" TIMESTAMP(3);
-- Preserve already-sent legacy/current question schedules. No messages are sent here.
UPDATE "DailyQuizQuestion" q
SET "notificationsStartedAt" = (
 SELECT min(n."createdAt") FROM "NotificationBlast" n
 WHERE n."filterType"='SYSTEM' AND (
  n."filterValue"='DAILY_JEWELLERY_QUIZ:'||q."date" OR
  (n."filterValue" LIKE 'DAILY_JEWELLERY_QUIZ:%' AND right(n."filterValue",length(q."id")+1)=':'||q."id")
 )
)
WHERE q."notificationsStartedAt" IS NULL;
