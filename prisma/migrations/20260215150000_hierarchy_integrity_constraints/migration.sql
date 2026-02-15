-- AlterForeignKey: Project.parentId — prevent deletion of parent that has children
ALTER TABLE "Project" DROP CONSTRAINT "Project_parentId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterForeignKey: Task.parentId — prevent deletion of parent that has subtasks
ALTER TABLE "Task" DROP CONSTRAINT "Task_parentId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterForeignKey: LogbookEntry.taskId — cascade delete logbook entries when task is deleted
ALTER TABLE "LogbookEntry" DROP CONSTRAINT "LogbookEntry_taskId_fkey";
ALTER TABLE "LogbookEntry" ADD CONSTRAINT "LogbookEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
