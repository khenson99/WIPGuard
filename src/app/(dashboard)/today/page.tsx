import { redirect } from "next/navigation";

export default function LegacyTodayRoute() {
  redirect("/tasks?view=today-focus");
}
