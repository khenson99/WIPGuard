import { IntegrationProvider } from "@/generated/prisma/client";
import type { PrismaClientType } from "@/lib/prisma";

export type ExpenseDashboardRange = "30d" | "90d" | "180d";

export interface ExpenseDashboardContext {
  userId: string | null;
  organizationId: string | null;
}

export interface ExpenseDashboardTransaction {
  date: string;
  vendor: string;
  amount: number;
  description: string;
  category: string;
}

export interface ExpenseDashboardChartSeries {
  operatingInflows: number[];
  operatingOutflows: number[];
  grossBurn: number[];
  netBurn: number[];
  runwayCash?: number;
}

export interface ExpenseDashboardData {
  months: string[];
  categories: string[];
  categoryMonthly: Record<string, Record<string, number>>;
  categoryTotals: Record<string, number>;
  vendorMonthly: Record<string, Record<string, number>>;
  vendorTotals: Record<string, number>;
  vendorCategory: Record<string, string>;
  txnIndex: Record<string, ExpenseDashboardTransaction[]>;
  chartSeries: ExpenseDashboardChartSeries;
  refreshedAt: string;
}

interface RawSourceRecordRow {
  provider: IntegrationProvider | string;
  objectType: string;
  externalId: string;
  scopeKey?: string | null;
  occurredAt: Date | string | null;
  sourceCreatedAt?: Date | string | null;
  sourceUpdatedAt?: Date | string | null;
  payload: unknown;
  userId?: string | null;
  organizationId?: string | null;
}

export interface ExpenseDashboardTransactionInput {
  postedAt?: string | null;
  amount?: number | string | null;
  kind?: string | null;
  mercuryCategory?: string | null;
  description?: string | null;
  counterpartyName?: string | null;
  bankDescription?: string | null;
  note?: string | null;
}

const RANGE_DAYS: Record<ExpenseDashboardRange, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
};

const MERCURY_TRANSACTION_OBJECT_TYPES = [
  "transaction",
  "Transaction",
  "TRANSACTION",
  "bank_transaction",
  "BankTransaction",
  "bankTransaction",
  "BANK_TRANSACTION",
];

const MERCURY_BALANCE_OBJECT_TYPES = [
  "account_balance",
  "AccountBalance",
  "accountBalance",
  "ACCOUNT_BALANCE",
  "balance",
  "Balance",
  "BALANCE",
];

const MERCURY_EXPENSE_OBJECT_TYPES = [
  ...MERCURY_TRANSACTION_OBJECT_TYPES,
  ...MERCURY_BALANCE_OBJECT_TYPES,
];

