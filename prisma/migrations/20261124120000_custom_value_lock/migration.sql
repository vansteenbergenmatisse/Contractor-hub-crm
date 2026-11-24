-- CreateTable
CREATE TABLE "CustomValueLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lockedByAdminId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomValueLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomValueLock_tenantId_key_key" ON "CustomValueLock"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "CustomValueLock" ADD CONSTRAINT "CustomValueLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
