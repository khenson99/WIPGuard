export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
const RETIRED_MESSAGE = "Standup has been retired with the Work section.";
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: RETIRED_MESSAGE }, { status: 410 });
}
