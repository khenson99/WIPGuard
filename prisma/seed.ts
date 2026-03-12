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
import {
  ARDA_GTM_OPERATOR_BOARD_PROJECT_DESCRIPTION,
  ARDA_GTM_OPERATOR_BOARD_PROJECT_NAME,
  ARDA_GTM_OPERATOR_BOARD_TASKS,
} from "../src/lib/automations/ralph-board";
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

// ── Priority → Project mapping from Coda ──
const PRIORITY_PROJECT_MAP: Record<string, string[]> = {
  Aquisition: [
    "Conference Prep",
    "Customer Onboarding ",
    "Kyle's BD Pipeline ",
    "Direct Outbound ",
    "Trade Show Program",
    "Website Revamp",
    "Marketing, Content",
    "ABM Strategy",
    "Customer Stories",
    "Digital Advertising",
    "Modex Prep",
    "Channel Partner Program",
    "RFP Automation & Support",
    "Sales Enablement & Demos",
    "Industry Outreach & Networking",
    "Industry Publications & Thought Leadership",
  ],
  Retention: [
    "NPS/Customer Feedback Loop",
    "Churn Prevention Workflows",
    "Customer Health Dashboard",
  ],
  Expansion: [
    "Arda Marketplace",
    "Pricing Strategy / Packaging",
  ],
  "Arda Core": [
    "Project The Mother Node",
    "Feature: Webhooks & Integrations",
    "Feature: Automations & Alerts",
    "Feature: Smart Analytics Engine",
    "Feature: Multi-Tenant Architecture",
    "Feature: Mobile Experience",
    "Infrastructure & DevOps",
    "Security & Compliance",
    "QA & Testing Framework",
    "Feature: AI Work Assistant",
    "Arda Marketplace",
  ],
  "Company Scale": [
    "SOPs, Processes",
    "Hiring",
  ],
};

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

