import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompanyTrackerPage from "./page";

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
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(async () => []),
    },
    financialGoal: {
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("/metrics/company", () => {
  it("renders the authenticated company tracker route", async () => {
    const page = await CompanyTrackerPage();

    render(page);

    expect(screen.getByRole("heading", { name: "Company Tracker" })).toBeTruthy();
    expect(screen.getByText("Goal Progress")).toBeTruthy();
    expect(screen.getByText("Data Trust")).toBeTruthy();
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
  });
});
