import { describe, expect, it } from "vitest";
import { buildDashboardCsv, dashboardCsvFilename } from "./export-csv";
import { buildDemoModel } from "./live-adapter";
import type { ImladrisModel, NormalizedMetric } from "./types";

const HEADER =
  "section,metric_key,metric,department,unit,month,value,value_formatted,delta_pct_vs_prev,status,confidence_pct,sources,data_source";

function dataRows(csv: string): string[] {
  return csv.trimEnd().split("\r\n").slice(1);
}

/** Minimal RFC 4180 row parser for assertions (handles quoted cells). */
function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

describe("buildDashboardCsv", () => {
  it("serializes exactly the dashboard's resolvable metrics with a stable header", () => {
    const model = buildDemoModel();
    const dashboard = model.dashboards.company;
    const idx = model.months.length - 1;

    const csv = buildDashboardCsv(model, dashboard, idx);
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe(HEADER);

    const expectedKeys = [
      ...dashboard.hero,
      ...dashboard.groups.flatMap((g) => g.keys),
    ].filter((k) => Boolean(model.metricByKey[k]));
    expect(lines.length).toBe(1 + expectedKeys.length);

    const header = HEADER.split(",");
    const col = (name: string) => header.indexOf(name);

    // Every row is labeled with the model's data source — demo never leaks unlabeled.
    for (const row of dataRows(csv)) {
      expect(splitCsvRow(row)[col("data_source")]).toBe("demo");
    }

    // The lead hero metric serializes with its key, a numeric value, and a formatted value.
    const heroKey = dashboard.hero[0];
    const hero = model.metricByKey[heroKey];
    const heroCells = dataRows(csv)
      .map(splitCsvRow)
      .find((cells) => cells[col("metric_key")] === heroKey);
    expect(heroCells).toBeDefined();
    expect(heroCells?.[col("section")]).toBe("Headline");
    expect(heroCells?.[col("value")]).toBe(String(hero.history[idx]));
    expect(heroCells?.[col("value_formatted")]).not.toBe("");
  });

  it("omits delta and pins the current period for live metrics without a series", () => {
    const demo = buildDemoModel();
    const dashboard = demo.dashboards.company;
    const heroKey = dashboard.hero[0];

    const noTrendMetric: NormalizedMetric = {
      ...demo.metricByKey[heroKey],
      liveTrend: false,
    };
    const model: ImladrisModel = {
      ...demo,
      mode: "live",
      trendsAvailable: true,
      metricByKey: { ...demo.metricByKey, [heroKey]: noTrendMetric },
    };

    const csv = buildDashboardCsv(model, dashboard, model.months.length - 1);
    const header = HEADER.split(",");
    const cells = dataRows(csv)
      .map(splitCsvRow)
      .find((r) => r[header.indexOf("metric_key")] === heroKey);
    expect(cells).toBeDefined();
    expect(cells?.[header.indexOf("month")]).toBe(model.currentMonth);
    expect(cells?.[header.indexOf("delta_pct_vs_prev")]).toBe("");
    expect(cells?.[header.indexOf("value")]).toBe(String(noTrendMetric.value));
  });

  it("escapes labels containing commas and quotes per RFC 4180", () => {
    const demo = buildDemoModel();
    const dashboard = demo.dashboards.company;
    const heroKey = dashboard.hero[0];

    const trickyMetric: NormalizedMetric = {
      ...demo.metricByKey[heroKey],
      label: 'Net "burn", monthly',
    };
    const model: ImladrisModel = {
      ...demo,
      metricByKey: { ...demo.metricByKey, [heroKey]: trickyMetric },
    };

    const csv = buildDashboardCsv(model, dashboard, model.months.length - 1);
    expect(csv).toContain('"Net ""burn"", monthly"');
  });
});

describe("dashboardCsvFilename", () => {
  it("stamps dashboard id, month, and demo suffix", () => {
    const model = buildDemoModel();
    const dashboard = model.dashboards.company;
    const idx = model.months.length - 1;

    expect(dashboardCsvFilename(model, dashboard, idx)).toBe(
      `imladris-company-${model.months[idx]}-demo.csv`,
    );
    expect(dashboardCsvFilename({ ...model, mode: "live" }, dashboard, idx)).toBe(
      `imladris-company-${model.months[idx]}.csv`,
    );
  });
});
