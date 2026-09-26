-- AlterTable: add per-clue difficulty to country_facts
ALTER TABLE "country_facts" ADD COLUMN "difficulty" TEXT NOT NULL DEFAULT 'Medium';

-- CreateIndex: filter trivia by clue difficulty
CREATE INDEX "country_facts_difficulty_idx" ON "country_facts"("difficulty");

-- AlterTable: store the chosen fact on trivia session questions
ALTER TABLE "session_questions" ADD COLUMN "fact_id" INTEGER;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_fact_id_fkey"
  FOREIGN KEY ("fact_id") REFERENCES "country_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: per-fact rotation tracking (no clue repeats until all seen)
CREATE TABLE "fact_progress" (
    "user_id" UUID NOT NULL,
    "fact_id" INTEGER NOT NULL,
    "last_answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_progress_pkey" PRIMARY KEY ("user_id","fact_id")
);

-- CreateIndex
CREATE INDEX "fact_progress_user_id_last_answered_at_idx"
  ON "fact_progress"("user_id", "last_answered_at");

-- AddForeignKey
ALTER TABLE "fact_progress" ADD CONSTRAINT "fact_progress_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_progress" ADD CONSTRAINT "fact_progress_fact_id_fkey"
  FOREIGN KEY ("fact_id") REFERENCES "country_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