const VENDOR_CATEGORY_OVERRIDES: Record<string, string> = {
  "mercury credit": "transfer",
  "ewallet - divvyp": "transfer",
  "amex epayment": "transfer",
  "teamswell": "payroll",
  "ssbtrustops": "payroll",
  "guideline retire": "payroll",
  "amazon web services": "cloud",
  "aws": "cloud",
  "apple": "hardware",
  "best buy": "hardware",
  "uline": "hardware",
  "terraslate paper": "hardware",
  "xometry": "hardware",
  "mcmaster-carr": "hardware",
  "bambu lab": "hardware",
  "3d printing tech": "hardware",
  "dickies": "hardware",
  "newegg": "hardware",
  "nike": "hardware",
  "temu": "hardware",
  "the home depot": "hardware",
  "rei": "hardware",
  "send cut send": "hardware",
  "lowe's": "hardware",
  "w. w. grainger": "hardware",
  "hypershop": "hardware",
  "hurst green plastics l": "hardware",
  "labelcity": "hardware",
  "elliott equipment company": "refund",
  "amt - the association for manufacturing technology": "conferences",
  "association for advancing automation": "conferences",
  "vessel awakenings": "conferences",
  "iqpc": "conferences",
  "easybadges": "conferences",
  "society of manufacturing engineers": "conferences",
  "mhi": "conferences",
  "material handling indu": "conferences",
  "pc/nametag": "conferences",
  "sponsors": "marketing",
  "buffer": "marketing",
  "ninja transfers dtf": "marketing",
  "ljs mark": "marketing",
  "growthhit": "marketing",
  "squared away": "contractors",
  "bil*crescere inc": "contractors",
  "meridian technologies": "contractors",
  "new england lean consulting": "contractors",
  "taskrabbit": "contractors",
  "elisha eisen": "owner_reimbursement",
  "madison perkins": "owner_reimbursement",
  "noah klein": "travel",
  "fairfield inn by marriott": "travel",
  "springhill suites by marriott": "travel",
  "marriott international": "travel",
  "tru by hilton": "travel",
  "residence inn": "travel",
  "clearwater casino-ticket": "travel",
  "shell": "travel",
  "washington state ferries": "travel",
  "amtrak": "travel",
  "holiday inn": "travel",
  "lyft": "travel",
  "carta": "finance",
  "source group": "finance",
  "cocountant": "finance",
  "commercial collection corporation of ny": "finance",
  "travelers insurance": "finance",
  "pillsbury winthrop shaw pittman llp": "finance",
  "pillsbury": "finance",
  "alliant insurance": "finance",
  "austere manufacturing": "rent",
  "public storage": "rent",
  "the brass kraken": "food",
  "occhi belli": "food",
  "safeway": "food",
  "costco": "food",
  "the showbox": "food",
  "boardroom spirits": "food",
  "sprouts farmers market": "food",
  "hudson news": "food",
  "gumroad": "software",
  "linktree": "software",
  "journalclub.io": "software",
  "simple mobile": "software",
  "cursor, ai power": "software",
  "farmloop app": "software",
  "sp globlinker": "software",
  "freightquote": "shipping",
  "kingston mail and print": "shipping",
  "motel 6": "travel",
  "sunoco": "travel",
  "76": "travel",
  "phillips 66": "travel",
  "impark": "travel",
  "ace parking management": "travel",
  "united sf parking": "travel",
  "bp": "travel",
  "chevron": "travel",
  "georgia world congress center": "conferences",
  "harvard bus education": "conferences",
  "berkshire farms market": "food",
  "global exp spec": "shipping",
};

