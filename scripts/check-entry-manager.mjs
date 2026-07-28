import { execFileSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";

const root = mkdtempSync(join(tmpdir(), "mahiro-mod-entry-manager-"));
const script = new URL("./manage-entries.mjs", import.meta.url);
const run = (...args) => execFileSync(process.execPath, [script.pathname, ...args], {
  encoding: "utf8",
  env: { ...process.env, LETTA_MODS_ROOT: root },
  stdio: ["ignore", "pipe", "pipe"],
});
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  const initial = run("status");
  assert(initial.includes("goal: enabled") && initial.split("\n").filter(Boolean).length === 10, "entry status must list ten enabled entries");
  assert(run("disable", "goal").includes("goal: disabled"), "entry manager must disable one entry");
  const sentinel = join(root, "mahiro-goal.disabled");
  assert((lstatSync(sentinel).mode & 0o777) === 0o600, "entry sentinel must use mode 0600");
  assert(run("status", "goal").trim() === "goal: disabled", "entry status must report the selected disabled entry");
  assert(run("disable", "goal").includes("already disabled"), "entry disable must be idempotent");
  assert(run("enable", "goal").includes("goal: enabled"), "entry manager must re-enable one entry");
  assert(run("status", "goal").trim() === "goal: enabled", "entry status must report the selected enabled entry");

  writeFileSync(sentinel, "disabled\n", { mode: 0o600 });
  chmodSync(sentinel, 0o644);
  let modeBlocked = false;
  try {
    run("status", "goal");
  } catch (error) {
    modeBlocked = String(error.stderr).includes("Refusing unsafe disable sentinel");
  }
  assert(modeBlocked, "entry manager must reject sentinels that are not mode 0600");
  rmSync(sentinel);

  let unknownBlocked = false;
  try {
    run("disable", "unknown");
  } catch (error) {
    unknownBlocked = String(error.stderr).includes("Unknown bundle entry");
  }
  assert(unknownBlocked, "entry manager must reject unknown names");

  mkdirSync(join(root, ".mahiro-entry-manager.lock"), { mode: 0o700 });
  let lockBlocked = false;
  try {
    run("disable", "goal");
  } catch (error) {
    lockBlocked = String(error.stderr).includes("busy in another process");
  }
  assert(lockBlocked, "entry manager must serialize enable and disable mutations");
  rmSync(join(root, ".mahiro-entry-manager.lock"), { recursive: true });

  symlinkSync(join(root, "missing"), sentinel);
  let symlinkBlocked = false;
  try {
    run("enable", "goal");
  } catch (error) {
    symlinkBlocked = String(error.stderr).includes("Refusing unsafe disable sentinel");
  }
  assert(symlinkBlocked, "entry manager must reject symlink sentinels");
  console.log("Per-entry mod manager valid: ten entries, atomic locked disable/enable, idempotence, mode, unknown-name, and symlink checks passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
