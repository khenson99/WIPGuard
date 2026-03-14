import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import {
  DEALS_SCHEMA_MISSING_CODE,
  DEALS_SCHEMA_MISSING_MESSAGE,
  type DealsSchemaMissingPayload,
} from "@/lib/deals/schema-state";

const DEALS_TABLE_PATTERN =
  /(?:table|relation)\s+[`"']?(?:public\.)?(Deal|DealCompany|DealContact|DealMeeting|DealStageHistory|_DealContacts)[`"']?\s+does not exist/i;

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (!error || typeof error !== "object") {
    return "";
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function hasDealsTableMeta(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    typeof error.meta !== "object" ||
    !error.meta
  ) {
    return false;
  }

  const table = (error.meta as { table?: unknown }).table;
  return typeof table === "string" && DEALS_TABLE_PATTERN.test(table);
}

export function isDealsSchemaMissingError(error: unknown): boolean {
  const code = extractErrorCode(error);
  const message = extractErrorMessage(error);

  if (code === "P2021") {
    return hasDealsTableMeta(error) || DEALS_TABLE_PATTERN.test(message);
  }

  return DEALS_TABLE_PATTERN.test(message);
}

export function createDealsSchemaMissingPayload(): DealsSchemaMissingPayload {
  return {
    code: DEALS_SCHEMA_MISSING_CODE,
    error: DEALS_SCHEMA_MISSING_MESSAGE,
  };
}

export function toDealsErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  if (isDealsSchemaMissingError(error)) {
    return NextResponse.json(createDealsSchemaMissingPayload(), { status: 503 });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 },
  );
}
