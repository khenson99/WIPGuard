#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = process.cwd();
const standaloneDir = path.join(repoRoot, ".next", "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");
const standaloneServerPath = path.join(standaloneDir, "server.js");
const prepareOnly = process.argv.includes("--prepare-only");

function copyDirectory(sourcePath, targetPath, required = true) {
  if (!fs.existsSync(sourcePath)) {
    if (required) {
      throw new Error(`Missing required path: ${path.relative(repoRoot, sourcePath)}`);
    }

    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function prepareStandaloneAssets() {
  if (!fs.existsSync(standaloneServerPath)) {
    throw new Error("Missing .next/standalone/server.js. Run `npm run build` first.");
  }

  copyDirectory(path.join(repoRoot, ".next", "static"), path.join(standaloneNextDir, "static"));
  copyDirectory(path.join(repoRoot, "public"), path.join(standaloneDir, "public"), false);
}

function startStandaloneServer() {
  const child = spawn(process.execPath, [standaloneServerPath], {
    cwd: standaloneDir,
    env: process.env,
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

try {
  prepareStandaloneAssets();

  if (prepareOnly) {
    process.exit(0);
  }

  startStandaloneServer();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
