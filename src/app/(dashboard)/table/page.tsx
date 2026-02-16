import { redirect } from "next/navigation";

export default function LegacyTableRoute() {
  redirect("/tasks?view=table-audit");
}
