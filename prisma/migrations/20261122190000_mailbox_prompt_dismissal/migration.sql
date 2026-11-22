-- CreateTable
CREATE TABLE "MailboxPromptDismissal" (
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailboxPromptDismissal_pkey" PRIMARY KEY ("userId","tenantId")
);
