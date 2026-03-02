import { describe, it, expect } from "vitest";
import {
  serializeToCSV,
  serializeToJSON,
  CSV_COLUMNS,
} from "../logbook-export";
import type { LogbookEntry } from "../logbook-export";

const mockEntries: LogbookEntry[] = [
  {
    id: "entry-1",
    taskTitle: "Implement feature X",
    taskNotes: "Some notes here",
    projectName: "Alpha Project",
    sprintName: "Sprint 1",
    priority: "P1",
    status: "DONE",
    responsible: "Alice",
    accountable: "Bob",
    completedOn: "2026-01-15T10:30:00Z",
    archivedAt: "2026-01-15T11:00:00Z",
  },
  {
    id: "entry-2",
    taskTitle: "Fix bug with, commas",
    taskNotes: null,
    projectName: null,
    sprintName: null,
    priority: "P2",
    status: "DONE",
    responsible: null,
    accountable: null,
    completedOn: "2026-01-16T14:00:00Z",
    archivedAt: "2026-01-16T14:30:00Z",
  },
  {
    id: "entry-3",
    taskTitle: 'He said "hello, world"',
    taskNotes: "Notes with\nnewline",
    projectName: "Beta",
    sprintName: null,
    priority: "P0",
    status: "DONE",
    responsible: "Carol",
    accountable: null,
    completedOn: "2026-01-17T09:00:00Z",
    archivedAt: "2026-01-17T09:15:00Z",
  },
];

describe("serializeToCSV", () => {
  it("starts with UTF-8 BOM", () => {
    const csv = serializeToCSV(mockEntries);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("has correct header row matching CSV_COLUMNS", () => {
    const csv = serializeToCSV(mockEntries);
    const firstLine = csv.split("\r\n")[0].replace("\uFEFF", "");
    expect(firstLine).toBe(CSV_COLUMNS.map((c) => c.header).join(","));
  });

  it("uses CRLF line endings", () => {
    const csv = serializeToCSV(mockEntries);
    expect(csv).toContain("\r\n");
  });

  it("has correct number of lines (header + rows)", () => {
    const csv = serializeToCSV(mockEntries);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(mockEntries.length + 1);
  });

  it("escapes cells containing commas by wrapping in double quotes", () => {
    const csv = serializeToCSV(mockEntries);
    expect(csv).toContain('"Fix bug with, commas"');
  });

  it("escapes cells containing double quotes by doubling them", () => {
    const csv = serializeToCSV(mockEntries);
    expect(csv).toContain('"He said ""hello, world"""');
  });

  it("escapes cells containing newlines", () => {
    const csv = serializeToCSV(mockEntries);
    expect(csv).toContain('"Notes with\nnewline"');
  });

  it("returns BOM + header only for empty entries", () => {
    const csv = serializeToCSV([]);
    const expected = "\uFEFF" + CSV_COLUMNS.map((c) => c.header).join(",");
    expect(csv).toBe(expected);
  });

  it("handles null fields gracefully with empty string", () => {
    const sparse: LogbookEntry[] = [
      {
        id: "x",
        taskTitle: "Test",
        taskNotes: null,
        projectName: null,
        sprintName: null,
        priority: "P3",
        status: "DONE",
        responsible: null,
        accountable: null,
        completedOn: "2026-01-01T00:00:00Z",
        archivedAt: "2026-01-01T00:01:00Z",
      },
    ];
    const csv = serializeToCSV(sparse);
    expect(csv).toContain("x");
    expect(csv).not.toContain("undefined");
    expect(csv).not.toContain("null");
  });

  it("formats completedOn and archivedAt as ISO strings", () => {
    const csv = serializeToCSV(mockEntries);
    expect(csv).toContain("2026-01-15T10:30:00.000Z");
    expect(csv).toContain("2026-01-15T11:00:00.000Z");
  });
});

describe("serializeToJSON", () => {
  it("returns valid JSON array", () => {
    const json = serializeToJSON(mockEntries);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });

  it("uses column headers as object keys", () => {
    const json = serializeToJSON(mockEntries);
    const parsed = JSON.parse(json);
    CSV_COLUMNS.forEach((col) => {
      expect(parsed[0]).toHaveProperty(col.header);
    });
  });

  it("returns empty JSON array for no entries", () => {
    const result = JSON.parse(serializeToJSON([]));
    expect(result).toEqual([]);
  });

  it("maps task title correctly", () => {
    const json = serializeToJSON(mockEntries);
    const parsed = JSON.parse(json);
    expect(parsed[0]["Task"]).toBe("Implement feature X");
  });

  it("converts null fields to empty string", () => {
    const json = serializeToJSON(mockEntries);
    const parsed = JSON.parse(json);
    expect(parsed[1]["Project"]).toBe("");
    expect(parsed[1]["Sprint"]).toBe("");
  });
});
