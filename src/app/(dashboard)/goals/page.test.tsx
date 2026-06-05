import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GoalsPage from "./page";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({
    user: {
      id: "user_1",
      organizationId: "org_1",
    },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async () => []),
    },
    companyGoalTracking: {
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("/goals", () => {
  it("renders the authenticated Linear goals dashboard route", async () => {
    const page = await GoalsPage();

    render(page);

    expect(screen.getByRole("heading", { name: "Company Goals" })).toBeTruthy();
    expect(screen.getByText("No Linear goals synced")).toBeTruthy();
    expect(screen.getByText(/Settings > Integrations/)).toBeTruthy();
  });
});
