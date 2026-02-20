CREATE TABLE "StripeCustomerLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "hubspotDealId" TEXT NOT NULL,
    "hubspotDealName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeCustomerLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeCustomerLink_userId_stripeCustomerId_key" ON "StripeCustomerLink"("userId", "stripeCustomerId");
CREATE UNIQUE INDEX "StripeCustomerLink_userId_hubspotDealId_key" ON "StripeCustomerLink"("userId", "hubspotDealId");
CREATE INDEX "StripeCustomerLink_userId_idx" ON "StripeCustomerLink"("userId");

ALTER TABLE "StripeCustomerLink" ADD CONSTRAINT "StripeCustomerLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
