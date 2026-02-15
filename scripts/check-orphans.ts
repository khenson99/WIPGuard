/**
 * Orphaned Relationship Check Script
 *
 * Detects data integrity issues in the hierarchy:
 * - Tasks referencing non-existent parent tasks
 * - Tasks referencing non-existent projects
 * - Projects referencing non-existent parent projects
 * - Projects referencing non-existent company priorities
 *
 * Usage: npx tsx scripts/check-orphans.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  let hasOrphans = false;

  try {
    console.log("=== Orphaned Relationship Check ===\n");

    // 1. Tasks with parentId pointing to non-existent task
    const tasksWithBadParent = await prisma.$queryRawUnsafe<{ id: string; title: string; parentId: string }[]>(
      `SELECT t."id", t."title", t."parentId"
       FROM "Task" t
       LEFT JOIN "Task" p ON t."parentId" = p."id"
       WHERE t."parentId" IS NOT NULL AND p."id" IS NULL`,
    );
    if (tasksWithBadParent.length > 0) {
      hasOrphans = true;
      console.log(`ORPHAN: ${tasksWithBadParent.length} task(s) reference non-existent parent task:`);
      for (const t of tasksWithBadParent) {
        console.log(`  - Task "${t.title}" (${t.id}) -> parent ${t.parentId}`);
      }
      console.log();
    }

    // 2. Tasks with projectId pointing to non-existent project
    const tasksWithBadProject = await prisma.$queryRawUnsafe<{ id: string; title: string; projectId: string }[]>(
      `SELECT t."id", t."title", t."projectId"
       FROM "Task" t
       LEFT JOIN "Project" p ON t."projectId" = p."id"
       WHERE t."projectId" IS NOT NULL AND p."id" IS NULL`,
    );
    if (tasksWithBadProject.length > 0) {
      hasOrphans = true;
      console.log(`ORPHAN: ${tasksWithBadProject.length} task(s) reference non-existent project:`);
      for (const t of tasksWithBadProject) {
        console.log(`  - Task "${t.title}" (${t.id}) -> project ${t.projectId}`);
      }
      console.log();
    }

    // 3. Projects with parentId pointing to non-existent project
    const projectsWithBadParent = await prisma.$queryRawUnsafe<{ id: string; name: string; parentId: string }[]>(
      `SELECT p."id", p."name", p."parentId"
       FROM "Project" p
       LEFT JOIN "Project" pp ON p."parentId" = pp."id"
       WHERE p."parentId" IS NOT NULL AND pp."id" IS NULL`,
    );
    if (projectsWithBadParent.length > 0) {
      hasOrphans = true;
      console.log(`ORPHAN: ${projectsWithBadParent.length} project(s) reference non-existent parent project:`);
      for (const p of projectsWithBadParent) {
        console.log(`  - Project "${p.name}" (${p.id}) -> parent ${p.parentId}`);
      }
      console.log();
    }

    // 4. Projects with companyPriorityId pointing to non-existent priority
    const projectsWithBadPriority = await prisma.$queryRawUnsafe<{ id: string; name: string; companyPriorityId: string }[]>(
      `SELECT p."id", p."name", p."companyPriorityId"
       FROM "Project" p
       LEFT JOIN "CompanyPriority" cp ON p."companyPriorityId" = cp."id"
       WHERE p."companyPriorityId" IS NOT NULL AND cp."id" IS NULL`,
    );
    if (projectsWithBadPriority.length > 0) {
      hasOrphans = true;
      console.log(`ORPHAN: ${projectsWithBadPriority.length} project(s) reference non-existent company priority:`);
      for (const p of projectsWithBadPriority) {
        console.log(`  - Project "${p.name}" (${p.id}) -> priority ${p.companyPriorityId}`);
      }
      console.log();
    }

    // 5. Circular parent references in tasks
    const taskCircles = await prisma.$queryRawUnsafe<{ id: string; title: string }[]>(
      `WITH RECURSIVE chain AS (
         SELECT "id", "parentId", "title", 1 AS depth
         FROM "Task"
         WHERE "parentId" IS NOT NULL
         UNION ALL
         SELECT c."id", t."parentId", c."title", c.depth + 1
         FROM chain c
         JOIN "Task" t ON c."parentId" = t."id"
         WHERE t."parentId" IS NOT NULL AND c.depth < 20
       )
       SELECT DISTINCT c."id", c."title"
       FROM chain c
       WHERE c.depth >= 20`,
    );
    if (taskCircles.length > 0) {
      hasOrphans = true;
      console.log(`CIRCULAR: ${taskCircles.length} task(s) may have circular parent references:`);
      for (const t of taskCircles) {
        console.log(`  - Task "${t.title}" (${t.id})`);
      }
      console.log();
    }

    // 6. Circular parent references in projects
    const projectCircles = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
      `WITH RECURSIVE chain AS (
         SELECT "id", "parentId", "name", 1 AS depth
         FROM "Project"
         WHERE "parentId" IS NOT NULL
         UNION ALL
         SELECT c."id", p."parentId", c."name", c.depth + 1
         FROM chain c
         JOIN "Project" p ON c."parentId" = p."id"
         WHERE p."parentId" IS NOT NULL AND c.depth < 20
       )
       SELECT DISTINCT c."id", c."name"
       FROM chain c
       WHERE c.depth >= 20`,
    );
    if (projectCircles.length > 0) {
      hasOrphans = true;
      console.log(`CIRCULAR: ${projectCircles.length} project(s) may have circular parent references:`);
      for (const p of projectCircles) {
        console.log(`  - Project "${p.name}" (${p.id})`);
      }
      console.log();
    }

    if (!hasOrphans) {
      console.log("OK: No orphaned relationships detected.");
    }

    await prisma.$disconnect();
    process.exit(hasOrphans ? 1 : 0);
  } catch (error) {
    console.error("ERROR running orphan check:", error);
    await prisma.$disconnect();
    process.exit(2);
  }
}

main();
