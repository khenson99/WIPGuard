import { NextResponse } from "next/server";

export function retiredWorkResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 410 });
}

export function createRetiredWorkRoute(message: string) {
  return async (...args: unknown[]): Promise<NextResponse> => {
    void args;
    return retiredWorkResponse(message);
  };
}
