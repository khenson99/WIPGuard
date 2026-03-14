export const DEALS_SCHEMA_MISSING_CODE = "DEALS_SCHEMA_MISSING" as const;
export const DEALS_SCHEMA_MISSING_MESSAGE = "Deals requires local database setup." as const;

export interface DealsSchemaMissingPayload {
  code: typeof DEALS_SCHEMA_MISSING_CODE;
  error: string;
}

export function isDealsSchemaMissingPayload(value: unknown): value is DealsSchemaMissingPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<DealsSchemaMissingPayload>;
  return (
    payload.code === DEALS_SCHEMA_MISSING_CODE &&
    typeof payload.error === "string" &&
    payload.error.trim().length > 0
  );
}
