import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HomeLanding } from "@/components/marketing/home-landing";
import { ANALYTICS_HOME } from "@/lib/platform/routes";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(ANALYTICS_HOME);
  }

  return <HomeLanding />;
}
