import "dotenv/config";
import {
  IntegrationProvider,
  Prisma,
  PrismaClient,
  WorkflowScope,
  WorkflowStatus,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";
import { normalizeWorkflowGraph, graphToPrismaJson } from "../src/lib/automations/graph";
import { AUTOMATION_TEMPLATES } from "../src/lib/automations/templates";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const CODA_IMPORT_DATA_PATH = path.join("/tmp", "coda_import_data.json");

// ── Coda CompanyPriorities (fetched inline, hardcoded here) ──
const COMPANY_PRIORITIES = [
  {
    name: "Aquisition",
    priority: 5,
    accountable: ["kyle@arda.cards"],
    responsible: [
      "uriel@arda.cards",
      "mat@arda.cards",
      "kyle@arda.cards",
      "madi@arda.cards",
      "allison@arda.cards",
    ],
  },
  {
    name: "Retention",
    priority: 4,
    accountable: ["mat@arda.cards"],
    responsible: ["uriel@arda.cards", "kyle@arda.cards"],
  },
  {
    name: "Expansion",
    priority: 5,
    accountable: ["mat@arda.cards"],
    responsible: ["kyle@arda.cards", "uriel@arda.cards"],
  },
  {
    name: "Arda Core",
    priority: 5,
    accountable: ["miguel@arda.cards"],
    responsible: [
      "mat@arda.cards",
      "kyle@arda.cards",
      "miguel@arda.cards",
      "denis@arda.cards",
      "darren@arda.cards",
    ],
  },
  {
    name: "Company Scale",
    priority: 2,
    accountable: ["uriel@arda.cards"],
    responsible: ["mat@arda.cards", "kyle@arda.cards", "miguel@arda.cards"],
  },
  {
    name: "Existence",
    priority: 1,
    accountable: [],
    responsible: [],
  },
];

// ── Helpers ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSlateText(obj: any): string | null {
  // Handle Slate JSON object (already parsed)
  if (obj?.root?.children) {
    return obj.root.children
      .map((line: { children?: { text?: string }[] }) =>
        line.children?.map((c) => c.text || "").join("") || ""
      )
      .join("\n")
      .trim() || null;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPlainString(val: any): string | null {
  if (val == null) return null;
  // If it's already a string, try parsing as Python-repr Slate JSON
  if (typeof val === "string") {
    if (!val.trim()) return null;
    try {
      const cleaned = val
        .replace(/'/g, '"')
        .replace(/None/g, "null")
        .replace(/True/g, "true")
        .replace(/False/g, "false");
      const parsed = JSON.parse(cleaned);
      const text = extractSlateText(parsed);
      if (text) return text;
    } catch {
      // Not parseable, return as-is
    }
    return val;
  }
  // If it's an object, try Slate extraction
  if (typeof val === "object") {
    const text = extractSlateText(val);
    if (text) return text;
    // If it's a Coda ref object with a name
    if (val.name && typeof val.name === "string") return val.name;
    return JSON.stringify(val);
  }
  return String(val);
}

function parseDate(dateStr: string | null): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d;
}

function normalizeTemplateProviders(providers: string[]): IntegrationProvider[] {
  const known = new Set(Object.values(IntegrationProvider));
  return providers.filter(
    (provider): provider is IntegrationProvider =>
      known.has(provider as IntegrationProvider)
  );
}

async function getSupportedIntegrationProviders(): Promise<Set<IntegrationProvider>> {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    select unnest(enum_range(null::"IntegrationProvider"))::text as value
  `;

  const known = new Set(Object.values(IntegrationProvider));
  return new Set(
    rows
      .map((row) => row.value)
      .filter(
        (provider): provider is IntegrationProvider =>
          known.has(provider as IntegrationProvider)
      )
  );
}

function resolveEmails(
  userMap: Map<string, string>,
  emails: readonly string[]
): { id: string }[] {
  return emails
    .map((email) => userMap.get(email))
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id }));
}

function formatUserName(email: string): string {
  const [localPart] = email.split("@");
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function hydrateExistingUsers(userMap: Map<string, string>): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });

  for (const user of users) {
    userMap.set(user.email, user.id);
  }
}

async function ensureUsers(
  userMap: Map<string, string>,
  emails: readonly string[]
): Promise<void> {
  const uniqueEmails = new Set(emails);

  for (const email of uniqueEmails) {
    if (userMap.has(email)) {
      continue;
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: formatUserName(email),
        role: "member",
      },
      select: { id: true, email: true },
    });

    userMap.set(user.email, user.id);
  }
}

async function upsertCompanyPriority(
  userMap: Map<string, string>,
  priorityMap: Map<string, string>,
  companyPriority: (typeof COMPANY_PRIORITIES)[number]
): Promise<void> {
  const existing = await prisma.companyPriority.findFirst({
    where: { name: companyPriority.name },
    select: { id: true, name: true },
  });

  const priority = existing
    ? await prisma.companyPriority.update({
        where: { id: existing.id },
        data: {
          priority: companyPriority.priority,
          responsible: {
            set: resolveEmails(userMap, companyPriority.responsible),
          },
          accountable: {
            set: resolveEmails(userMap, companyPriority.accountable),
          },
        },
        select: { id: true, name: true },
      })
    : await prisma.companyPriority.create({
        data: {
          name: companyPriority.name,
          priority: companyPriority.priority,
          responsible: {
            connect: resolveEmails(userMap, companyPriority.responsible),
          },
          accountable: {
            connect: resolveEmails(userMap, companyPriority.accountable),
          },
        },
        select: { id: true, name: true },
      });

  priorityMap.set(priority.name, priority.id);
}

async function seedOperatorWorkflows(userMap: Map<string, string>): Promise<number> {
  const ownerId = userMap.get("kyle@arda.cards") ?? userMap.values().next().value;
  if (!ownerId) {
    console.log("  ! Skipping operator workflow seed because no owner user exists");
    return 0;
  }

  const supportedProviders = await getSupportedIntegrationProviders();
  const operatorTemplates = AUTOMATION_TEMPLATES.filter(
    (template) => template.operatorKey
  );

  let seededCount = 0;

  for (const template of operatorTemplates) {
    const graph = normalizeWorkflowGraph(template.graph);
    const providers = normalizeTemplateProviders(template.providers).filter((provider) =>
      supportedProviders.has(provider)
    );
    const graphJson = graphToPrismaJson(graph) as Prisma.InputJsonValue;
    const rolePolicy = {
      editRoles: ["admin"],
      approveRoles: ["admin", "member"],
    };

    const skippedProviders = template.providers.filter(
      (provider) => !providers.includes(provider as IntegrationProvider)
    );
    if (skippedProviders.length > 0) {
      console.log(
        `  ! ${template.name}: skipping unsupported providers ${skippedProviders.join(", ")}`
      );
    }

    const existing = await prisma.workflowDefinition.findFirst({
      where: {
        operatorKey: template.operatorKey,
        isSystemManaged: true,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.workflowDefinition.create({
        data: {
          ownerId,
          name: template.name,
          description: template.description,
          operatorKey: template.operatorKey,
          scope: WorkflowScope.SHARED,
          status: WorkflowStatus.ACTIVE,
          providers,
          rolePolicy,
          isSystemManaged: true,
          graph: graphJson,
          lastPublishedAt: new Date(),
          nodes: {
            create: graph.nodes.map((node) => ({
              nodeKey: node.key,
              type: node.type,
              label: node.label,
              config: (node.config ?? {}) as Prisma.InputJsonValue,
              positionX: node.positionX ?? 0,
              positionY: node.positionY ?? 0,
            })),
          },
          edges: {
            create: graph.edges.map((edge) => ({
              sourceNodeKey: edge.source,
              targetNodeKey: edge.target,
              conditionLabel: edge.conditionLabel,
              conditionExpr: edge.conditionExpr as
                | Prisma.InputJsonValue
                | undefined,
              priority: edge.priority ?? 0,
            })),
          },
        },
      });
      seededCount += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.workflowDefinition.update({
        where: { id: existing.id },
        data: {
          ownerId,
          name: template.name,
          description: template.description,
          operatorKey: template.operatorKey,
          scope: WorkflowScope.SHARED,
          status: WorkflowStatus.ACTIVE,
          providers,
          rolePolicy,
          isSystemManaged: true,
          graph: graphJson,
          lastPublishedAt: new Date(),
          lastError: null,
        },
      }),
      prisma.workflowEdge.deleteMany({
        where: { workflowId: existing.id },
      }),
      prisma.workflowNode.deleteMany({
        where: { workflowId: existing.id },
      }),
      prisma.workflowNode.createMany({
        data: graph.nodes.map((node) => ({
          workflowId: existing.id,
          nodeKey: node.key,
          type: node.type,
          label: node.label,
          config: (node.config ?? {}) as Prisma.InputJsonValue,
          positionX: node.positionX ?? 0,
          positionY: node.positionY ?? 0,
        })),
      }),
      prisma.workflowEdge.createMany({
        data: graph.edges.map((edge) => ({
          workflowId: existing.id,
          sourceNodeKey: edge.source,
          targetNodeKey: edge.target,
          conditionLabel: edge.conditionLabel ?? null,
          conditionExpr: edge.conditionExpr as
            | Prisma.InputJsonValue
            | undefined,
          priority: edge.priority ?? 0,
        })),
      }),
    ]);

    seededCount += 1;
  }

  return seededCount;
}

async function main() {
  console.log("Starting Coda → The Mother Node import...\n");

  const userMap = new Map<string, string>(); // email → id
  const priorityMap = new Map<string, string>(); // name → id
  const dataPath = CODA_IMPORT_DATA_PATH;
  const hasCodaImportData = fs.existsSync(dataPath);

  if (!hasCodaImportData) {
    console.log(
      `Coda import data not found at ${dataPath}; seeding GTM operators without legacy Coda data.\n`
    );

    await hydrateExistingUsers(userMap);
    await ensureUsers(userMap, [
      ...COMPANY_PRIORITIES.flatMap((priority) => [
        ...priority.accountable,
        ...priority.responsible,
      ]),
    ]);
    console.log(`  ✓ ${userMap.size} users available for operator seeding\n`);

    for (const companyPriority of COMPANY_PRIORITIES) {
      await upsertCompanyPriority(userMap, priorityMap, companyPriority);
    }
    console.log(`  ✓ ${priorityMap.size} company priorities synced\n`);
  } else {
    const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    console.log(`Creating ${raw.people.length} users...`);
    for (const person of raw.people) {
      const user = await prisma.user.upsert({
        where: { email: person.email },
        update: { name: person.name },
        create: {
          email: person.email,
          name: person.name,
          role: "member",
        },
      });
      userMap.set(person.email, user.id);
    }
    console.log(`  ✓ ${userMap.size} users created/updated\n`);

    console.log(`Creating ${COMPANY_PRIORITIES.length} company priorities...`);
    for (const cp of COMPANY_PRIORITIES) {
      await upsertCompanyPriority(userMap, priorityMap, cp);
    }
    console.log(`  ✓ ${priorityMap.size} company priorities synced\n`);
    console.log("  ! Legacy Coda operating-plan data ignored; Imladris uses provider raw and canonical metric tables.\n");
  }

  // ── 8. SEED SYSTEM-MANAGED GTM OPERATOR WORKFLOWS ──
  console.log("Seeding GTM operator workflows...");
  const operatorWorkflowCount = await seedOperatorWorkflows(userMap);
  console.log(`  ✓ ${operatorWorkflowCount} GTM operator workflows synced\n`);

  // ── Summary ──
  const counts = {
    users: await prisma.user.count(),
    priorities: await prisma.companyPriority.count(),
    workflows: await prisma.workflowDefinition.count(),
  };
  console.log("=== IMPORT COMPLETE ===");
  console.log(JSON.stringify(counts, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Seed error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
