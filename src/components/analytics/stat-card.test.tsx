import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertTriangle } from "lucide-react";
import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("renders when passed a Lucide icon component type", () => {
    render(<StatCard label="Test" value="123" icon={AlertTriangle} />);
    expect(screen.getByText("Test")).toBeTruthy();
  });

  it("renders when passed a Lucide icon element", () => {
    render(<StatCard label="Test" value="123" icon={<AlertTriangle />} />);
    expect(screen.getByText("Test")).toBeTruthy();
  });
});
