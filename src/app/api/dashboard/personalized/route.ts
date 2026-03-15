import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "The personalized task dashboard has been retired.",
    },
    { status: 410 },
  );
}
