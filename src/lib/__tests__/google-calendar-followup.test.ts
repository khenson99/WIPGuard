import { describe, expect, it } from "vitest";
import {
  buildGoogleCalendarDedupeKey,
  defaultGoogleCalendarRuleConfig,
} from "@/lib/integrations/google-calendar-followup";

describe("google-calendar-followup helpers", () => {
  it("returns default calendar follow-up config", () => {
    expect(defaultGoogleCalendarRuleConfig()).toEqual({
      calendarIds: ["primary"],
      prepLeadHours: 24,
      followupDelayMinutes: 15,
      lookaheadHours: 72,
      lookbackHours: 48,
    });
  });

  it("builds canonical dedupe keys", () => {
    const key = buildGoogleCalendarDedupeKey({
      calendarId: "primary",
      eventId: "ev_123",
      variant: "followup",
    });

    expect(key).toBe("google_workspace:calendar_event:primary:ev_123:followup");
  });
});
