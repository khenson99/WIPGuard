import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeFlowAnalytics, type FlowInterval } from "@/lib/flow/analytics";

export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 365;
const ISO_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

class BadRequestError extends Error {}

function parseDateParam(
  value: string | null,
  fallback: Date,
  boundary: "start" | "end"
): Date {
  if (!value) return fallback;

  if (ISO_DATE_ONLY_REGEX.test(value)) {
    const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    return new Date(`${value}${suffix}`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError(`Invalid date: ${value}`);
  }
  return parsed;
}

function parseInterval(value: string | null): FlowInterval {
  if (!value) return "day";
  if (value === "week") return "week";
  if (value === "day") return "day";
  throw new BadRequestError("interval must be one of: day, week");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);

    const from = parseDateParam(request.nextUrl.searchParams.get("from"), defaultFrom, "start");
    const to = parseDateParam(request.nextUrl.searchParams.get("to"), now, "end");
    const interval = parseInterval(request.nextUrl.searchParams.get("interval"));

    if (from > to) {
      return NextResponse.json(
        { error: "from must be before to" },
        { status: 400 }
      );
    }

    const rangeDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    if (rangeDays > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range too large. Maximum ${MAX_RANGE_DAYS} days.` },
        { status: 400 }
      );
    }

    const result = await computeFlowAnalytics({
      from,
      to,
      interval,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to compute flow metrics";
    console.error("GET /api/flow/metrics error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
