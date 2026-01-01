/*
  Warnings:

  - You are about to drop the column `email` on the `Invitation` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Invitation` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'ARCHIVED';

-- DropIndex
DROP INDEX "Invitation_email_idx";

-- AlterTable
ALTER TABLE "Invitation" DROP COLUMN "email",
DROP COLUMN "phone",
ADD COLUMN     "messageConfirmedAt" TIMESTAMP(3);
