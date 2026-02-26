-- CreateEnum
CREATE TYPE "ConferenceStatus" AS ENUM ('DRAFT', 'PLANNING', 'COMMITTED', 'ONSITE', 'WRAP_UP', 'COMPLETE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ConferenceType" AS ENUM ('EXHIBIT', 'SPONSOR', 'SPEAK', 'ATTEND', 'HYBRID');

-- CreateEnum
CREATE TYPE "ConferenceDeadlineType" AS ENUM ('SPONSORSHIP', 'REGISTRATION', 'CFP', 'BOOTH', 'SWAG', 'SHIPPING', 'TRAVEL', 'MARKETING', 'MEETINGS', 'LEAD_UPLOAD', 'POSTMORTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "ConferenceLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'FOLLOW_UP_SCHEDULED', 'CONTACTED', 'CONVERTED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "ConferenceExpenseCategory" AS ENUM ('SPONSORSHIP', 'BOOTH', 'SWAG', 'SHIPPING', 'TRAVEL', 'LODGING', 'MEALS', 'EVENTS', 'SOFTWARE', 'OTHER');

-- CreateEnum
CREATE TYPE "ConferenceTeamRole" AS ENUM ('ORGANIZER', 'ATTENDEE', 'BOOTH_STAFF', 'SPEAKER', 'EXEC');

-- CreateEnum
CREATE TYPE "ConferenceReimbursementStatus" AS ENUM ('NONE', 'REQUESTED', 'APPROVED', 'PAID');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "conferenceId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "conferenceId" TEXT;

-- CreateTable
CREATE TABLE "Conference" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "venue" TEXT,
    "status" "ConferenceStatus" NOT NULL DEFAULT 'PLANNING',
    "type" "ConferenceType" NOT NULL DEFAULT 'EXHIBIT',
    "notes" TEXT,
    "slackChannelId" TEXT,
    "slackChannelName" TEXT,
    "slackChannelUrl" TEXT,
    "driveFolderUrl" TEXT,
    "codaDocUrl" TEXT,
    "ownerId" TEXT,
    "primaryProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenceDeadline" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "type" "ConferenceDeadlineType" NOT NULL,
    "name" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "notes" TEXT,
    "sourceUrl" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenceBudget" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenceBudgetLineItem" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "category" "ConferenceExpenseCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "plannedAmount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceBudgetLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenceExpense" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "category" "ConferenceExpenseCategory" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "vendor" TEXT,
    "description" TEXT,
    "receiptUrl" TEXT,
    "reimbursable" BOOLEAN NOT NULL DEFAULT false,
    "reimbursementStatus" "ConferenceReimbursementStatus" NOT NULL DEFAULT 'NONE',
    "paidByUserId" TEXT,
    "budgetLineItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenceLead" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "status" "ConferenceLeadStatus" NOT NULL DEFAULT 'NEW',
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "companyDomain" TEXT,
    "linkedinUrl" TEXT,
    "notes" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "followupTaskId" TEXT,
    "followedUpAt" TIMESTAMP(3),
    "hubspotCompanyId" TEXT,
    "hubspotContactId" TEXT,
    "hubspotDealId" TEXT,
    "pushedToHubspotAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenceTeamMember" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ConferenceTeamRole" NOT NULL,
    "arrivalAt" TIMESTAMP(3),
    "departureAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenceInventoryItem" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "qtyPlanned" INTEGER NOT NULL DEFAULT 0,
    "qtyPacked" INTEGER NOT NULL DEFAULT 0,
    "qtyOnsite" INTEGER NOT NULL DEFAULT 0,
    "qtyRemaining" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conference_slug_key" ON "Conference"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Conference_primaryProjectId_key" ON "Conference"("primaryProjectId");

-- CreateIndex
CREATE INDEX "Conference_startDate_idx" ON "Conference"("startDate");

-- CreateIndex
CREATE INDEX "Conference_status_idx" ON "Conference"("status");

-- CreateIndex
CREATE INDEX "Conference_ownerId_idx" ON "Conference"("ownerId");

-- CreateIndex
CREATE INDEX "Project_conferenceId_idx" ON "Project"("conferenceId");

-- CreateIndex
CREATE INDEX "Task_conferenceId_idx" ON "Task"("conferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenceDeadline_taskId_key" ON "ConferenceDeadline"("taskId");

-- CreateIndex
CREATE INDEX "ConferenceDeadline_conferenceId_dueAt_idx" ON "ConferenceDeadline"("conferenceId", "dueAt");

-- CreateIndex
CREATE INDEX "ConferenceDeadline_ownerId_dueAt_idx" ON "ConferenceDeadline"("ownerId", "dueAt");

-- CreateIndex
CREATE INDEX "ConferenceDeadline_taskId_idx" ON "ConferenceDeadline"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenceBudget_conferenceId_key" ON "ConferenceBudget"("conferenceId");

-- CreateIndex
CREATE INDEX "ConferenceBudgetLineItem_budgetId_idx" ON "ConferenceBudgetLineItem"("budgetId");

-- CreateIndex
CREATE INDEX "ConferenceExpense_conferenceId_incurredAt_idx" ON "ConferenceExpense"("conferenceId", "incurredAt");

-- CreateIndex
CREATE INDEX "ConferenceExpense_category_idx" ON "ConferenceExpense"("category");

-- CreateIndex
CREATE INDEX "ConferenceExpense_budgetLineItemId_idx" ON "ConferenceExpense"("budgetLineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenceLead_followupTaskId_key" ON "ConferenceLead"("followupTaskId");

-- CreateIndex
CREATE INDEX "ConferenceLead_conferenceId_status_idx" ON "ConferenceLead"("conferenceId", "status");

-- CreateIndex
CREATE INDEX "ConferenceLead_assignedToUserId_status_idx" ON "ConferenceLead"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "ConferenceLead_followupTaskId_idx" ON "ConferenceLead"("followupTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenceTeamMember_conferenceId_userId_key" ON "ConferenceTeamMember"("conferenceId", "userId");

-- CreateIndex
CREATE INDEX "ConferenceTeamMember_conferenceId_role_idx" ON "ConferenceTeamMember"("conferenceId", "role");

-- CreateIndex
CREATE INDEX "ConferenceInventoryItem_conferenceId_name_idx" ON "ConferenceInventoryItem"("conferenceId", "name");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conference" ADD CONSTRAINT "Conference_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conference" ADD CONSTRAINT "Conference_primaryProjectId_fkey" FOREIGN KEY ("primaryProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceDeadline" ADD CONSTRAINT "ConferenceDeadline_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceDeadline" ADD CONSTRAINT "ConferenceDeadline_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceDeadline" ADD CONSTRAINT "ConferenceDeadline_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceBudget" ADD CONSTRAINT "ConferenceBudget_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceBudgetLineItem" ADD CONSTRAINT "ConferenceBudgetLineItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "ConferenceBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceExpense" ADD CONSTRAINT "ConferenceExpense_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceExpense" ADD CONSTRAINT "ConferenceExpense_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceExpense" ADD CONSTRAINT "ConferenceExpense_budgetLineItemId_fkey" FOREIGN KEY ("budgetLineItemId") REFERENCES "ConferenceBudgetLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceLead" ADD CONSTRAINT "ConferenceLead_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceLead" ADD CONSTRAINT "ConferenceLead_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceLead" ADD CONSTRAINT "ConferenceLead_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceLead" ADD CONSTRAINT "ConferenceLead_followupTaskId_fkey" FOREIGN KEY ("followupTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceTeamMember" ADD CONSTRAINT "ConferenceTeamMember_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceTeamMember" ADD CONSTRAINT "ConferenceTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceInventoryItem" ADD CONSTRAINT "ConferenceInventoryItem_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenceInventoryItem" ADD CONSTRAINT "ConferenceInventoryItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

