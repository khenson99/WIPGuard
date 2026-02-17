import {
  SavedViewScope,
  type Prisma,
  type UserSavedView,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

interface DefaultSavedView {
  slug: string;
  name: string;
  isDefault: boolean;
  config: Prisma.InputJsonValue;
}

const DEFAULT_TASK_SAVED_VIEWS: DefaultSavedView[] = [
  {
    slug: "all-work",
    name: "All Work",
    isDefault: true,
    config: {
      layout: "kanban",
      boardFilter: "all",
      density: "standard",
      showMetadata: true,
    },
  },
  {
    slug: "my-work",
    name: "My Work",
    isDefault: false,
    config: {
      layout: "kanban",
      boardFilter: "my_work",
      density: "standard",
      showMetadata: true,
    },
  },
  {
    slug: "today-focus",
    name: "Today Focus",
    isDefault: false,
    config: {
      layout: "kanban",
      boardFilter: "today_focus",
      density: "triage",
      showMetadata: false,
    },
  },
  {
    slug: "table-audit",
    name: "Table Audit",
    isDefault: false,
    config: {
      layout: "table",
      sortBy: "dueDate",
      sortDirection: "asc",
    },
  },
];

const DEFAULT_PROJECT_SAVED_VIEWS: DefaultSavedView[] = [
  {
    slug: "active",
    name: "Active Projects",
    isDefault: true,
    config: {
      layout: "grid",
      filterStatus: "ACTIVE",
    },
  },
  {
    slug: "by-department",
    name: "By Department",
    isDefault: false,
    config: {
      layout: "swimlane",
    },
  },
  {
    slug: "at-risk",
    name: "At Risk",
    isDefault: false,
    config: {
      layout: "list",
      sortField: "risk",
      sortDir: "desc",
    },
  },
];

function defaultsForScope(scope: SavedViewScope): DefaultSavedView[] {
  return scope === SavedViewScope.TASKS
    ? DEFAULT_TASK_SAVED_VIEWS
    : DEFAULT_PROJECT_SAVED_VIEWS;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function toSavedViewScope(value: string | null): SavedViewScope | null {
  if (!value) return null;
  if (value.toLowerCase() === "tasks") return SavedViewScope.TASKS;
  if (value.toLowerCase() === "projects") return SavedViewScope.PROJECTS;
  return null;
}

export async function ensureDefaultSavedViews(
  userId: string,
  scope: SavedViewScope
): Promise<void> {
  const defaults = defaultsForScope(scope);
  await prisma.$transaction(
    defaults.map((view, index) =>
      prisma.userSavedView.upsert({
        where: {
          userId_scope_slug: {
            userId,
            scope,
            slug: view.slug,
          },
        },
        update: {},
        create: {
          userId,
          scope,
          slug: view.slug,
          name: view.name,
          isDefault: view.isDefault,
          isSystem: true,
          config: view.config,
          position: index,
        },
      })
    )
  );
}

export async function getSavedViews(
  userId: string,
  scope: SavedViewScope
): Promise<UserSavedView[]> {
  await ensureDefaultSavedViews(userId, scope);
  return prisma.userSavedView.findMany({
    where: { userId, scope },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function setDefaultSavedView(input: {
  userId: string;
  scope: SavedViewScope;
  viewId: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.userSavedView.updateMany({
      where: {
        userId: input.userId,
        scope: input.scope,
      },
      data: { isDefault: false },
    }),
    prisma.userSavedView.update({
      where: { id: input.viewId },
      data: { isDefault: true },
    }),
  ]);
}

export async function createSavedView(input: {
  userId: string;
  scope: SavedViewScope;
  name: string;
  slug?: string;
  config: Prisma.InputJsonValue;
  isDefault?: boolean;
}): Promise<UserSavedView> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Saved view name is required");
  }

  const baseSlug = normalizeSlug(input.slug || name);
  if (!baseSlug) {
    throw new Error("Saved view slug is invalid");
  }

  const existing = await prisma.userSavedView.findMany({
    where: {
      userId: input.userId,
      scope: input.scope,
      slug: { startsWith: baseSlug },
    },
    select: { slug: true },
  });

  const slugSet = new Set(existing.map((item) => item.slug));
  let slug = baseSlug;
  let suffix = 2;
  while (slugSet.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const position = await prisma.userSavedView.count({
    where: {
      userId: input.userId,
      scope: input.scope,
    },
  });

  const created = await prisma.userSavedView.create({
    data: {
      userId: input.userId,
      scope: input.scope,
      name,
      slug,
      config: input.config,
      isDefault: Boolean(input.isDefault),
      isSystem: false,
      position,
    },
  });

  if (created.isDefault) {
    await setDefaultSavedView({
      userId: input.userId,
      scope: input.scope,
      viewId: created.id,
    });
  }

  return prisma.userSavedView.findUniqueOrThrow({ where: { id: created.id } });
}
