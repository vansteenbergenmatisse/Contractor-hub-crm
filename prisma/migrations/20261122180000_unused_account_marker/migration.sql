-- CreateTable
CREATE TABLE "UnusedAccountMarker" (
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "credentialFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnusedAccountMarker_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UnusedAccountMarker" ADD CONSTRAINT "UnusedAccountMarker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
