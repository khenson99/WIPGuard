export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const RETIRED_MESSAGE = "Board settings have been retired with the Work section.";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: RETIRED_MESSAGE }, { status: 410 });
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json({ error: RETIRED_MESSAGE }, { status: 410 });
}
