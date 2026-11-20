-- Adds audience snapshots; does not remove questions/answers or change push recipients.
ALTER TABLE "DailyQuizQuestion" ADD COLUMN IF NOT EXISTS "audience" JSONB;
-- Bind legacy quiz notification metadata to its exact question before dates can be edited.
UPDATE "NotificationBlast" n
SET "filterValue" = n."filterValue" || ':' || q."id"
FROM "DailyQuizQuestion" q
WHERE n."filterType" = 'SYSTEM' AND n."filterValue" = 'DAILY_JEWELLERY_QUIZ:' || q."date";
-- Preserve available historical audience evidence. For the earlier pilot without
-- a sent notification/answer, use only its currently bound Ghanshyam profile.
UPDATE "DailyQuizQuestion" q
SET "audience" = CASE WHEN NOT q."isPublished" THEN '[]'::jsonb ELSE COALESCE(
 (SELECT jsonb_agg(jsonb_build_object('employeeId', people."id", 'name', people."name")) FROM (
   SELECT e."id", e."name" FROM "DailyQuizAnswer" a JOIN "Employee" e ON e."id"=a."employeeId" WHERE a."questionId"=q."id"
   UNION
   SELECT e."id", e."name" FROM "NotificationBlast" n JOIN "MessageRecipient" r ON r."blastId"=n."id" JOIN "Employee" e ON e."id"=r."employeeId"
   WHERE n."filterType"='SYSTEM' AND n."filterValue" LIKE 'DAILY_JEWELLERY_QUIZ:%' AND right(n."filterValue", length(q."id")+1)=':'||q."id"
 ) people),
 (SELECT jsonb_build_array(jsonb_build_object('employeeId',e."id",'name',e."name")) FROM "PermissionSetting" p JOIN "Employee" e ON e."id"=(p."value"::jsonb ->> 'targetEmployeeId')
  WHERE p."key"='dailyJewelleryQuizPilot' AND e."role"='EMPLOYEE' AND lower(regexp_replace(btrim(e."name"),'\s+',' ','g'))='ghanshyam jangir'),
 '[]'::jsonb) END
WHERE q."audience" IS NULL;
