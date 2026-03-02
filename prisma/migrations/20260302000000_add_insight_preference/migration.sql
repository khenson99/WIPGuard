-- CreateTable
CREATE TABLE "insight_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insightId" VARCHAR(256) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insight_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insight_preferences_userId_insightId_key" ON "insight_preferences"("userId", "insightId");

-- CreateIndex
CREATE INDEX "insight_preferences_userId_idx" ON "insight_preferences"("userId");

-- AddForeignKey
ALTER TABLE "insight_preferences" ADD CONSTRAINT "insight_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