const NON_EXPENSE_CATEGORIES = new Set(["transfer", "refund"]);
const PAYROLL_PAYMENT_OVERRIDES = new Map([
  ["elisha eisen", 6300],
  ["madison perkins", 5600],
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeVendorKey(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().replace(/[$,\s]/g, "");
    const parsed = Number(/^\(.+\)$/.test(normalized) ? `-${normalized.slice(1, -1)}` : normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateFrom(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const parsed = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const timestamp = Number(normalized);
      if (Number.isFinite(timestamp) && timestamp > 0) {
        const parsed = new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function monthKeyFromDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) return value.slice(0, 7);
  return dateFrom(value)?.toISOString().slice(0, 7) ?? null;
}

function dayKeyFromDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return dateFrom(value)?.toISOString().slice(0, 10) ?? null;
}

function isPayrollPaymentOverride(tx: ExpenseDashboardTransactionInput, vendor: string): boolean {
  const expectedAmount = PAYROLL_PAYMENT_OVERRIDES.get(vendor);
  if (!expectedAmount) return false;
  const amount = Math.abs(numberFrom(tx.amount) ?? 0);
  return Math.abs(amount - expectedAmount) < 0.01;
}

function classifyBusinessExpenseText(text: string): string | null {
  if (/reddit inc ads|google \*?ads|facebk|meta ads|linkedin ads|advertising|ad spend|marketing/.test(text)) return "marketing";
  if (/coda|openai|anthropic|github|vercel|cloudflare|notion|slack|linear|figma|software subscription|saas/.test(text)) return "software";
  if (/aws|amazon web services|gcp|azure|hosting|compute|cloud/.test(text)) return "cloud";
  if (/delaware corporation and tax|return payment fee|interest charge|returned autopay|insurance|bank fee|legal|accounting|bookkeeping|pillsbury|alliant|next insur|stripe|\btax\b|\btaxes\b/.test(text)) return "finance";
  if (/rideshare|taxi|lyft|uber|delta|alaska airlines|american airlines|united airlines|southwest airlines|\bflight\b|airline|hertz|national|car rental|marriott|hilton|hotel|airbnb|tsa precheck|kissandfly|ferry|amtrak|travel/.test(text)) return "travel";
  if (/amazon business|amazon\.com|apple|staples|uline|newegg|electronics|clothing|nike|laminator|supplies|quickstart kit|welcome kit|hardware|equipment/.test(text)) return "hardware";
  if (/wework|office|rent|lease|storage/.test(text)) return "rent";
  if (/chipotle|coffee|restaurant|lunch|meal|burrito|starbucks|taqueria|pho |safeway|costco|alcoholandbars|showbox|food/.test(text)) return "food";
  if (/offsite|conference|summit|event|material handling|association|society|sponsor|badge/.test(text)) return "conferences";
  if (/freight|shipping|postage|global exp/.test(text)) return "shipping";
  return null;
}

function inferExpenseReimbursementCategory(tx: ExpenseDashboardTransactionInput): string | null {
  const reimbursementText = [tx.description, tx.bankDescription].filter(Boolean).join(" ").toLowerCase();
  if (!/reimbursement/.test(reimbursementText)) return null;

  return classifyBusinessExpenseText([
    tx.description,
    tx.note,
    tx.bankDescription,
    tx.mercuryCategory,
  ].filter(Boolean).join(" ").toLowerCase());
}

export function normalizeExpenseDashboardCategory(tx: ExpenseDashboardTransactionInput): string {
  const vendorCandidates = [
    tx.counterpartyName,
    tx.description,
    tx.bankDescription,
    tx.note,
  ].map(normalizeVendorKey).filter(Boolean);

  for (const vendor of vendorCandidates) {
    if (isPayrollPaymentOverride(tx, vendor)) return "payroll";
  }

  const reimbursementCategory = inferExpenseReimbursementCategory(tx);
  if (reimbursementCategory) return reimbursementCategory;

  for (const vendor of vendorCandidates) {
    if (VENDOR_CATEGORY_OVERRIDES[vendor]) return VENDOR_CATEGORY_OVERRIDES[vendor];
  }

  const text = [
    tx.mercuryCategory,
    tx.counterpartyName,
    tx.description,
    tx.bankDescription,
    tx.note,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/gusto|payroll|salary|benefit|thatch/.test(text)) return "payroll";
  const textCategory = classifyBusinessExpenseText(text);
  if (textCategory) return textCategory;
  if (/growthhit|marketing|advertising|ad spend|google ads|meta ads|linkedin ads|reddit ads/.test(text)) return "marketing";
  if (/contractor|consultant|tenpoint|freelance|advisor/.test(text)) return "contractors";
  if (/rent|office|lease|storage/.test(text)) return "rent";
  if (/travel|hotel|uber|airbnb|flight|airline|embassy|marriott|hilton|inn|ferry|amtrak|shell/.test(text)) return "travel";
  if (/food|meal|restaurant|coffee|eats|noodle|brewing|pastries|gopuff|safeway/.test(text)) return "food";
  if (/cloud|aws|amazon web services|gcp|azure|hosting|compute/.test(text)) return "cloud";
  if (/hardware|equipment|amazon|allied|elliott|mcmaster|grainger|home depot|lowe|xometry|bambu|printing|uline/.test(text)) return "hardware";
  if (/software|anthropic|openai|saas|github|vercel|cloudflare|notion|slack|linear|figma/.test(text)) return "software";
  if (/legal|insurance|bank fee|\btax\b|\btaxes\b|accounting|bookkeeping|pillsbury|alliant|next insur|stripe/.test(text)) return "finance";
  if (/reimbursement|expense reimbursement/.test(text)) return "owner_reimbursement";
  if (/conference|event|summit|association|society|sponsor|badge/.test(text)) return "conferences";
  if (/freight|shipping|postage|global exp/.test(text)) return "shipping";
  return "uncategorized";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMoneyMapValues(map: Record<string, number | Record<string, number>>) {
  Object.keys(map).forEach((key) => {
    const value = map[key];
    if (value && typeof value === "object") {
      Object.keys(value).forEach((innerKey) => {
        value[innerKey] = roundMoney(value[innerKey]);
      });
    } else if (typeof value === "number") {
      map[key] = roundMoney(value);
    }
  });
}

function addAmount(map: Record<string, Record<string, number>>, firstKey: string, secondKey: string, amount: number) {
  map[firstKey] ??= {};
  map[firstKey][secondKey] = (map[firstKey][secondKey] ?? 0) + amount;
}

function scopeKeyForContext(context: ExpenseDashboardContext): string {
  if (context.organizationId) return `org:${context.organizationId}`;
  if (context.userId) return `user:${context.userId}`;
  return "global";
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeContext(context: ExpenseDashboardContext): ExpenseDashboardContext {
  return {
    userId: normalizeTenantId(context.userId),
    organizationId: normalizeTenantId(context.organizationId),
  };
}

function rawRecordScopeWhere(context: ExpenseDashboardContext) {
  if (context.organizationId) {
    const organizationScopeKey = scopeKeyForContext({ userId: null, organizationId: context.organizationId });
    return {
      OR: [
        { scopeKey: organizationScopeKey, organizationId: context.organizationId },
        ...(context.userId
          ? [
              { scopeKey: organizationScopeKey, userId: context.userId },
              {
                scopeKey: scopeKeyForContext({ userId: context.userId, organizationId: null }),
                userId: context.userId,
              },
            ]
          : []),
        { scopeKey: "global", userId: null, organizationId: null },
      ],
    };
  }

  if (context.userId) {
    return {
      OR: [
        {
          scopeKey: scopeKeyForContext(context),
          userId: context.userId,
        },
        { scopeKey: "global", userId: null, organizationId: null },
      ],
    };
  }

  return { OR: [{ scopeKey: "global", userId: null, organizationId: null }] };
}

function rawRecordMatchesContext(record: RawSourceRecordRow, context: ExpenseDashboardContext): boolean {
  const rowUserId = record.userId ?? null;
  const rowOrganizationId = record.organizationId ?? null;
  const scopeKey = record.scopeKey ?? "";

  if (context.organizationId) {
    const organizationScopeKey = scopeKeyForContext({ userId: null, organizationId: context.organizationId });
    if (rowOrganizationId === context.organizationId && scopeKey === organizationScopeKey) return true;
    if (context.userId && rowUserId === context.userId && scopeKey === organizationScopeKey) return true;
    if (
      context.userId &&
      rowUserId === context.userId &&
      rowOrganizationId === null &&
      scopeKey === scopeKeyForContext({ userId: context.userId, organizationId: null })
    ) {
      return true;
    }
    return rowUserId === null && rowOrganizationId === null && scopeKey === "global";
  }

  if (context.userId) {
    if (rowUserId === context.userId && rowOrganizationId === null && scopeKey === scopeKeyForContext(context)) {
      return true;
    }
    return rowUserId === null && rowOrganizationId === null && scopeKey === "global";
  }

  return rowUserId === null && rowOrganizationId === null && scopeKey === "global";
}

function normalizeObjectType(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase()
    : "";
}

function recordIsObjectType(record: RawSourceRecordRow, ...objectTypes: string[]): boolean {
  return objectTypes.includes(normalizeObjectType(record.objectType));
}

function dateRangeForPreset(preset: ExpenseDashboardRange, now: Date): { fromDate: Date; toDate: Date } {
  const toDate = new Date(now);
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate.getTime() - (RANGE_DAYS[preset] - 1) * 24 * 60 * 60 * 1000);
  fromDate.setUTCHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

function recordTimestamp(record: RawSourceRecordRow): Date | null {
  return dateFrom(record.occurredAt) ?? dateFrom(record.sourceUpdatedAt) ?? dateFrom(record.sourceCreatedAt);
}

function transactionFromRecord(record: RawSourceRecordRow): ExpenseDashboardTransactionInput {
  const payload = asRecord(record.payload);
  return {
    postedAt: String(payload.postedAt ?? payload.posted_at ?? record.occurredAt ?? ""),
    amount: payload.amount as number | string | null,
    kind: typeof payload.kind === "string" ? payload.kind : null,
    mercuryCategory: typeof payload.mercuryCategory === "string" ? payload.mercuryCategory : null,
    description: typeof payload.description === "string" ? payload.description : null,
    counterpartyName: typeof payload.counterpartyName === "string" ? payload.counterpartyName : null,
    bankDescription: typeof payload.bankDescription === "string" ? payload.bankDescription : null,
    note: typeof payload.note === "string" ? payload.note : null,
  };
}

function vendorFromTransaction(tx: ExpenseDashboardTransactionInput): string {
  return tx.counterpartyName || tx.description || tx.bankDescription || "Unknown vendor";
}

function latestCashBalance(records: RawSourceRecordRow[], asOf: Date): number | undefined {
  const balances = records
    .filter((record) => recordIsObjectType(record, "account_balance", "balance"))
    .map((record) => ({
      amount: numberFrom(asRecord(record.payload).balance ?? asRecord(record.payload).currentBalance),
      timestamp: recordTimestamp(record)?.getTime() ?? 0,
    }))
    .filter(
      (entry): entry is { amount: number; timestamp: number } =>
        typeof entry.amount === "number" && entry.timestamp <= asOf.getTime(),
    );

  if (balances.length === 0) return undefined;
  const latestTimestamp = Math.max(...balances.map((entry) => entry.timestamp));
  return roundMoney(
    balances
      .filter((entry) => entry.timestamp === latestTimestamp)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function createEmptyExpenseDashboardData(refreshedAt = new Date().toISOString()): ExpenseDashboardData {
  return {
    months: [],
    categories: [],
    categoryMonthly: {},
    categoryTotals: {},
    vendorMonthly: {},
    vendorTotals: {},
    vendorCategory: {},
    txnIndex: {},
    chartSeries: {
      operatingInflows: [],
      operatingOutflows: [],
      grossBurn: [],
      netBurn: [],
    },
    refreshedAt,
  };
}

export async function buildExpenseDashboard(input: {
  prisma: Pick<PrismaClientType, "imladrisRawSourceRecord">;
  context: ExpenseDashboardContext;
  range: ExpenseDashboardRange;
  now?: Date;
}): Promise<ExpenseDashboardData> {
  const now = input.now ?? new Date();
  const context = normalizeContext(input.context);
  const { fromDate, toDate } = dateRangeForPreset(input.range, now);
  const records = ((await input.prisma.imladrisRawSourceRecord.findMany({
    where: {
      provider: IntegrationProvider.MERCURY,
      objectType: { in: MERCURY_EXPENSE_OBJECT_TYPES },
      ...rawRecordScopeWhere(context),
      AND: [
        {
          OR: [
            { occurredAt: { gte: fromDate, lte: toDate } },
            { sourceUpdatedAt: { gte: fromDate, lte: toDate } },
            { sourceCreatedAt: { gte: fromDate, lte: toDate } },
            { objectType: { in: MERCURY_BALANCE_OBJECT_TYPES } },
          ],
        },
      ],
    },
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }, { sourceCreatedAt: "asc" }],
  })) as RawSourceRecordRow[]).filter((record) => rawRecordMatchesContext(record, context));

  if (records.length === 0) return createEmptyExpenseDashboardData(now.toISOString());

  const monthsSet = new Set<string>();
  const categorySet = new Set<string>();
  const categoryMonthly: Record<string, Record<string, number>> = {};
  const categoryTotals: Record<string, number> = {};
  const vendorMonthly: Record<string, Record<string, number>> = {};
  const vendorTotals: Record<string, number> = {};
  const vendorCategory: Record<string, string> = {};
  const txnIndex: Record<string, ExpenseDashboardTransaction[]> = {};
  const monthlyInflows: Record<string, number> = {};

  for (const record of records.filter((entry) => recordIsObjectType(entry, "transaction", "bank_transaction"))) {
    const tx = transactionFromRecord(record);
    const amount = numberFrom(tx.amount) ?? 0;
    const month = monthKeyFromDate(tx.postedAt) ?? monthKeyFromDate(record.occurredAt);
    if (!month || amount === 0) continue;

    monthsSet.add(month);
    if (amount > 0) {
      monthlyInflows[month] = (monthlyInflows[month] ?? 0) + amount;
      continue;
    }

    const absoluteAmount = Math.abs(amount);
    const category = normalizeExpenseDashboardCategory(tx);
    if (NON_EXPENSE_CATEGORIES.has(category)) continue;

    const vendor = vendorFromTransaction(tx);
    const key = `${category}|${month}`;
    categorySet.add(category);
    addAmount(categoryMonthly, category, month, absoluteAmount);
    categoryTotals[category] = (categoryTotals[category] ?? 0) + absoluteAmount;
    addAmount(vendorMonthly, vendor, month, absoluteAmount);
    vendorTotals[vendor] = (vendorTotals[vendor] ?? 0) + absoluteAmount;
    vendorCategory[vendor] = category;
    txnIndex[key] ??= [];
    txnIndex[key].push({
      date: dayKeyFromDate(tx.postedAt) ?? dayKeyFromDate(record.occurredAt) ?? "",
      vendor,
      amount: roundMoney(absoluteAmount),
      description: tx.description || tx.bankDescription || tx.note || "",
      category,
    });
  }

  const months = Array.from(monthsSet).sort();
  const categories = Array.from(categorySet).sort();
  if (months.length === 0 || categories.length === 0) {
    const empty = createEmptyExpenseDashboardData(now.toISOString());
    empty.chartSeries.runwayCash = latestCashBalance(records, now);
    return empty;
  }

  for (const category of categories) {
    categoryMonthly[category] ??= {};
    for (const month of months) {
      categoryMonthly[category][month] ??= 0;
    }
  }
  for (const vendor of Object.keys(vendorMonthly)) {
    for (const month of months) {
      vendorMonthly[vendor][month] ??= 0;
    }
  }

  [categoryMonthly, categoryTotals, vendorMonthly, vendorTotals, monthlyInflows].forEach((map) =>
    roundMoneyMapValues(map as Record<string, number | Record<string, number>>),
  );

  const operatingOutflows = months.map((month) =>
    roundMoney(categories.reduce((sum, category) => sum + (categoryMonthly[category]?.[month] ?? 0), 0)),
  );
  const operatingInflows = months.map((month) => roundMoney(monthlyInflows[month] ?? 0));
  const netBurn = months.map((_, index) => roundMoney(operatingOutflows[index] - operatingInflows[index]));
  const runwayCash = latestCashBalance(records, now);

  return {
    months,
    categories,
    categoryMonthly,
    categoryTotals,
    vendorMonthly,
    vendorTotals,
    vendorCategory,
    txnIndex,
    chartSeries: {
      operatingInflows,
      operatingOutflows,
      grossBurn: operatingOutflows,
      netBurn,
      ...(runwayCash === undefined ? {} : { runwayCash }),
    },
    refreshedAt: now.toISOString(),
  };
}
