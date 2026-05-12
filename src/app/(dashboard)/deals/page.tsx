import { redirect } from "next/navigation";
import { SOURCES_HOME } from "@/lib/platform/routes";

export default function DealsPage(): never {
  redirect(SOURCES_HOME);
}
