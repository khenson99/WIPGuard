import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "The legacy personalized dashboard endpoint has been retired.",
    },
    { status: 410 },
  );
}
