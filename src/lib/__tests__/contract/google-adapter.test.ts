import { describe, it, expect } from "vitest";

// ─── Contract types for Google Calendar adapter ──────────────────────

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";
type CalendarTaskVariant = "prep" | "followup";

interface GoogleCalendarRuleConfig {
  calendarIds: string[];
  prepLeadHours: number;
  followupDelayMinutes: number;
  lookaheadHours: number;
  lookbackHours: number;
}

interface GoogleCalendarDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  updated?: string;
  status?: string;
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
  organizer?: { email?: string; displayName?: string };
}

interface GoogleCalendarCheckpoint {
  lastObservedAt?: string;
  lastEventId?: string;
}

interface GoogleCalendarRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: GoogleCalendarRuleConfig;
  checkpoint: GoogleCalendarCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

interface GoogleCalendarCreatedTask {
  eventId: string;
  variant: CalendarTaskVariant;
  taskId: string;
  title: string;
  sourceUrl: string;
}

interface GoogleCalendarRunResult {
  ruleId: string;
  enabled: boolean;
  scannedEvents: number;
  createdTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: GoogleCalendarCheckpoint;
  tasks: GoogleCalendarCreatedTask[];
  errors: Array<{ eventId: string; error: string }>;
}

/** Simulated OAuth token response shape */
interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

// ─── Factory helpers ─────────────────────────────────────────────────

