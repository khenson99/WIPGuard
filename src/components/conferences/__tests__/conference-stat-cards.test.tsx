import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConferenceStatCards } from "../conference-stat-cards";
import type { ConferenceStats } from "@/lib/conferences/compute-conference-stats";

const baseStats: ConferenceStats = {
  total: 10,
  upcoming: 3,
  inProgress: 2,
  past: 5,
  totalLeads: 42,
};

describe("ConferenceStatCards", () => {
  it("renders all five stat cards", () => {
    render(<ConferenceStatCards stats={baseStats} />);
    expect(screen.getByRole("region", { name: /Total:/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /Upcoming:/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /In Progress:/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /Past:/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /Total Leads:/i })).toBeTruthy();
  });

  it("displays correct values from stats", () => {
    render(<ConferenceStatCards stats={baseStats} />);
    expect(screen.getByRole("region", { name: "Total: 10" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Upcoming: 3" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "In Progress: 2" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Past: 5" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Total Leads: 42" })).toBeTruthy();
  });

  it("wraps cards in a section with accessible label", () => {
    render(<ConferenceStatCards stats={baseStats} />);
    expect(
      screen.getByRole("region", { name: "Conference summary statistics" })
    ).toBeTruthy();
  });

  it("renders zero values without error", () => {
    const zeroStats: ConferenceStats = {
      total: 0,
      upcoming: 0,
      inProgress: 0,
      past: 0,
      totalLeads: 0,
    };
    render(<ConferenceStatCards stats={zeroStats} />);
    expect(screen.getByRole("region", { name: "Total: 0" })).toBeTruthy();
  });
});
