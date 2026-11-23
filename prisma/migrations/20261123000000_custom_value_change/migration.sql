-- CreateTable
CREATE TABLE "CustomValueChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "previousValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CustomValueChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomValueChange_tenantId_createdAt_idx" ON "CustomValueChange"("tenantId", "createdAt");
