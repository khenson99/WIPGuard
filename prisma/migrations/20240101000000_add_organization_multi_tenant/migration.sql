-- CreateTable: Organization
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Organization.slug unique
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- AlterTable: Add organizationId to User
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to Project
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to Task
ALTER TABLE "Task" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to Sprint
ALTER TABLE "Sprint" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to Deal
ALTER TABLE "Deal" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to Department
ALTER TABLE "Department" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to CompanyPriority
ALTER TABLE "CompanyPriority" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to IntegrationConnection
ALTER TABLE "IntegrationConnection" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to Conference
ALTER TABLE "Conference" ADD COLUMN "organizationId" TEXT;

-- CreateIndex: organizationId indexes for query performance
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");
CREATE INDEX "Task_organizationId_idx" ON "Task"("organizationId");
CREATE INDEX "Sprint_organizationId_idx" ON "Sprint"("organizationId");
CREATE INDEX "Deal_organizationId_idx" ON "Deal"("organizationId");
CREATE INDEX "Department_organizationId_idx" ON "Department"("organizationId");
CREATE INDEX "CompanyPriority_organizationId_idx" ON "CompanyPriority"("organizationId");
CREATE INDEX "IntegrationConnection_organizationId_idx" ON "IntegrationConnection"("organizationId");
CREATE INDEX "Conference_organizationId_idx" ON "Conference"("organizationId");

-- AddForeignKey: User -> Organization
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Project -> Organization
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Task -> Organization
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Sprint -> Organization
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Deal -> Organization
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Department -> Organization
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompanyPriority -> Organization
ALTER TABLE "CompanyPriority" ADD CONSTRAINT "CompanyPriority_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: IntegrationConnection -> Organization
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Conference -> Organization
ALTER TABLE "Conference" ADD CONSTRAINT "Conference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