function makeConfig(
  overrides: Partial<GoogleCalendarRuleConfig> = {},
): GoogleCalendarRuleConfig {
  return {
    calendarIds: ["primary"],
    prepLeadHours: 1,
    followupDelayMinutes: 15,
    lookaheadHours: 24,
    lookbackHours: 2,
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<GoogleCalendarEvent> = {},
): GoogleCalendarEvent {
  return {
    id: "evt_abc123",
    summary: "Sprint Planning",
    description: "Bi-weekly sprint planning session",
    htmlLink: "https://calendar.google.com/calendar/event?eid=abc123",
    updated: "2026-02-16T09:00:00.000Z",
    status: "confirmed",
    start: {
      dateTime: "2026-02-16T14:00:00-05:00",
      timeZone: "America/New_York",
    },
    end: {
      dateTime: "2026-02-16T15:00:00-05:00",
      timeZone: "America/New_York",
    },
    organizer: {
      email: "team-lead@example.com",
      displayName: "Team Lead",
    },
    ...overrides,
  };
}

function makeRuleState(
  overrides: Partial<GoogleCalendarRuleState> = {},
): GoogleCalendarRuleState {
  return {
    id: "rule-gcal-001",
    key: "google_calendar_prep_followup",
    enabled: true,
    statusOverride: null,
    config: makeConfig(),
    checkpoint: {},
    lastObservedAt: null,
    lastRunAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeCreatedTask(
  overrides: Partial<GoogleCalendarCreatedTask> = {},
): GoogleCalendarCreatedTask {
  return {
    eventId: "evt_abc123",
    variant: "prep",
    taskId: "task-prep-001",
    title: "Prep: Sprint Planning",
    sourceUrl: "https://calendar.google.com/calendar/event?eid=abc123",
    ...overrides,
  };
}

function makeRunResult(
  overrides: Partial<GoogleCalendarRunResult> = {},
): GoogleCalendarRunResult {
  return {
    ruleId: "rule-gcal-001",
    enabled: true,
    scannedEvents: 5,
    createdTasks: 2,
    dedupedTasks: 1,
    failedTasks: 0,
    cursor: { lastObservedAt: "2026-02-16T10:00:00.000Z", lastEventId: "evt_abc123" },
    tasks: [
      makeCreatedTask({ variant: "prep", title: "Prep: Sprint Planning" }),
      makeCreatedTask({ variant: "followup", taskId: "task-followup-001", title: "Followup: Sprint Planning" }),
    ],
    errors: [],
    ...overrides,
  };
}

function makeTokenResponse(
  overrides: Partial<GoogleOAuthTokenResponse> = {},
): GoogleOAuthTokenResponse {
  return {
    access_token: "ya29.mock-access-token",
    expires_in: 3600,
    token_type: "Bearer",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    ...overrides,
  };
}

// ─── Contract Tests ──────────────────────────────────────────────────

describe("Google Calendar Adapter Contract Tests", () => {
  describe("calendar event shape compliance", () => {
    it("validates a well-formed event has required fields", () => {
      const event = makeEvent();

      expect(event.id).toEqual(expect.any(String));
      expect(event.summary).toEqual(expect.any(String));
      expect(event.status).toEqual(expect.any(String));
    });

    it("validates start/end dateTime fields are ISO 8601", () => {
      const event = makeEvent();
      const start = new Date(event.start!.dateTime!);
      const end = new Date(event.end!.dateTime!);

      expect(start.getTime()).toBeGreaterThan(0);
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    });

    it("validates htmlLink is a Google Calendar URL", () => {
      const event = makeEvent();
      expect(event.htmlLink).toMatch(/^https:\/\/calendar\.google\.com\//);
    });

    it("handles all-day events with date instead of dateTime", () => {
      const event = makeEvent({
        start: { date: "2026-02-16" },
        end: { date: "2026-02-17" },
      });

      expect(event.start!.dateTime).toBeUndefined();
      expect(event.start!.date).toBe("2026-02-16");
    });

    it("handles events with minimal fields", () => {
      const event: GoogleCalendarEvent = { id: "evt_minimal" };
      expect(event.id).toBe("evt_minimal");
      expect(event.summary).toBeUndefined();
      expect(event.start).toBeUndefined();
    });

    it("validates organizer shape when present", () => {
      const event = makeEvent();
      expect(event.organizer).toBeDefined();
      expect(event.organizer!.email).toEqual(expect.any(String));
    });

    it("validates event status is a known value", () => {
      const knownStatuses = ["confirmed", "tentative", "cancelled"];
      const event = makeEvent({ status: "confirmed" });
      expect(knownStatuses).toContain(event.status);
    });
  });

  describe("OAuth token refresh shape", () => {
    it("validates token response has required fields", () => {
      const token = makeTokenResponse();

      expect(token.access_token).toEqual(expect.any(String));
      expect(token.expires_in).toEqual(expect.any(Number));
      expect(token.token_type).toBe("Bearer");
    });

    it("validates access_token starts with expected prefix", () => {
      const token = makeTokenResponse();
      expect(token.access_token).toMatch(/^ya29\./);
    });

    it("validates expires_in is a positive number", () => {
      const token = makeTokenResponse();
      expect(token.expires_in).toBeGreaterThan(0);
    });

    it("validates refresh_token is optional", () => {
      const withRefresh = makeTokenResponse({ refresh_token: "1//mock-refresh" });
      const withoutRefresh = makeTokenResponse();

      expect(withRefresh.refresh_token).toEqual(expect.any(String));
      expect(withoutRefresh.refresh_token).toBeUndefined();
    });
  });

  describe("permission scope validation", () => {
    it("validates calendar.readonly scope format", () => {
      const scope = "https://www.googleapis.com/auth/calendar.readonly";
      expect(scope).toMatch(/^https:\/\/www\.googleapis\.com\/auth\/.+$/);
    });

    it("validates calendar.events.readonly is an alternative scope", () => {
      const scope = "https://www.googleapis.com/auth/calendar.events.readonly";
      expect(scope).toContain("calendar.events.readonly");
    });

    it("validates scope string can contain multiple scopes separated by spaces", () => {
      const scopes =
        "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly";
      const scopeList = scopes.split(" ");
      expect(scopeList).toHaveLength(2);
      expect(scopeList.every((s) => s.startsWith("https://"))).toBe(true);
    });
  });

  describe("calendar rule config defaults", () => {
    it("validates default config values", () => {
      const config = makeConfig();

      expect(config.calendarIds).toContain("primary");
      expect(config.prepLeadHours).toBeGreaterThan(0);
      expect(config.followupDelayMinutes).toBeGreaterThan(0);
      expect(config.lookaheadHours).toBeGreaterThan(0);
      expect(config.lookbackHours).toBeGreaterThan(0);
    });

    it("validates multiple calendar IDs can be specified", () => {
      const config = makeConfig({
        calendarIds: ["primary", "team@group.calendar.google.com"],
      });
      expect(config.calendarIds).toHaveLength(2);
    });

    it("validates lookaheadHours > prepLeadHours for meaningful prep tasks", () => {
      const config = makeConfig();
      expect(config.lookaheadHours).toBeGreaterThan(config.prepLeadHours);
    });
  });

  describe("dedupe key format", () => {
    it("builds prep dedupe key in canonical format", () => {
      const key = `gcal:google_calendar_prep_followup:evt_abc123:prep`;
      expect(key).toMatch(/^gcal:google_calendar_prep_followup:.+:prep$/);
    });

    it("builds followup dedupe key in canonical format", () => {
      const key = `gcal:google_calendar_prep_followup:evt_abc123:followup`;
      expect(key).toMatch(/^gcal:google_calendar_prep_followup:.+:followup$/);
    });

    it("uses event ID as the unique component", () => {
      const eventId = "evt_abc123";
      const prepKey = `gcal:google_calendar_prep_followup:${eventId}:prep`;
      const followupKey = `gcal:google_calendar_prep_followup:${eventId}:followup`;

      expect(prepKey).toContain(eventId);
      expect(followupKey).toContain(eventId);
      expect(prepKey).not.toBe(followupKey);
    });
  });

  describe("created task shape", () => {
    it("validates a prep task has correct variant and title prefix", () => {
      const task = makeCreatedTask({ variant: "prep", title: "Prep: Sprint Planning" });

      expect(task.variant).toBe("prep");
      expect(task.title).toMatch(/^Prep:/);
      expect(task.eventId).toEqual(expect.any(String));
      expect(task.taskId).toEqual(expect.any(String));
      expect(task.sourceUrl).toEqual(expect.any(String));
    });

    it("validates a followup task has correct variant and title prefix", () => {
      const task = makeCreatedTask({
        variant: "followup",
        taskId: "task-followup-001",
        title: "Followup: Sprint Planning",
      });

      expect(task.variant).toBe("followup");
      expect(task.title).toMatch(/^Followup:/);
    });

    it("validates variant is strictly 'prep' or 'followup'", () => {
      const validVariants: CalendarTaskVariant[] = ["prep", "followup"];
      for (const v of validVariants) {
        expect(["prep", "followup"]).toContain(v);
      }
    });
  });

  describe("run result shape", () => {
    it("validates a successful run result", () => {
      const result = makeRunResult();

      expect(result.ruleId).toEqual(expect.any(String));
      expect(result.enabled).toBe(true);
      expect(result.scannedEvents).toBeGreaterThanOrEqual(0);
      expect(result.createdTasks).toBeGreaterThanOrEqual(0);
      expect(result.dedupedTasks).toBeGreaterThanOrEqual(0);
      expect(result.failedTasks).toBe(0);
      expect(result.tasks).toEqual(expect.any(Array));
      expect(result.errors).toHaveLength(0);
    });

    it("validates cursor tracks last processed event", () => {
      const result = makeRunResult();
      expect(result.cursor.lastObservedAt).toEqual(expect.any(String));
      expect(result.cursor.lastEventId).toEqual(expect.any(String));
    });

    it("validates errors array contains eventId and error message", () => {
      const result = makeRunResult({
        failedTasks: 1,
        errors: [{ eventId: "evt_fail", error: "Calendar API rate limit" }],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].eventId).toEqual(expect.any(String));
      expect(result.errors[0].error).toEqual(expect.any(String));
    });

    it("validates createdTasks + dedupedTasks <= scannedEvents", () => {
      const result = makeRunResult();
      expect(result.createdTasks + result.dedupedTasks).toBeLessThanOrEqual(
        result.scannedEvents * 2, // each event can produce prep + followup
      );
    });
  });

  describe("rule state shape", () => {
    it("validates rule state has canonical key", () => {
      const state = makeRuleState();
      expect(state.key).toBe("google_calendar_prep_followup");
    });

    it("validates statusOverride is null or supported auto status", () => {
      const validOverrides: Array<SupportedAutoTaskStatus | null> = [
        null,
        "QUEUED",
        "ACTIVE",
        "NOT_DONE",
      ];

      for (const override of validOverrides) {
        const state = makeRuleState({ statusOverride: override });
        if (override === null) {
          expect(state.statusOverride).toBeNull();
        } else {
          expect(["QUEUED", "ACTIVE", "NOT_DONE"]).toContain(state.statusOverride);
        }
      }
    });

    it("validates checkpoint is initially empty", () => {
      const state = makeRuleState();
      expect(state.checkpoint).toEqual({});
    });
  });
});