async function seedRalphBoardProject(input: {
  userMap: Map<string, string>;
  priorityMap: Map<string, string>;
}): Promise<{ projectId: string | null; seededTasks: number }> {
  const ownerId =
    input.userMap.get("kyle@arda.cards") ?? input.userMap.values().next().value;
  if (!ownerId) {
    console.log("  ! Skipping Ralph board project seed because no owner user exists");
    return { projectId: null, seededTasks: 0 };
  }

  const responsibleIds = ["kyle@arda.cards", "mat@arda.cards"]
    .map((email) => input.userMap.get(email))
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id }));

  const accountableIds = [ownerId].map((id) => ({ id }));

  const existing = await prisma.project.findFirst({
    where: { name: ARDA_GTM_OPERATOR_BOARD_PROJECT_NAME },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const project = existing
    ? await prisma.project.update({
        where: { id: existing.id },
        data: {
          description: ARDA_GTM_OPERATOR_BOARD_PROJECT_DESCRIPTION,
          status: "ACTIVE",
          projectType: "PERPETUAL",
          businessFunction: "GTM Operations",
          companyPriorityId: input.priorityMap.get("Company Scale") ?? null,
          responsible: { set: responsibleIds },
          accountable: { set: accountableIds },
        },
        select: { id: true },
      })
    : await prisma.project.create({
        data: {
          name: ARDA_GTM_OPERATOR_BOARD_PROJECT_NAME,
          description: ARDA_GTM_OPERATOR_BOARD_PROJECT_DESCRIPTION,
          status: "ACTIVE",
          projectType: "PERPETUAL",
          businessFunction: "GTM Operations",
          companyPriorityId: input.priorityMap.get("Company Scale") ?? null,
          responsible: { connect: responsibleIds },
          accountable: { connect: accountableIds },
        },
        select: { id: true },
      });

  const existingTasks = await prisma.task.findMany({
    where: { projectId: project.id },
    select: { id: true, title: true, status: true, columnOrder: true },
  });

  const existingByTitle = new Map(existingTasks.map((task) => [task.title, task] as const));
  const nextColumnOrder = new Map<string, number>();

  for (const task of existingTasks) {
    const current = nextColumnOrder.get(task.status) ?? 0;
    nextColumnOrder.set(task.status, Math.max(current, task.columnOrder + 1));
  }

  let seededTasks = 0;

  for (const template of ARDA_GTM_OPERATOR_BOARD_TASKS) {
    const responsibleId = template.ownerEmail
      ? input.userMap.get(template.ownerEmail) ?? null
      : null;

    const metadata = {
      source: "seed",
      boardKey: "arda-gtm-operators",
      wave: template.wave,
      operatorKey: template.operatorKey ?? null,
    };

    const existingTask = existingByTitle.get(template.title);
    if (existingTask) {
      await prisma.task.update({
        where: { id: existingTask.id },
        data: {
          notes: template.notes,
          status: template.status,
          priority: template.priority,
          metadata,
          responsible: {
            set: responsibleId ? [{ id: responsibleId }] : [],
          },
          accountable: {
            set: accountableIds,
          },
        },
      });
      seededTasks += 1;
      continue;
    }

    const columnOrder = nextColumnOrder.get(template.status) ?? 0;
    nextColumnOrder.set(template.status, columnOrder + 1);

    await prisma.task.create({
      data: {
        title: template.title,
        notes: template.notes,
        status: template.status,
        priority: template.priority,
        projectId: project.id,
        columnOrder,
        metadata,
        responsible: {
          connect: responsibleId ? [{ id: responsibleId }] : [],
        },
        accountable: {
          connect: accountableIds,
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: template.status,
            changedBy: ownerId,
          },
        },
      },
    });
    seededTasks += 1;
  }

  return { projectId: project.id, seededTasks };
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
      ...ARDA_GTM_OPERATOR_BOARD_TASKS.flatMap((task) =>
        task.ownerEmail ? [task.ownerEmail] : []
      ),
    ]);
    console.log(`  ✓ ${userMap.size} users available for operator seeding\n`);

    for (const companyPriority of COMPANY_PRIORITIES) {
      await upsertCompanyPriority(userMap, priorityMap, companyPriority);
    }
    console.log(`  ✓ ${priorityMap.size} company priorities synced\n`);
  } else {
    const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    // ── 1. UPSERT USERS ──
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

    // Helper to resolve email list to user ID list
    const resolveUsers = (
      people: { name: string; email: string }[] | undefined
    ): { id: string }[] => {
      if (!people) return [];
      return people
        .map((p) => userMap.get(p.email))
        .filter((id): id is string => !!id)
        .map((id) => ({ id }));
    };

    // ── 2. CREATE SPRINTS ──
    console.log(`Creating ${raw.sprints.length} sprints...`);
    const sprintMap = new Map<string, string>(); // name → id
    for (const sprintName of raw.sprints) {
      // Parse sprint names like "Sprint_03_0126" → Sprint 3, Jan 2026
      const match = sprintName.match(/Sprint_(\d+)_(\d{2})(\d{2})/);
      let startDate = new Date();
      let endDate = new Date();
      if (match) {
        const sprintNum = parseInt(match[1]);
        const month = parseInt(match[2]) - 1; // 0-indexed
        const year = 2000 + parseInt(match[3]);
        // Rough 2-week sprint cadence
        const weekInMonth = ((sprintNum - 1) % 2) * 2;
        startDate = new Date(year, month, 1 + weekInMonth * 7);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 13);
      }
      const sprint = await prisma.sprint.create({
        data: {
          name: sprintName.replace(/_/g, " "),
          startDate,
          endDate,
          isActive: false,
        },
      });
      sprintMap.set(sprintName, sprint.id);
    }
    console.log(`  ✓ ${sprintMap.size} sprints created\n`);

    // ── 3. CREATE COMPANY PRIORITIES ──
    console.log(`Creating ${COMPANY_PRIORITIES.length} company priorities...`);
    for (const cp of COMPANY_PRIORITIES) {
      const priority = await prisma.companyPriority.create({
        data: {
          name: cp.name,
          priority: cp.priority,
          responsible: {
            connect: resolveUsers(
              cp.responsible.map((e) => ({ name: "", email: e }))
            ),
          },
          accountable: {
            connect: resolveUsers(
              cp.accountable.map((e) => ({ name: "", email: e }))
            ),
          },
        },
      });
      priorityMap.set(cp.name, priority.id);
    }
    console.log(`  ✓ ${priorityMap.size} company priorities created\n`);

    // ── 4. CREATE PROJECTS ──
    console.log(`Creating ${raw.projects.length} projects...`);
    const projectMap = new Map<string, string>(); // name → id

    // First pass: create all projects without parent references
    for (const proj of raw.projects) {
      // Find company priority for this project
      let companyPriorityId: string | undefined;
      for (const [cpName, projectNames] of Object.entries(PRIORITY_PROJECT_MAP)) {
        if (projectNames.includes(proj.name)) {
          companyPriorityId = priorityMap.get(cpName);
          break;
        }
      }

      const project = await prisma.project.create({
        data: {
          name: proj.name.trim(),
          description: toPlainString(proj.description),
          status: proj.status || "ACTIVE",
          projectType: proj.projectType || "ONE_OFF",
          businessFunction: toPlainString(proj.businessFunction),
          companyPriorityId: companyPriorityId || null,
          responsible: { connect: resolveUsers(proj.responsible) },
          accountable: { connect: resolveUsers(proj.accountable) },
          consulted: { connect: resolveUsers(proj.consulted) },
          informed: { connect: resolveUsers(proj.informed) },
        },
      });
      projectMap.set(proj.name, project.id);
    }
    console.log(`  ✓ ${projectMap.size} projects created\n`);

    // ── 5. CREATE TASKS ──
    console.log(`Creating ${raw.tasks.length} tasks...`);
    let taskCount = 0;
    const taskMap = new Map<string, string>(); // title → id (for dependency resolution)

    for (const task of raw.tasks) {
      const projectId = task.project ? projectMap.get(task.project) : undefined;
      const sprintId = task.sprint ? sprintMap.get(task.sprint) : undefined;
      const notes = toPlainString(task.notes);

      const created = await prisma.task.create({
        data: {
          title: task.title,
          notes,
          status: task.status || "BACKLOG",
          priority: task.priority || "P2",
          degreeOfDifficulty: task.difficulty || "MEDIUM",
          startDate: parseDate(task.startDate),
          dueDate: parseDate(task.dueDate),
          assignedOn: parseDate(task.assignedOn),
          projectId: projectId || null,
          sprintId: sprintId || null,
          unplanned: task.unplanned || false,
          columnOrder: task.columnOrder || 0,
          responsible: { connect: resolveUsers(task.responsible) },
          accountable: { connect: resolveUsers(task.accountable) },
          consulted: { connect: resolveUsers(task.consulted) },
          informed: { connect: resolveUsers(task.informed) },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: task.status || "BACKLOG",
            },
          },
        },
      });
      taskMap.set(task.title, created.id);
      taskCount++;
    }
    console.log(`  ✓ ${taskCount} tasks created\n`);

    // ── 6. CREATE LOGBOOK ENTRIES ──
    console.log(`Creating ${raw.logbook.length} logbook entries...`);
    let logbookCount = 0;
    // We need a dummy task for logbook entries - create tasks on-the-fly if needed
    // Actually, logbook entries reference tasks but don't need a live task relation
    // They store denormalized data (taskTitle, projectName, etc.)

    for (const entry of raw.logbook) {
      // Find or create a task reference
      let taskId = taskMap.get(entry.title);
      if (!taskId) {
        // Create a minimal "archived" task for this logbook entry
        const archivedTask = await prisma.task.create({
          data: {
            title: entry.title,
            notes: toPlainString(entry.notes),
            status: entry.status || "DONE",
            priority: entry.priority || "P2",
            completedOn: parseDate(entry.completedOn),
            projectId: entry.project ? projectMap.get(entry.project) : undefined,
          },
        });
        taskId = archivedTask.id;
        taskMap.set(entry.title, taskId);
      }

      const responsibleNames = entry.responsible
        ?.map((p: { name: string }) => p.name)
        .join(", ");
      const accountableNames = entry.accountable
        ?.map((p: { name: string }) => p.name)
        .join(", ");

      await prisma.logbookEntry.create({
        data: {
          taskId,
          taskTitle: entry.title,
          taskNotes: toPlainString(entry.notes),
          projectName: entry.project || null,
          sprintName: entry.sprint
            ? entry.sprint.replace(/_/g, " ")
            : null,
          priority: entry.priority || "P2",
          status: entry.status || "DONE",
          responsible: responsibleNames || null,
          accountable: accountableNames || null,
          completedOn: parseDate(entry.completedOn) || new Date(),
          archivedAt: parseDate(entry.archivedAt) || new Date(),
        },
      });
      logbookCount++;
    }
    console.log(`  ✓ ${logbookCount} logbook entries created\n`);

    // ── 7. CREATE BOARD SETTINGS ──
    console.log("Creating board settings...");
    const columns = [
      { columnName: "BACKLOG", wipLimit: 0, columnOrder: 0, color: "#6B7280" },
      { columnName: "QUEUED", wipLimit: 0, columnOrder: 1, color: "#8B5CF6" },
      {
        columnName: "WORKING_ON_TODAY",
        wipLimit: 3,
        columnOrder: 2,
        color: "#3B82F6",
      },
      { columnName: "ACTIVE", wipLimit: 5, columnOrder: 3, color: "#F59E0B" },
      { columnName: "NOT_DONE", wipLimit: 0, columnOrder: 4, color: "#EF4444" },
      { columnName: "DONE", wipLimit: 0, columnOrder: 5, color: "#10B981" },
    ];
    for (const col of columns) {
      await prisma.boardSettings.create({ data: col });
    }
    console.log(`  ✓ ${columns.length} board columns created\n`);
  }

  // ── 8. SEED SYSTEM-MANAGED GTM OPERATOR WORKFLOWS ──
  console.log("Seeding GTM operator workflows...");
  const operatorWorkflowCount = await seedOperatorWorkflows(userMap);
  console.log(`  ✓ ${operatorWorkflowCount} GTM operator workflows synced\n`);

  // ── 9. SEED DEDICATED GTM OPERATOR RALPH BOARD PROJECT ──
  console.log("Seeding Ralph board project...");
  const ralphBoard = await seedRalphBoardProject({ userMap, priorityMap });
  console.log(`  ✓ ${ralphBoard.seededTasks} Ralph board tasks synced\n`);

  // ── Summary ──
  const counts = {
    users: await prisma.user.count(),
    priorities: await prisma.companyPriority.count(),
    projects: await prisma.project.count(),
    sprints: await prisma.sprint.count(),
    tasks: await prisma.task.count(),
    logbook: await prisma.logbookEntry.count(),
    boardSettings: await prisma.boardSettings.count(),
    workflows: await prisma.workflowDefinition.count(),
    ralphBoardProjectId: ralphBoard.projectId,
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
