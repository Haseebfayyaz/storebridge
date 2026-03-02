-- AlterTable
ALTER TABLE "Inventory"
ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Inventory_storeId_isDeleted_updatedAt_idx"
ON "Inventory"("storeId", "isDeleted", "updatedAt");
