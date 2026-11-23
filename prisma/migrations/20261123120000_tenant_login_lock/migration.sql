-- CreateTable
CREATE TABLE "TenantLoginLock" (
    "tenantId" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantLoginLock_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "TenantLoginLock" ADD CONSTRAINT "TenantLoginLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

