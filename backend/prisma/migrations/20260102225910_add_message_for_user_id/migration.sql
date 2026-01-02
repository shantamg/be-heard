-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "forUserId" TEXT;

-- CreateIndex
CREATE INDEX "Message_forUserId_idx" ON "Message"("forUserId");
