-- Spaced repetition (#50): a review interval, an ease factor, and when each
-- (user, country, quiz type) is next due, replacing "three correct in a row" as
-- what makes a country learned. See packages/shared/src/scheduling.ts.

ALTER TABLE "progress"
  ADD COLUMN "interval_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "ease"          DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  ADD COLUMN "due_at"        TIMESTAMPTZ(6),
  ADD COLUMN "learned_at"    TIMESTAMPTZ(6);

-- Backfill from the streak each row already has, so nobody's progress moves.
-- The same ladder the scheduler climbs (1 day, 6 days, then the ease factor
-- times the last), landing a previously "learned" row (three in a row; one
-- recall for the recall type) at or above its learned interval, and a lapsed one
-- (streak 0) at nothing, due straight away. Due dates run from the last answer,
-- so a country last answered a month ago is overdue and comes back first —
-- which is the point of the change.
UPDATE "progress" AS p
   SET "interval_days" = CASE
         WHEN q."format" = 'recall' THEN (CASE WHEN p."current_streak" >= 1 THEN 1 ELSE 0 END)
         WHEN p."current_streak" <= 0 THEN 0
         WHEN p."current_streak" = 1 THEN 1
         WHEN p."current_streak" = 2 THEN 6
         ELSE 15
       END
  FROM "quiz_types" AS q
 WHERE q."id" = p."quiz_type_id";

UPDATE "progress"
   SET "due_at" = "last_answered_at" + ("interval_days" * INTERVAL '1 day'),
       "learned_at" = CASE WHEN "is_learned" THEN "last_answered_at" ELSE NULL END
 WHERE "last_answered_at" IS NOT NULL;

CREATE INDEX "progress_user_id_quiz_type_id_due_at_idx"
  ON "progress" ("user_id", "quiz_type_id", "due_at");
