-- CreateTable
CREATE TABLE "TenantSyncState" (
    "tenantId" TEXT NOT NULL,
    "lastClaimedAt" TIMESTAMP(3),
    "mailDay" DATE,
    "mailCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TenantSyncState_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "TenantSyncState" ADD CONSTRAINT "TenantSyncState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
