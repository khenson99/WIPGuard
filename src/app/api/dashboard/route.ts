import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "The legacy dashboard endpoint has been retired. Use /api/dashboard/overview instead.",
    },
    { status: 410 },
  );
}
