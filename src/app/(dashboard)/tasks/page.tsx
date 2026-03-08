import { redirect } from "next/navigation";
import { KanbanBoard } from "@/components/board/kanban-board";
import { auth } from "@/lib/auth";

export default async function TasksPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <KanbanBoard />;
}
