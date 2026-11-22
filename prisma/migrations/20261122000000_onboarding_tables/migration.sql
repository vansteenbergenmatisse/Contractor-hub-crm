-- CreateTable
CREATE TABLE "GhlUserLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ghlUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GhlUserLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingAppAlert" (
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAlertedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissingAppAlert_pkey" PRIMARY KEY ("locationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GhlUserLink_userId_key" ON "GhlUserLink"("userId");

-- CreateIndex
CREATE INDEX "GhlUserLink_tenantId_idx" ON "GhlUserLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GhlUserLink_tenantId_ghlUserId_key" ON "GhlUserLink"("tenantId", "ghlUserId");

