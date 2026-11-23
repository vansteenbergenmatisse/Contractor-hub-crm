-- CreateTable
CREATE TABLE "RouteStartNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RouteStartNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteStartNotification_tenantId_appointmentId_key" ON "RouteStartNotification"("tenantId", "appointmentId");
