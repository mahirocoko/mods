#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  access,
  cp,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

const execFile = promisify(execFileCallback);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);
const modsRoot = resolve(
  process.env.LETTA_MODS_ROOT ?? join(homedir(), ".letta", "mods"),
);
const registryPath = join(modsRoot, "packages.json");
const lettaBin = process.env.LETTA_BIN ?? "letta";
const npmBin = process.env.NPM_BIN ?? "npm";
const lettaEnvironment = {
  ...process.env,
  LETTA_MODS_DIR: modsRoot,
};

const bundleSource = "npm:@mahirocoko/letta-mods";
const gitBundleSource = "git:https://github.com/mahirocoko/mods";
const legacyMcpSource = "npm:mahiro-mcp-proxy";
const entries = [
  "./mods/mahiro-user-timestamps.ts",
  "./mods/mahiro-goal.ts",
  "./mods/mahiro-code-evidence.ts",
  "./mods/mahiro-ux-workflow.ts",
  "./mods/mahiro-code-map.ts",
  "./mods/mahiro-execution-run.ts",
  "./mods/rtk-control.ts",
  "./mods/statusline.tsx",
  "./mods/mahiro-mcp-proxy.js",
];
const directEntries = ["rtk-control.ts", "statusline.tsx"];

function usage() {
  return `Usage: node scripts/manage-local.mjs <action>

Actions:
  status     Inspect the local bundle and migration state
  install    Validate, back up, install, verify, and migrate legacy mods
  uninstall  Remove the recognized managed bundle while preserving runtime state

Environment:
  LETTA_MODS_ROOT  Override ~/.letta/mods for isolated use
  LETTA_BIN        Override the letta executable
  NPM_BIN          Override the npm executable`;
}

function errorMessage(error) {
  if (error && typeof error === "object") {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const message = error.message || String(error);
    return stderr && !message.includes(stderr) ? `${message}\n${stderr}` : message;
  }
  return String(error);
}

async function run(executable, args, options = {}) {
  return execFile(executable, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

async function runLetta(args) {
  return run(lettaBin, args, { env: lettaEnvironment });
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function hashFile(path) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

function exactEntries(value) {
  return (
    Array.isArray(value) &&
    value.length === entries.length &&
    value.every((entry, index) => entry === entries[index])
  );
}

function isBundle(pkg) {
  return pkg.source === bundleSource || pkg.source === gitBundleSource;
}

function isRecognizedPackage(pkg) {
  return isBundle(pkg) || pkg.source === legacyMcpSource;
}

function validateRegistry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("packages.json must contain a JSON object");
  }
  if (!Array.isArray(value.packages)) {
    throw new Error("packages.json must contain a packages array");
  }

  value.packages.forEach((pkg, index) => {
    if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
      throw new Error(`packages.json package ${index} must be an object`);
    }
    if (typeof pkg.source !== "string" || pkg.source.length === 0) {
      throw new Error(`packages.json package ${index} has an invalid source`);
    }
    if (typeof pkg.root !== "string" || pkg.root.length === 0) {
      throw new Error(`packages.json package ${index} has an invalid root`);
    }
    if (typeof pkg.enabled !== "boolean") {
      throw new Error(`packages.json package ${index} has an invalid enabled state`);
    }
    if (!Array.isArray(pkg.entries) || pkg.entries.some((entry) => typeof entry !== "string")) {
      throw new Error(`packages.json package ${index} has invalid entries`);
    }
  });

  return value;
}

async function readRegistry() {
  try {
    const text = await readFile(registryPath, "utf8");
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new Error(`Cannot parse ${registryPath}: ${error.message}`);
    }
    return validateRegistry(value);
  } catch (error) {
    if (error?.code === "ENOENT") return { packages: [] };
    throw error;
  }
}

function packageRoot(pkg) {
  const root = isAbsolute(pkg.root) ? resolve(pkg.root) : resolve(modsRoot, pkg.root);
  const offset = relative(modsRoot, root);
  if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
    throw new Error(`Refusing package root outside LETTA_MODS_ROOT: ${pkg.root}`);
  }
  return root;
}

function entryPath(pkg, entry) {
  const root = packageRoot(pkg);
  const path = resolve(root, entry);
  const offset = relative(root, path);
  if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
    throw new Error(`Refusing package entry outside its root: ${entry}`);
  }
  return path;
}

async function repositoryHashes() {
  return Object.fromEntries(
    await Promise.all(
      entries.map(async (entry) => [entry, await hashFile(resolve(repositoryRoot, entry))]),
    ),
  );
}

