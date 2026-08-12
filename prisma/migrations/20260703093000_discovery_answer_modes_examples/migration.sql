CREATE TYPE "DiscoveryAnswerMode" AS ENUM ('SINGLE', 'MULTIPLE_MAX', 'MULTIPLE_UNLIMITED');

ALTER TYPE "DiscoveryAnswerType" ADD VALUE 'URL';

ALTER TABLE "DiscoveryQuestion"
  ADD COLUMN "answerMode" "DiscoveryAnswerMode" NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN "maxAnswers" INTEGER;
