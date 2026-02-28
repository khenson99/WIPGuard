#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as ts from "typescript";

function parseArgs(argv) {
  const args = { outDir: "docs" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--outDir" && argv[i + 1]) {
      args.outDir = argv[++i];
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/kpi-inventory.mjs [--outDir <dir>]");
      process.exit(0);
    }
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function featureAreaFromFile(filePath) {
  const p = filePath.replaceAll("\\", "/");
  if (p.includes("/src/components/analytics/") || p.includes("/src/app/api/analytics/")) return "analytics";
  if (p.includes("/src/components/board/") || p.includes("/src/app/api/dashboard/")) return "dashboard";
  if (p.includes("/src/components/dashboard/")) return "dashboard";
  if (p.includes("/src/components/standup/") || p.includes("/src/app/api/standup/")) return "standup";
  if (p.includes("/src/components/projects/") || p.includes("/src/app/api/projects/")) return "projects";
  if (p.includes("/src/components/whip/") || p.includes("/src/app/api/sprints/")) return "whip";
  if (p.includes("/src/app/api/financial-planning/")) return "financial-planning";
  if (p.includes("/src/app/api/conferences/") || p.includes("/src/app/(dashboard)/conferences/")) return "conferences";
  if (p.includes("/src/app/api/flow/") || p.includes("/src/lib/flow/")) return "flow";
  if (p.includes("/src/app/api/ops/")) return "ops";
  if (p.includes("/src/app/api/")) return "api";
  if (p.includes("/src/components/")) return "ui";
  return "other";
}

function locationOf(sourceFile, node) {
  const start = node.getStart(sourceFile, false);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
  return { line: line + 1, column: character + 1 };
}

function textOf(sourceFile, node) {
  try {
    return node.getText(sourceFile);
  } catch {
    return "";
  }
}

function literalString(initializer) {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return null;
}

function literalExpressionText(sourceFile, initializer) {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return JSON.stringify(initializer.text);
  if (ts.isJsxExpression(initializer) && initializer.expression) return textOf(sourceFile, initializer.expression);
  if (ts.isJsxExpression(initializer) && !initializer.expression) return null;
  return textOf(sourceFile, initializer);
}

function chainFromPropertyAccess(expr) {
  const parts = [];
  let cur = expr;
  while (ts.isPropertyAccessExpression(cur)) {
    parts.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) parts.unshift(cur.text);
  return parts.length >= 2 ? parts.join(".") : null;
}

function collectInputs(expr) {
  const inputs = new Set();
  function walk(node) {
    if (ts.isPropertyAccessExpression(node)) {
      const chain = chainFromPropertyAccess(node);
      if (chain) inputs.add(chain);
    }
    ts.forEachChild(node, walk);
  }
  walk(expr);
  return Array.from(inputs).sort();
}

function shouldTreatAsKpiKey(key) {
  if (!key) return false;
  return (
    /Count$|Rate$|Pct$|Percent$/.test(key) ||
    /^total/i.test(key) ||
    /^avg/i.test(key) ||
    /progress/i.test(key) ||
    /health/i.test(key) ||
    /score/i.test(key) ||
    /velocity/i.test(key) ||
    /runway|burn|mrr|arr|revenue/i.test(key) ||
    /blocked|overdue|stale/i.test(key)
  );
}

function extractJsxAttribute(opening, name) {
  for (const attr of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (attr.name.text !== name) continue;
    return attr.initializer ?? null;
  }
  return null;
}

function extractMetricGridItems(sourceFile, expr) {
  if (!expr || !ts.isArrayLiteralExpression(expr)) return [];
  const out = [];
  for (const el of expr.elements) {
    if (!ts.isObjectLiteralExpression(el)) continue;
    let label = null;
    let value = null;
    for (const prop of el.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : null;
      if (key === "label") {
        if (ts.isStringLiteral(prop.initializer)) label = prop.initializer.text;
        else label = textOf(sourceFile, prop.initializer);
      }
      if (key === "value") {
        value = prop.initializer;
      }
    }
    if (label && value) {
      out.push({
        label,
        expression: textOf(sourceFile, value),
        inputs: collectInputs(value),
      });
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = process.cwd();
  const outDir = path.resolve(repoRoot, args.outDir);
  ensureDir(outDir);

  const tsconfigPath = path.join(repoRoot, "tsconfig.json");
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
    throw new Error(`Failed to read tsconfig.json: ${message}`);
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });

  const occurrences = [];

  for (const sourceFile of program.getSourceFiles()) {
    const fileName = sourceFile.fileName;
    if (!fileName.includes(`${path.sep}src${path.sep}`)) continue;
    if (fileName.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (fileName.endsWith(".d.ts")) continue;

    const featureArea = featureAreaFromFile(fileName);

    function recordUiMetric(node, label, exprNode, extra = {}) {
      const loc = locationOf(sourceFile, node);
      occurrences.push({
        kind: "ui",
        featureArea,
        file: path.relative(repoRoot, fileName),
        line: loc.line,
        column: loc.column,
        label: label ?? null,
        fieldPath: null,
        expression: exprNode ? textOf(sourceFile, exprNode) : null,
        inputs: exprNode ? collectInputs(exprNode) : [],
        ...extra,
      });
    }

    function recordApiField(node, fieldPath, exprNode) {
      const loc = locationOf(sourceFile, node);
      occurrences.push({
        kind: "api",
        featureArea,
        file: path.relative(repoRoot, fileName),
        line: loc.line,
        column: loc.column,
        label: null,
        fieldPath,
        expression: exprNode ? textOf(sourceFile, exprNode) : null,
        inputs: exprNode ? collectInputs(exprNode) : [],
      });
    }

    function walk(node) {
      // UI: <StatCard label="..." value={...} />
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const opening = node;
        const tag = opening.tagName;
        const tagName = ts.isIdentifier(tag) ? tag.text : null;
        const metricTags = new Set(["StatCard", "MiniStat", "RingStat", "MetricGrid"]);
        if (tagName && metricTags.has(tagName)) {
          if (tagName === "MetricGrid") {
            const metricsInit = extractJsxAttribute(opening, "metrics");
            const metricsExpr = metricsInit && ts.isJsxExpression(metricsInit) ? metricsInit.expression : null;
            const items = extractMetricGridItems(sourceFile, metricsExpr);
            for (const item of items) {
              recordUiMetric(node, item.label, null, { expression: item.expression, inputs: item.inputs });
            }
          } else {
            const labelInit = extractJsxAttribute(opening, "label");
            const valueInit = extractJsxAttribute(opening, "value");

            const label = literalString(labelInit) ?? (labelInit ? literalExpressionText(sourceFile, labelInit) : null);
            const valueExpr =
              valueInit && ts.isJsxExpression(valueInit) ? valueInit.expression : null;
            recordUiMetric(node, label, valueExpr);
          }
        }
      }

      // API: NextResponse.json({ ... })
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const prop = node.expression;
        if (prop.name.text === "json" && ts.isIdentifier(prop.expression) && prop.expression.text === "NextResponse") {
          const arg0 = node.arguments[0];
          if (arg0 && ts.isObjectLiteralExpression(arg0)) {
            const visitObject = (obj, prefix) => {
              for (const prop of obj.properties) {
                if (!ts.isPropertyAssignment(prop)) continue;
                const key = ts.isIdentifier(prop.name)
                  ? prop.name.text
                  : ts.isStringLiteral(prop.name)
                    ? prop.name.text
                    : null;
                if (!key) continue;

                const nextPath = [...prefix, key];
                if (shouldTreatAsKpiKey(key)) {
                  recordApiField(prop.name, nextPath.join("."), prop.initializer);
                }

                if (ts.isObjectLiteralExpression(prop.initializer)) {
                  visitObject(prop.initializer, nextPath);
                }
              }
            };
            visitObject(arg0, []);
          }
        }
      }

      ts.forEachChild(node, walk);
    }

    walk(sourceFile);
  }

  const jsonPath = path.join(outDir, "kpi-inventory.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), occurrences }, null, 2));

  const mdPath = path.join(outDir, "kpi-inventory.md");
  const lines = [];
  lines.push("# KPI Inventory");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("| kind | area | file:line | label | fieldPath | expression |");
  lines.push("|---|---|---|---|---|---|");
  for (const o of occurrences) {
    const fileLoc = `${o.file}:${o.line}`;
    const label = (o.label ?? "").toString().replaceAll("|", "\\|");
    const fieldPath = (o.fieldPath ?? "").toString().replaceAll("|", "\\|");
    const expr = (o.expression ?? "").toString().replaceAll("|", "\\|").slice(0, 180);
    lines.push(`| ${o.kind} | ${o.featureArea} | ${fileLoc} | ${label} | ${fieldPath} | \`${expr}\` |`);
  }
  fs.writeFileSync(mdPath, lines.join("\n"));

  console.log(`Wrote ${path.relative(repoRoot, jsonPath)} and ${path.relative(repoRoot, mdPath)} (${occurrences.length} occurrences)`);
}

main();

