-- CreateTable
CREATE TABLE "PlaygroundSolve" (
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaygroundSolve_pkey" PRIMARY KEY ("userId","challengeId")
);

-- AddForeignKey
ALTER TABLE "PlaygroundSolve" ADD CONSTRAINT "PlaygroundSolve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
