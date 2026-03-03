import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildCsvString, downloadCsv } from "@/lib/analytics/csv-export";

// Capture the real createElement before any mocking
const realCreateElement = document.createElement.bind(document);

describe("buildCsvString", () => {
  it("builds header and rows for basic table", () => {
    const csv = buildCsvString(
      ["Name", "Age", "City"],
      [
        ["Alice", "30", "New York"],
        ["Bob", "25", "Boston"],
      ]
    );
    const lines = csv.split(/\r?\n/);
    expect(lines[0]).toBe("Name,Age,City");
    expect(lines[1]).toBe("Alice,30,New York");
    expect(lines[2]).toBe("Bob,25,Boston");
  });

  it("wraps values containing commas in double quotes", () => {
    const csv = buildCsvString(["Label"], [["hello, world"]]);
    expect(csv).toBe('Label\n"hello, world"');
  });

  it("escapes double quotes inside values", () => {
    const csv = buildCsvString(["Note"], [['say "hello"']]);
    expect(csv).toBe('Note\n"say ""hello"""');
  });

  it("wraps values containing newlines in double quotes", () => {
    const csv = buildCsvString(["Text"], [["line1\nline2"]]);
    expect(csv).toBe('Text\n"line1\nline2"');
  });
});

describe("downloadCsv", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let clickMock: ReturnType<typeof vi.fn>;
  let capturedAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    capturedAnchor = null;
    createObjectURLMock = vi.fn(() => "blob:mock-url");
    revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURLMock,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURLMock,
      writable: true,
    });

    clickMock = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "a") {
        const el = realCreateElement("a") as HTMLAnchorElement;
        el.click = clickMock as () => void;
        capturedAnchor = el;
        return el;
      }
      return realCreateElement(tag);
    }) as typeof document.createElement);
    appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    removeChildSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and clicks an anchor element with correct attributes", () => {
    downloadCsv("export.csv", ["a", "b"], [["1", "2"]]);
    expect(createObjectURLMock).toHaveBeenCalledOnce();
    expect(clickMock).toHaveBeenCalledOnce();
    expect(appendChildSpy).toHaveBeenCalledOnce();
    expect(removeChildSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
  });

  it("appends .csv extension if missing", () => {
    downloadCsv("myfile", ["a"], [["1"]]);
    expect(capturedAnchor?.download).toBe("myfile.csv");
  });

  it("does not double-append .csv if already present", () => {
    downloadCsv("myfile.csv", ["a"], [["1"]]);
    expect(capturedAnchor?.download).toBe("myfile.csv");
  });
});
