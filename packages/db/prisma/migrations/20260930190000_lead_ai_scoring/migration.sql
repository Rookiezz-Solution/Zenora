-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "aiIntentScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aiScoreReasoning" TEXT,
ADD COLUMN     "ruleScore" INTEGER NOT NULL DEFAULT 0;


-- Backfill: existing leads only ever had rule-based scoring, so score == ruleScore today
UPDATE "Lead" SET "ruleScore" = "score";
