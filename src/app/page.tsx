import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HomeLanding } from "@/components/marketing/home-landing";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <HomeLanding />;
}
