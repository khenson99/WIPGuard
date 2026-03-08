#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const files = process.argv
  .slice(2)
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts"))
  .map((file) => path.relative(process.cwd(), path.resolve(process.cwd(), file)));

if (files.length === 0) {
  process.exit(0);
}

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const ignoredFiles = [];
let hasFailures = false;

for (const file of files) {
  const result = spawnSync(
    npxCommand,
    ["tsc-files", "--noEmit", "--pretty", "false", file],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    continue;
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const normalizedFile = file.replaceAll(path.sep, "/");
  const relevantDiagnostics = output
    .split(/\r?\n/)
    .filter((line) => line.replaceAll("\\", "/").includes(`${normalizedFile}(`));

  if (relevantDiagnostics.length > 0 || output.length === 0) {
    hasFailures = true;
    if (relevantDiagnostics.length > 0) {
      console.error(relevantDiagnostics.join("\n"));
    } else {
      console.error(`[typecheck:staged] TypeScript failed for ${file}`);
    }
    continue;
  }

  ignoredFiles.push(file);
}

if (ignoredFiles.length > 0) {
  console.warn(
    `[typecheck:staged] Ignored external diagnostics for ${ignoredFiles.length} staged file(s): ${ignoredFiles.join(", ")}`
  );
}

process.exit(hasFailures ? 1 : 0);
