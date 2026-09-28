import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Construct synthetic names here; no real user-owned sensitive file is read.
const dotenv = "." + "env";
const npmAuth = "." + "npmrc";
const ssh = "." + "ssh";
const credentials = "credential" + "s.json";
const allowed = ["package.json", "settings.json", "config.yaml", "config.yml", "pyproject.toml", "pom.xml", "notes.txt", "src/index.ts", `${dotenv}.example`, `${dotenv}.sample`, `${dotenv}.template`, `nested/${dotenv.toUpperCase()}.EXAMPLE`, `nested/${dotenv}.sample`, `nested/${dotenv}.template`, `${ssh}/config`, `${ssh}/known_hosts`, `${ssh}/known_hosts.old`, `${ssh}/authorized_keys`, `${ssh}/work.pub`];
const blocked = [dotenv, `${dotenv}.local`, `nested/${dotenv}.production`, dotenv.toUpperCase(), `${dotenv.toUpperCase()}.local`, `nested/${dotenv}.Production`, `${dotenv}.sample.local`, `${dotenv}.template.local`, npmAuth, "." + "pypirc", "auth.json", credentials, "credentials.dev.json", "secret.txt", "secrets.yaml", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "id_xmss", "identity", "server.KEY", "server.pem", "server.p12", "server.pfx", `${ssh}/work_deploy`, `${ssh}/github`];
const root = mkdtempSync(join(tmpdir(), "mahiro-secret-read-fixture-"));
for (const file of [...allowed, ...blocked]) {
  const path = join(root, file);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "SYNTHETIC_FIXTURE_ONLY\n");
}

if (process.argv.includes("--fixtures")) {
  console.log(root);
  process.exit(0);
}

const { default: activate, __testing: { POLICY, createChecker, CHECKER_TIMEOUT_MS } } = await import("../mods/mahiro-secret-read-guard.js");
const event = (toolName, args, phase = "approval") => ({ toolName, args, phase, cwd: root, workingDirectory: root, permissionMode: "bypassPermissions", agentId: "fixture", conversationId: "fixture", toolCallId: "fixture" });
let checked = 0;
const checker = createChecker();
const expect = async (value, deny) => {
  const result = await checker.check(value);
  assert.equal(result?.decision, deny ? "deny" : undefined, `synthetic decision ${checked}: ${value?.toolName ?? "invalid event"}`);
  checked += 1;
};

try {
  for (const phase of ["approval", "execution"]) {
    for (const file of allowed) await expect(event("Read", { file_path: join(root, file) }, phase), false);
    for (const file of blocked) await expect(event("Read", { file_path: join(root, file) }, phase), true);
    for (const alias of ["ReadFile", "read_file", "functions.Read", "functions.read_file"]) {
      await expect(event(alias, { path: credentials }, phase), true);
      await expect(event(alias, { path: "package.json" }, phase), false);
    }
    for (const alias of ["Bash", "ShellCommand", "shell_command", "exec_command", "functions.Bash", "functions.exec_command"]) {
      await expect(event(alias, { command: `cat ${dotenv}` }, phase), true);
      for (const suffix of ["example", "sample", "template"]) {
        await expect(event(alias, { command: `cat ${dotenv}.${suffix}` }, phase), false);
      }
    }
  }
  for (const command of [
    "cat package.json config.yaml pyproject.toml notes.txt", "set -e", "set -eu", "set -euo pipefail",
    "env NODE_ENV=test node --version", "/usr/bin/env python3 --version", "env -u EXAMPLE node --version",
    `ls ${dotenv} ${npmAuth}`, `test -f ${npmAuth}`, `stat ${dotenv}`, `find . -name ${npmAuth}`,
    `cat <<'PY'\nprint('cat ${dotenv} and printenv')\nPY`,
  ]) await expect(event("Bash", { command }), false);
  for (const command of [
    `cat ${npmAuth}`, `cat nested/${dotenv}.local`, `head ${credentials}`, `rg token ${dotenv}`,
    `find . -name ${npmAuth} -exec cat {} \\;`, `ls ${dotenv} && cat ${dotenv}`, `test -f ${npmAuth}|cat ${npmAuth}`,
    "printenv", "export -p", "declare -x", "set", "true; set", "cat /proc/self/environ", "env", "/usr/bin/env -0", "env X=fixture", "env -u EXAMPLE",
  ]) await expect(event("Bash", { command }), true);
  await expect(event("OtherTool", { nested: { path: `nested/${dotenv}` } }), true);
  await expect(event("OtherTool", { path: "config.yaml" }), false);

  // Approval never authorizes mutated execution arguments.
  const mutable = event("Read", { file_path: join(root, "package.json") });
  await expect(mutable, false);
  mutable.phase = "execution";
  mutable.args.file_path = join(root, dotenv);
  await expect(mutable, true);
  for (const invalid of [null, {}, event("Read", null), event("Read", []), { ...event("Read", {}), phase: "unknown" }, event("Read", { value: "x".repeat(1024 * 1024) })]) await expect(invalid, true);
  const circular = {}; circular.self = circular;
  await expect(event("Read", circular), true);

  for (const options of [{ python: join(root, "missing-python") }, { python: "/usr/bin/false" }, { python: "/usr/bin/true" }, { timeoutMs: 1 }]) {
    const failed = createChecker(options);
    assert.equal((await failed.check(event("Read", { path: "package.json" }))).decision, "deny");
    failed.dispose();
  }
  await expect({ ...event("Read", { path: "package.json" }), cwd: join(root, "missing-directory") }, true);
  const abort = new AbortController();
  const cancellable = createChecker({ signal: abort.signal });
  const pending = cancellable.check(event("Read", { path: "package.json" }));
  abort.abort();
  assert.equal((await pending).decision, "deny");
  assert.equal((await cancellable.check(event("Read", {}))).decision, "deny");
  cancellable.dispose();

  let registrations = 0, unregistrations = 0;
  const diagnostics = [];
  let overlay;
  const host = (signal) => ({ signal, capabilities: { permissions: true }, permissions: { register(value) { registrations++; overlay = value; return () => { unregistrations++; }; } }, diagnostics: { report(value) { diagnostics.push(value); } } });
  const controller = new AbortController();
  const cleanup = activate(host(controller.signal));
  assert.equal(registrations, 1);
  assert.equal(typeof overlay.isEnabled, "undefined");
  assert.equal((await overlay.check(event("Read", { path: dotenv }, "execution"))).decision, "deny");
  cleanup();
  assert.equal(unregistrations, 1);
  assert.equal((await overlay.check(event("Read", { path: "package.json" }))).decision, "deny");
  const abortedCleanup = activate(host(controller.signal));
  controller.abort();
  abortedCleanup();
  assert.equal(unregistrations, 1, "aborted cleanup must not republish registry");
  assert.equal(activate(host(controller.signal)), undefined);
  const missingHost = { capabilities: {}, diagnostics: { report(value) { diagnostics.push(value); } } };
  assert.equal(activate(missingHost), undefined);
  assert.equal(diagnostics.length, 1);
  assert.equal(registrations, 2);
  assert.equal(POLICY.includes("CCC_"), false);
  assert.equal(CHECKER_TIMEOUT_MS, 10_000);
  console.log(`Secret-read guard valid: ${checked} synthetic decisions, final-args phases, aliases, exceptions, failure/abort/cleanup. Not real-host Main/subagent coverage.`);
} finally {
  checker.dispose();
  rmSync(root, { recursive: true, force: true });
}
