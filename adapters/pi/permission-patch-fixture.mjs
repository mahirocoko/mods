// Offline source staging only. Never installs/applies into canonical node_modules.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const adapterRoot = path.dirname(fileURLToPath(import.meta.url));
export const productRoot = path.resolve(adapterRoot, "../../../mahiro-pi");
export const evidenceRoot = path.join(productRoot, ".agent-state/runtime/code-map-port/owner-patch");
export const permissionPatch = path.join(adapterRoot, "patches/@gotgenes__pi-permission-system@40.2.2.patch");

export function stagePermissionFixture({ patched = true, evidenceBase = evidenceRoot } = {}) {
  fs.mkdirSync(evidenceBase, { recursive: true });
  const root = fs.mkdtempSync(path.join(evidenceBase, patched ? "patched-" : "unpatched-"));
  const adapter = path.join(root, "mods/adapters/pi"), primary = path.join(root, "mahiro-pi");
  fs.mkdirSync(adapter, { recursive: true });
  fs.mkdirSync(primary);
  for (const name of ["package.json", "extensions", "lib"]) fs.cpSync(path.join(productRoot, name), path.join(primary, name), { recursive: true });
  for (const name of ["index.ts", "bootstrap.mjs", "host.mjs", "provenance.mjs", "evidence-git.mjs", "package.json", "code-map-test.mjs", "code-map-blocked-test.mjs", "goal-test.mjs", "evidence-test.mjs"]) fs.copyFileSync(path.join(adapterRoot, name), path.join(adapter, name));
  fs.mkdirSync(path.join(root, "mods/mods"), { recursive: true });
  for (const name of ["mahiro-secret-read-guard.js", "mahiro-commit-attribution-guard.js"]) fs.copyFileSync(path.resolve(adapterRoot, "../../mods", name), path.join(root, "mods/mods", name));
  const permissions = path.join(root, "permission-owner");
  const installed = fs.realpathSync(path.join(adapterRoot, "node_modules/@gotgenes/pi-permission-system"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8")).version, "40.2.2");
  fs.cpSync(installed, permissions, { recursive: true, filter: (name) => !name.startsWith(path.join(installed, "node_modules")) });
  // Owner runtime dependencies stay read-only links. Only staged src/dist receive patch bytes.
  const ownerParent = path.resolve(installed, "../..");
  fs.mkdirSync(path.join(permissions, "node_modules"));
  for (const name of fs.readdirSync(ownerParent)) {
    if (name === "@gotgenes") continue;
    fs.symlinkSync(path.join(ownerParent, name), path.join(permissions, "node_modules", name), "dir");
  }
  fs.mkdirSync(path.join(adapter, "node_modules/@gotgenes"), { recursive: true });
  fs.symlinkSync(permissions, path.join(adapter, "node_modules/@gotgenes/pi-permission-system"), "dir");
  fs.symlinkSync(fs.realpathSync(path.join(adapterRoot, "node_modules/@gotgenes/pi-subagents")), path.join(adapter, "node_modules/@gotgenes/pi-subagents"), "dir");
  for (const name of ["@earendil-works", "typebox"]) fs.symlinkSync(path.join(adapterRoot, "node_modules", name), path.join(adapter, "node_modules", name), "dir");
  if (patched) {
    const apply = spawnSync("git", ["apply", permissionPatch], { cwd: permissions, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: root } });
    assert.equal(apply.status, 0, apply.stdout + apply.stderr);
    assert.match(fs.readFileSync(path.join(permissions, "src/policy/permission-manager.ts"), "utf8"), /matchedSurface: rule\.surface/);
  }
  return { root, adapter, primary, permissions, installed, patched, provenance: "isolated-source-fixture-canonical-roots-not-live-installed-roots" };
}
