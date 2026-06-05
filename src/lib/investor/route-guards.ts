import { redirect } from "next/navigation";
import { normalizeRole } from "@/lib/permissions";

export function redirectInvestorToInvestorWorkspace(role: string | null | undefined): void {
  if (normalizeRole(role) === "investor") {
    redirect("/investor");
  }
}
