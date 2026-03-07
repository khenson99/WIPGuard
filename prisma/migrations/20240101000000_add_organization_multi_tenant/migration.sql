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
DO $$
BEGIN
  IF to_regclass('"Deal"') IS NOT NULL THEN
    ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
  END IF;
END $$;

-- AlterTable: Add organizationId to Department
DO $$
BEGIN
  IF to_regclass('"Department"') IS NOT NULL THEN
    ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
  END IF;
END $$;

-- AlterTable: Add organizationId to CompanyPriority
ALTER TABLE "CompanyPriority" ADD COLUMN "organizationId" TEXT;

-- AlterTable: Add organizationId to IntegrationConnection
DO $$
BEGIN
  IF to_regclass('"IntegrationConnection"') IS NOT NULL THEN
    ALTER TABLE "IntegrationConnection" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
  END IF;
END $$;

-- AlterTable: Add organizationId to Conference
DO $$
BEGIN
  IF to_regclass('"Conference"') IS NOT NULL THEN
    ALTER TABLE "Conference" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
  END IF;
END $$;

-- CreateIndex: organizationId indexes for query performance
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");
CREATE INDEX "Task_organizationId_idx" ON "Task"("organizationId");
CREATE INDEX "Sprint_organizationId_idx" ON "Sprint"("organizationId");
DO $$
BEGIN
  IF to_regclass('"Deal"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Deal_organizationId_idx" ON "Deal"("organizationId")';
  END IF;
END $$;
DO $$
BEGIN
  IF to_regclass('"Department"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Department_organizationId_idx" ON "Department"("organizationId")';
  END IF;
END $$;
CREATE INDEX "CompanyPriority_organizationId_idx" ON "CompanyPriority"("organizationId");
DO $$
BEGIN
  IF to_regclass('"IntegrationConnection"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "IntegrationConnection_organizationId_idx" ON "IntegrationConnection"("organizationId")';
  END IF;
END $$;
DO $$
BEGIN
  IF to_regclass('"Conference"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Conference_organizationId_idx" ON "Conference"("organizationId")';
  END IF;
END $$;

-- AddForeignKey: User -> Organization
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Project -> Organization
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Task -> Organization
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Sprint -> Organization
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Deal -> Organization
DO $$
BEGIN
  IF to_regclass('"Deal"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_organizationId_fkey') THEN
    ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: Department -> Organization
DO $$
BEGIN
  IF to_regclass('"Department"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Department_organizationId_fkey') THEN
    ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: CompanyPriority -> Organization
ALTER TABLE "CompanyPriority" ADD CONSTRAINT "CompanyPriority_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: IntegrationConnection -> Organization
DO $$
BEGIN
  IF to_regclass('"IntegrationConnection"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationConnection_organizationId_fkey') THEN
    ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: Conference -> Organization
DO $$
BEGIN
  IF to_regclass('"Conference"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conference_organizationId_fkey') THEN
    ALTER TABLE "Conference" ADD CONSTRAINT "Conference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