async function fileComparison(path, expectedHash) {
  if (!(await exists(path))) return { state: "missing", hash: null };
  const hash = await hashFile(path);
  return { state: hash === expectedHash ? "matching" : "divergent", hash };
}

async function dependencyPresent(root) {
  try {
    await access(join(root, "node_modules", "@modelcontextprotocol", "sdk", "package.json"));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function inspectBundle(pkg, sourceHashes) {
  const root = packageRoot(pkg);
  const installed = {};
  for (const entry of entries) {
    installed[entry] = await fileComparison(resolve(root, entry), sourceHashes[entry]);
  }
  return {
    pkg,
    root,
    installed,
    dependency: await dependencyPresent(root),
  };
}

async function status() {
  const registry = await readRegistry();
  const sourceHashes = await repositoryHashes();
  const bundles = registry.packages.filter(isBundle);
  const legacyPackages = registry.packages.filter((pkg) => pkg.source === legacyMcpSource);
  let migrationNeeded = bundles.length !== 1;

  console.log("Repository source SHA-256:");
  for (const entry of entries) console.log(`  ${entry}: ${sourceHashes[entry]}`);

  console.log("Legacy direct files:");
  for (const name of directEntries) {
    const comparison = await fileComparison(
      join(modsRoot, name),
      sourceHashes[`./mods/${name}`],
    );
    console.log(
      `  ${name}: ${comparison.state}${comparison.hash ? ` (${comparison.hash})` : ""}`,
    );
    if (comparison.state !== "missing") migrationNeeded = true;
  }

  console.log("Legacy MCP package:");
  if (legacyPackages.length === 0) {
    console.log("  absent");
  } else {
    migrationNeeded = true;
    for (const pkg of legacyPackages) {
      const sourceEntry = pkg.entries.find(
        (entry) => entry === "mods/mahiro-mcp-proxy.js" || entry === "./mods/mahiro-mcp-proxy.js",
      );
      const comparison = sourceEntry
        ? await fileComparison(entryPath(pkg, sourceEntry), sourceHashes["./mods/mahiro-mcp-proxy.js"])
        : { state: "missing-entry", hash: null };
      console.log(
        `  ${pkg.source}: ${comparison.state}; enabled=${pkg.enabled}; root=${packageRoot(pkg)}`,
      );
    }
  }

  console.log("Installed bundle:");
  if (bundles.length === 0) {
    console.log("  absent");
  } else {
    for (const pkg of bundles) {
      const details = await inspectBundle(pkg, sourceHashes);
      console.log(`  source=${pkg.source}; enabled=${pkg.enabled}; root=${details.root}`);
      console.log(`    dependency @modelcontextprotocol/sdk: ${details.dependency ? "present" : "missing"}`);
      for (const entry of entries) {
        console.log(`    ${entry}: ${details.installed[entry].state}`);
      }
      if (
        !pkg.enabled ||
        !exactEntries(pkg.entries) ||
        !details.dependency ||
        Object.values(details.installed).some(({ state }) => state !== "matching")
      ) {
        migrationNeeded = true;
      }
    }
  }

  console.log(`Migration needed: ${migrationNeeded ? "yes" : "no"}`);
}

async function assertSafeLegacy(sourceHashes, registry) {
  for (const name of directEntries) {
    const path = join(modsRoot, name);
    const comparison = await fileComparison(path, sourceHashes[`./mods/${name}`]);
    if (comparison.state === "divergent") {
      throw new Error(`Refusing to overwrite user-edited legacy file: ${path}`);
    }
  }

  const legacyPackages = registry.packages.filter((pkg) => pkg.source === legacyMcpSource);
  if (legacyPackages.length > 1) {
    throw new Error(`Refusing ambiguous ${legacyMcpSource} package entries`);
  }
  for (const pkg of legacyPackages) {
    const sourceEntry = pkg.entries.find(
      (entry) => entry === "mods/mahiro-mcp-proxy.js" || entry === "./mods/mahiro-mcp-proxy.js",
    );
    if (!sourceEntry) {
      throw new Error(`${legacyMcpSource} package has no recognized mod entry`);
    }
    const comparison = await fileComparison(entryPath(pkg, sourceEntry), sourceHashes["./mods/mahiro-mcp-proxy.js"]);
    if (comparison.state !== "matching") {
      throw new Error(
        `Refusing to remove changed active legacy MCP source: ${entryPath(pkg, sourceEntry)}`,
      );
    }
  }
}

function uniquePaths(paths) {
  return [...new Set(paths.map((path) => resolve(path)))];
}

async function copyPath(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true,
  });
}

