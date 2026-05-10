import { redirect } from "next/navigation";
import { METRICS_HOME } from "@/lib/platform/routes";

export default function AnalyticsPage(): never {
  redirect(METRICS_HOME);
}
