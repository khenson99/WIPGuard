import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metaPage = await prisma.integrationConnection.findFirst({
      where: { provider: "META_PAGE" }
    });

    return NextResponse.json({ metaPage });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