async function createBackup(registry) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backupsRoot = join(modsRoot, "backups");
  const backupRoot = join(backupsRoot, `${stamp}-${process.pid}`);
  await mkdir(backupsRoot, { recursive: true });
  await mkdir(backupRoot, { recursive: false });

  const registryExisted = await exists(registryPath);
  if (registryExisted) {
    await copyPath(registryPath, join(backupRoot, "packages.json"));
  } else {
    await writeFile(join(backupRoot, "packages.json"), `${JSON.stringify({ packages: [] }, null, 2)}\n`);
  }

  const recognizedPackages = registry.packages.filter(
    isRecognizedPackage,
  );
  const targets = uniquePaths([
    ...directEntries.map((name) => join(modsRoot, name)),
    ...recognizedPackages.map(packageRoot),
  ]);
  const records = [];

  for (const target of targets) {
    const offset = relative(modsRoot, target);
    const backup = join(backupRoot, "paths", offset);
    const targetExisted = await exists(target);
    if (targetExisted) await copyPath(target, backup);
    records.push({ target, backup, existed: targetExisted });
  }

  return { root: backupRoot, records, registryExisted };
}

async function createInstallStage() {
  const stageRoot = await mkdtemp(join(tmpdir(), "mahiro-letta-mods-"));
  try {
    for (const name of ["package.json", "README.md", "MOD.md", "THIRD_PARTY_NOTICES.md"]) {
      await copyPath(join(repositoryRoot, name), join(stageRoot, name));
    }
    await copyPath(join(repositoryRoot, "docs", "usage-th.md"), join(stageRoot, "docs", "usage-th.md"));
    await copyPath(join(repositoryRoot, "LICENSES"), join(stageRoot, "LICENSES"));
    await copyPath(join(repositoryRoot, "mods"), join(stageRoot, "mods"));
    return stageRoot;
  } catch (error) {
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

async function rollback(backup) {
  const records = [...backup.records];
  try {
    const current = await readRegistry();
    const currentRoots = current.packages
      .filter(isRecognizedPackage)
      .map(packageRoot);
    for (const target of uniquePaths(currentRoots)) {
      if (!records.some((record) => record.target === target)) {
        records.push({ target, backup: null, existed: false });
      }
    }
  } catch {
    // The backed-up registry remains authoritative if the mutated registry is unreadable.
  }

  const failures = [];
  for (const record of records) {
    try {
      await rm(record.target, { recursive: true, force: true });
      if (record.existed) await copyPath(record.backup, record.target);
    } catch (error) {
      failures.push(`${record.target}: ${errorMessage(error)}`);
    }
  }

  try {
    const backedUpRegistry = validateRegistry(
      JSON.parse(await readFile(join(backup.root, "packages.json"), "utf8")),
    );
    let restoredRegistry = backedUpRegistry;
    try {
      const currentRegistry = await readRegistry();
      restoredRegistry = {
        ...currentRegistry,
        packages: [
          ...currentRegistry.packages.filter((pkg) => !isRecognizedPackage(pkg)),
          ...backedUpRegistry.packages.filter(isRecognizedPackage),
        ],
      };
    } catch {
      // Fall back to the full backup only when the current registry cannot be read safely.
    }

    if (!backup.registryExisted && restoredRegistry.packages.length === 0) {
      await rm(registryPath, { force: true });
    } else {
      await mkdir(dirname(registryPath), { recursive: true });
      const temporaryRegistryPath = `${registryPath}.mahiro-mods-${process.pid}.tmp`;
      await writeFile(temporaryRegistryPath, `${JSON.stringify(restoredRegistry, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryRegistryPath, registryPath);
    }
  } catch (error) {
    failures.push(`${registryPath}: ${errorMessage(error)}`);
  }

  if (failures.length > 0) {
    return { ok: false, message: failures.join("\n") };
  }
  return { ok: true, message: "restored packages.json and all recognized affected paths" };
}

async function withMutationLock(action) {
  await mkdir(modsRoot, { recursive: true });
  const lockPath = join(modsRoot, ".mahiro-mods.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Another Mahiro mods mutation may be running. If none is active, remove stale lock: ${lockPath}`);
    }
    throw error;
  }

  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return await action();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}

async function verifyBundle(sourceHashes, { requireDependency = true } = {}) {
  const registry = await readRegistry();
  const bundles = registry.packages.filter(isBundle);
  if (bundles.length !== 1) {
    throw new Error(`Expected one installed bundle, found ${bundles.length}`);
  }
  const details = await inspectBundle(bundles[0], sourceHashes);
  for (const entry of entries) {
    if (details.installed[entry].state !== "matching") {
      throw new Error(`Installed bundle source does not match repository: ${entry}`);
    }
  }
  if (requireDependency && !details.dependency) {
    throw new Error("Installed bundle is missing @modelcontextprotocol/sdk");
  }
  return details;
}

async function install() {
  await run(process.execPath, [join(scriptDirectory, "validate-manifest.mjs")], {
    cwd: repositoryRoot,
  });

  const sourceHashes = await repositoryHashes();
  const initialRegistry = await readRegistry();
  const initialBundles = initialRegistry.packages.filter(isBundle);
  if (initialBundles.length > 1) {
    throw new Error("Refusing ambiguous multiple installed bundles");
  }
  if (initialBundles.length === 1 && initialBundles[0].source !== bundleSource) {
    throw new Error(
      `Bundle is managed by ${initialBundles[0].source}; update that source instead of creating a duplicate local package`,
    );
  }
  await assertSafeLegacy(sourceHashes, initialRegistry);
  const installStage = await createInstallStage();
  let backup = null;
  let mutationStarted = false;

  try {
    backup = await createBackup(initialRegistry);
    mutationStarted = true;
    await runLetta(["install", installStage]);

    let details = await verifyBundle(sourceHashes, { requireDependency: false });
    await run(
      npmBin,
      [
        "install",
        "--ignore-scripts",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--no-save",
      ],
      { cwd: details.root },
    );

    details = await verifyBundle(sourceHashes);

    for (const name of directEntries) {
      await rm(join(modsRoot, name), { force: true });
    }

    const beforeLegacyRemoval = await readRegistry();
    if (beforeLegacyRemoval.packages.some((pkg) => pkg.source === legacyMcpSource)) {
      await runLetta(["mods", "remove", legacyMcpSource]);
    }

    const finalRegistry = await readRegistry();
    const finalBundles = finalRegistry.packages.filter(isBundle);
    if (finalBundles.length !== 1) {
      throw new Error(`Final registry contains ${finalBundles.length} recognized bundles`);
    }
    if (!finalBundles[0].enabled) throw new Error("Installed bundle is not enabled");
    if (!exactEntries(finalBundles[0].entries)) {
      throw new Error(`Installed bundle does not register the exact ${entries.length} manifest entries`);
    }
    if (finalRegistry.packages.some((pkg) => pkg.source === legacyMcpSource)) {
      throw new Error(`Legacy package remains registered: ${legacyMcpSource}`);
    }
    await verifyBundle(sourceHashes);
  } catch (error) {
    if (!mutationStarted) throw error;
    const result = await rollback(backup);
    const rollbackLine = result.ok
      ? `Rollback succeeded: ${result.message}.`
      : `Rollback incomplete:\n${result.message}`;
    throw new Error(`${errorMessage(error)}\n${rollbackLine}\nBackup: ${backup.root}`);
  } finally {
    await rm(installStage, { recursive: true, force: true });
  }

  console.log(`Installed ${bundleSource}.`);
  console.log(`Backup: ${backup.root}`);
  console.log("Run /reload in every active Letta Code session.");
}

async function uninstall() {
  const registry = await readRegistry();
  const bundles = registry.packages.filter(isBundle);
  if (bundles.length > 1) {
    throw new Error("Refusing ambiguous multiple matching bundles; remove one explicitly first");
  }
  if (bundles.length === 0) {
    console.log("No recognized @mahirocoko/letta-mods bundle is installed.");
    return;
  }

  const backup = await createBackup(registry);
  try {
    await runLetta(["mods", "remove", bundles[0].source]);
    const finalRegistry = await readRegistry();
    if (finalRegistry.packages.some(isBundle)) {
      throw new Error("The recognized bundle remains registered after removal");
    }
  } catch (error) {
    const result = await rollback(backup);
    const rollbackLine = result.ok
      ? `Rollback succeeded: ${result.message}.`
      : `Rollback incomplete:\n${result.message}`;
    throw new Error(`${errorMessage(error)}\n${rollbackLine}\nBackup: ${backup.root}`);
  }
  console.log(`Removed ${bundles[0].source}; runtime state was preserved.`);
  console.log(`Backup: ${backup.root}`);
  console.log("Run /reload in every active Letta Code session.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["status", "install", "uninstall"].includes(args[0])) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (args[0] === "status") await status();
  if (args[0] === "install") await withMutationLock(install);
  if (args[0] === "uninstall") await withMutationLock(uninstall);
}

main().catch((error) => {
  console.error(`Error: ${errorMessage(error)}`);
  process.exitCode = 1;
});
