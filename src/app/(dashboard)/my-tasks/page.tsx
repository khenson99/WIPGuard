import { redirect } from "next/navigation";

export default function LegacyMyTasksRoute() {
  redirect("/tasks?view=my-work");
}
