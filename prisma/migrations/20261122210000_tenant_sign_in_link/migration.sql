-- CreateTable
CREATE TABLE "TenantSignInLink" (
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantSignInLink_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSignInLink_slug_key" ON "TenantSignInLink"("slug");
