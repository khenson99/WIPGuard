import { redirect } from "next/navigation";
import { ANALYTICS_HOME } from "@/lib/platform/routes";

export function redirectToAnalyticsHome(): never {
  redirect(ANALYTICS_HOME);
}
