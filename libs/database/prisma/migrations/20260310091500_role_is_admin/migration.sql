-- AlterTable
ALTER TABLE "Role"
ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Role_tenant_id_name_idx" ON "Role"("tenant_id", "name");
