import { redirect } from "next/navigation";
import { SOURCES_HOME } from "@/lib/platform/routes";

export default function IntegrationsPage(): never {
  redirect(SOURCES_HOME);
}
