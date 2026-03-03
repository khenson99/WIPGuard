import { z } from "zod";

// ─── Base schemas reused across events ───────────────────────────────────────

export const columnUpdateSchema = z.object({
  columnId: z.string(),
  taskIds: z.array(z.string()),
});

export type ColumnUpdate = z.infer<typeof columnUpdateSchema>;

export const taskRelationSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  status: z.string(),
  columnId: z.string(),
  boardId: z.string(),
  order: z.number(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  assignee: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string(),
      image: z.string().nullable().optional(),
    })
    .optional()
    .nullable(),
  labels: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
      }),
    )
    .optional(),
});

export type TaskWithRelations = z.infer<typeof taskRelationSchema>;

// ─── Event payload schemas ───────────────────────────────────────────────────

export const socketEventSchemas = {
  "task:created": z.object({ task: taskRelationSchema }),
  "task:updated": z.object({ task: taskRelationSchema }),
  "task:deleted": z.object({ taskId: z.string() }),
  "task:reordered": z.object({
    columnUpdates: z.array(columnUpdateSchema),
  }),
  "board:refresh": z.object({}),
} as const;

// ─── Derived types ───────────────────────────────────────────────────────────

export type SocketEventName = keyof typeof socketEventSchemas;

export type SocketEventMap = {
  [E in SocketEventName]: z.infer<(typeof socketEventSchemas)[E]>;
};

// ─── Runtime validation utility ──────────────────────────────────────────────

export type ValidationResult<E extends SocketEventName> =
  | { success: true; data: SocketEventMap[E] }
  | { success: false; error: z.ZodError };

/**
 * Validate an incoming WebSocket payload against the schema for the given event.
 * Returns a discriminated union so callers can handle errors explicitly.
 */
export function validateEventPayload<E extends SocketEventName>(
  event: E,
  payload: unknown,
): ValidationResult<E> {
  const schema = socketEventSchemas[event];
  const result = schema.safeParse(payload);

  if (result.success) {
    return { success: true, data: result.data as SocketEventMap[E] };
  }

  return { success: false, error: result.error };
}

/**
 * Parse and validate a payload, throwing on failure.
 * Use this when you want to fail fast (e.g., in emit functions where
 * the payload should always be valid).
 */
export function parseEventPayloadStrict<E extends SocketEventName>(
  event: E,
  payload: unknown,
): SocketEventMap[E] {
  const schema = socketEventSchemas[event];
  return schema.parse(payload) as SocketEventMap[E];
}

/**
 * Type guard to check if a string is a valid socket event name.
 */
export function isSocketEventName(value: string): value is SocketEventName {
  return value in socketEventSchemas;
}
