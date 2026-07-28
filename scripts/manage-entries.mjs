#!/usr/bin/env node

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";

const modsRoot = resolve(process.env.LETTA_MODS_ROOT ?? join(homedir(), ".letta", "mods"));
const lockPath = join(modsRoot, ".mahiro-entry-manager.lock");
const entries = new Map([
  ["timestamps", "mahiro-user-timestamps.disabled"],
  ["herdr", "mahiro-herdr-lifecycle.disabled"],
  ["goal", "mahiro-goal.disabled"],
  ["evidence", "mahiro-code-evidence.disabled"],
  ["ux", "mahiro-ux-workflow.disabled"],
  ["code-map", "mahiro-code-map.disabled"],
  ["execution", "mahiro-execution-run.disabled"],
  ["rtk", "mahiro-rtk-control.disabled"],
  ["statusline", "mahiro-statusline.disabled"],
  ["mcp", "mahiro-mcp-proxy.disabled"],
]);

function usage() {
  return `Usage: pnpm mods:entry <status|disable|enable> [entry]

Entries:
  ${[...entries.keys()].join(", ")}

Examples:
  pnpm mods:entry status
  pnpm mods:entry disable goal
  pnpm mods:entry enable goal

Run /reload in active Letta sessions after changing an entry.`;
}

async function sentinelState(path) {
  try {
    const item = await lstat(path);
    if (item.isSymbolicLink() || !item.isFile() || (item.mode & 0o777) !== 0o600) return "unsafe";
    return "disabled";
  } catch (error) {
    if (error?.code === "ENOENT") return "enabled";
    throw error;
  }
}

async function withMutationLock(operation) {
  await mkdir(modsRoot, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Per-entry mod state is busy in another process.");
    throw error;
  }
  try {
    return await operation();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

function entryPath(id) {
  const filename = entries.get(id);
  if (!filename) throw new Error(`Unknown bundle entry "${id}".\n\n${usage()}`);
  return join(modsRoot, filename);
}

async function disable(id) {
  const path = entryPath(id);
  const state = await sentinelState(path);
  if (state === "unsafe") throw new Error(`Refusing unsafe disable sentinel: ${path}`);
  if (state === "disabled") return `${id}: already disabled`;
  await mkdir(modsRoot, { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${id}.disabled.tmp-${process.pid}-${Date.now()}`);
  let promoted = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`disabled ${new Date().toISOString()}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    promoted = true;
  } finally {
    if (!promoted) await rm(temporary, { force: true });
  }
  return `${id}: disabled`;
}

async function enable(id) {
  const path = entryPath(id);
  const state = await sentinelState(path);
  if (state === "unsafe") throw new Error(`Refusing unsafe disable sentinel: ${path}`);
  if (state === "enabled") return `${id}: already enabled`;
  await rm(path);
  return `${id}: enabled`;
}

async function status(id) {
  const selected = id ? [[id, entryPath(id)]] : [...entries.keys()].map((entry) => [entry, entryPath(entry)]);
  const lines = [];
  for (const [entry, path] of selected) {
    const state = await sentinelState(path);
    if (state === "unsafe") throw new Error(`Refusing unsafe disable sentinel: ${path}`);
    lines.push(`${entry}: ${state}`);
  }
  return lines.join("\n");
}

async function main() {
  const [action = "status", id, ...extra] = process.argv.slice(2);
  if (action === "help" || action === "--help" || action === "-h") {
    console.log(usage());
    return;
  }
  if (extra.length > 0) throw new Error(usage());
  if (action === "status") {
    console.log(await status(id));
    return;
  }
  if (!id) throw new Error(usage());
  if (action === "disable") {
    console.log(await withMutationLock(() => disable(id)));
    console.log("Run /reload in active Letta sessions.");
    return;
  }
  if (action === "enable") {
    console.log(await withMutationLock(() => enable(id)));
    console.log("Run /reload in active Letta sessions.");
    return;
  }
  throw new Error(usage());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
