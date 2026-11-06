CREATE TABLE "EmailMessageUserState" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessageUserState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailMessageUserState_emailMessageId_userId_key"
ON "EmailMessageUserState"("emailMessageId", "userId");

CREATE INDEX "EmailMessageUserState_userId_readAt_idx"
ON "EmailMessageUserState"("userId", "readAt");

ALTER TABLE "EmailMessageUserState"
ADD CONSTRAINT "EmailMessageUserState_emailMessageId_fkey"
FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailMessageUserState"
ADD CONSTRAINT "EmailMessageUserState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
