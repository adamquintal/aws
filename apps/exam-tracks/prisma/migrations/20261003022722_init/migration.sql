-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LEARNER', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('draft', 'source_checked', 'human_verified');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'LEARNER',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "examDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "selected" TEXT[],
    "correct" BOOLEAN NOT NULL,
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "firstAttempt" BOOLEAN NOT NULL,
    "context" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicProgress" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "run" INTEGER NOT NULL DEFAULT 0,
    "bestRun" INTEGER NOT NULL DEFAULT 0,
    "gateReachedAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "lessonViewedAt" TIMESTAMP(3),

    CONSTRAINT "TopicProgress_pkey" PRIMARY KEY ("userId","trackId","topicId")
);

-- CreateTable
CREATE TABLE "ExplainBack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "selfRating" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplainBack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCard" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "scheduler" TEXT NOT NULL DEFAULT 'leitner',
    "state" JSONB NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCard_pkey" PRIMARY KEY ("userId","trackId","questionId")
);

-- CreateTable
CREATE TABLE "StudyDay" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "activeMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StudyDay_pkey" PRIMARY KEY ("userId","trackId","day")
);

-- CreateTable
CREATE TABLE "ReadinessSnapshot" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "byDomain" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessSnapshot_pkey" PRIMARY KEY ("userId","trackId","day")
);

-- CreateTable
CREATE TABLE "ContentSnapshot" (
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentSnapshot_pkey" PRIMARY KEY ("itemId","version")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "note" TEXT,
    "reviewerId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "questionId" TEXT NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "message" TEXT,
    "status" "FlagStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_trackId_key" ON "Enrollment"("userId", "trackId");

-- CreateIndex
CREATE INDEX "Attempt_userId_trackId_createdAt_idx" ON "Attempt"("userId", "trackId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_questionId_idx" ON "Attempt"("questionId");

-- CreateIndex
CREATE INDEX "ExplainBack_userId_trackId_topicId_idx" ON "ExplainBack"("userId", "trackId", "topicId");

-- CreateIndex
CREATE INDEX "ReviewCard_userId_trackId_dueAt_idx" ON "ReviewCard"("userId", "trackId", "dueAt");

-- CreateIndex
CREATE INDEX "ReviewDecision_itemId_version_idx" ON "ReviewDecision"("itemId", "version");

-- CreateIndex
CREATE INDEX "Flag_questionId_idx" ON "Flag"("questionId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicProgress" ADD CONSTRAINT "TopicProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainBack" ADD CONSTRAINT "ExplainBack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyDay" ADD CONSTRAINT "StudyDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
