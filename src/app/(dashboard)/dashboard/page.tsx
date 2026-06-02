import { redirect } from "next/navigation";
import { METRICS_HOME } from "@/lib/platform/routes";

export default function DashboardPage() {
  redirect(METRICS_HOME);
}
