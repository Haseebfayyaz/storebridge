-- AlterTable
ALTER TABLE "User"
ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "User_createdById_idx" ON "User"("createdById");

-- AddForeignKey
ALTER TABLE "User"
ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
