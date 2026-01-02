-- Update embedding columns from vector(1536) to vector(1024)
-- Titan Embed v2 outputs 1024 dimensions, not 1536
-- Existing embeddings must be cleared as they have wrong dimensions

-- Clear existing embeddings (they have wrong dimensions)
UPDATE "InnerWorkMessage" SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE "UserVessel" SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE "UserEvent" SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE "Message" SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE "PreSessionMessage" SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE "GlobalLibraryItem" SET embedding = NULL WHERE embedding IS NOT NULL;

-- Alter columns to new dimension
ALTER TABLE "InnerWorkMessage" ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE "UserVessel" ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE "UserEvent" ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE "Message" ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE "PreSessionMessage" ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE "GlobalLibraryItem" ALTER COLUMN embedding TYPE vector(1024);
