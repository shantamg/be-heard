-- CreateTable
CREATE TABLE "PreSessionMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1024),
    "detectedIntent" TEXT,
    "emotionalTone" TEXT,
    "extractedPerson" TEXT,
    "extractedTopic" TEXT,
    "associatedSessionId" TEXT,
    "associatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreSessionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreSessionMessage_userId_timestamp_idx" ON "PreSessionMessage"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "PreSessionMessage_userId_associatedSessionId_idx" ON "PreSessionMessage"("userId", "associatedSessionId");

-- CreateIndex
CREATE INDEX "PreSessionMessage_expiresAt_idx" ON "PreSessionMessage"("expiresAt");
