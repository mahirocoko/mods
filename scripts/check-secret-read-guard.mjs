import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = mkdtempSync(join(tmpdir(), "mahiro-secret-read-fixture-"));
const allowed = [".env.example", ".env.sample", ".env.template", "nested/.ENV.EXAMPLE", "nested/.Env.Sample", "nested/.ENV.TEMPLATE", "package.json", "settings.json", "config.yaml", "config.yml", "pyproject.toml", "pom.xml", "notes.txt", "src/index.ts", ".ssh/config", ".ssh/known_hosts", ".ssh/known_hosts.old", ".ssh/authorized_keys", ".ssh/work.pub"];
const blocked = [".env", ".env.local", "nested/.env.production", ".ENV", ".ENV.local", "nested/.Env.Production", ".env.sample.local", ".ENV.TEMPLATE.local", ".npmrc", ".pypirc", "auth.json", "credentials.json", "credentials.dev.json", "secret.txt", "secrets.yaml", "id_rsa", "id_dsa", "id_ecdsa", "id_ecdsa_sk", "id_ed25519", "id_ed25519_sk", "id_xmss", "identity", "server.KEY", "server.pem", "server.p12", "server.pfx", ".ssh/work_deploy", ".ssh/github", ".letta/lc-local-backend/providers/custom.json"];
for (const file of [...allowed, ...blocked]) {
  const path = join(root, file);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "SYNTHETIC_FIXTURE_ONLY\n");
}

if (process.argv.includes("--fixtures")) {
  // Intentionally retained for a separately authorized real-host smoke.
  console.log(root);
  process.exit(0);
}

const { default: activate, __testing: { POLICY, createChecker, CHECKER_TIMEOUT_MS } } = await import("../mods/mahiro-secret-read-guard.js");
const event = (toolName, args, phase = "approval") => ({ toolName, args, phase, cwd: root, workingDirectory: root, permissionMode: "bypassPermissions", agentId: "fixture", conversationId: "fixture", toolCallId: "fixture" });
let checked = 0;
const checker = createChecker();
const expect = async (value, deny) => {
  const result = await checker.check(value);
  assert.equal(result?.decision, deny ? "deny" : undefined, `synthetic decision ${checked}: ${value?.toolName ?? 'invalid event'}`);
  checked += 1;
};

try {
  for (const phase of ["approval", "execution"]) {
    for (const file of allowed) await expect(event("Read", { file_path: join(root, file) }, phase), false);
    for (const file of blocked) await expect(event("Read", { file_path: join(root, file) }, phase), true);
    for (const alias of ["ReadFile", "read_file", "functions.Read", "functions.read_file"]) {
      await expect(event(alias, { path: "auth.json" }, phase), true);
      await expect(event(alias, { path: "package.json" }, phase), false);
    }
    for (const alias of ["Bash", "ShellCommand", "shell_command", "exec_command", "functions.Bash", "functions.exec_command"]) {
      await expect(event(alias, { command: "cat .env" }, phase), true);
      for (const template of [".env.example", ".env.sample", ".env.template"]) {
        await expect(event(alias, { cmd: ["cat", template] }, phase), false);
      }
    }
  }
  for (const command of [
    "cat .env.example", "cat .env.sample", "cat .env.template", "cat nested/.ENV.EXAMPLE", "cat nested/.Env.Sample", "cat nested/.ENV.TEMPLATE", "cat package.json config.yaml pyproject.toml pom.xml notes.txt", "set -e", "set -eu", "set -euo pipefail",
    "env NODE_ENV=test node --version", "/usr/bin/env python3 --version", "env -u EXAMPLE node --version",
    "ls .env .npmrc", "test -f .npmrc", "[ -f .env ]", "stat .env", "find . -name .npmrc", "find . -name credentials.json",
    "cat <<'PY'\n#!/usr/bin/env python3\nprint('cat .env and printenv')\nPY", "ccc search parser", "ccc --help",
  ]) await expect(event("Bash", { command }), false);
  for (const command of [
    "cat .npmrc", "cat 'nested/.env.local'", "cat nested/.ENV", "cat nested/.Env.Local", "cat nested/.env.sample.local", "head credentials.json", "base64 ~/.ssh/work", "rg token .env",
    "find . -name .npmrc -exec cat {} \\;", "find . -name credentials.json -exec head {} \\;",
    "ls .env && cat .env", "ls .env;cat .env", "test -f .npmrc|cat .npmrc",
    "printenv", "export -p", "declare -x", "set", "true; set", "cat /proc/self/environ", "env", "/usr/bin/env -0", "env X=fixture", "env -u EXAMPLE",
    "ccc index", "ccc grep token", "ccc mcp", "ccc search parser --refresh", "ccc --verbose index", "ccc $ACTION", "sh -c 'ccc index'", "alias c=ccc; c index", "cd fixture && ccc index",
  ]) await expect(event("Bash", { command }), true);
  await expect(event("Read", { path: "C:\\fixture\\.env" }), true);
  await expect(event("OtherTool", { nested: { path: "nested/.env" } }), true);
  await expect(event("OtherTool", { path: "config.yaml" }), false);
  await expect(event("mcp__ccc__index", {}), true);
  await expect(event("mcp_proxy_live", { server: "cocoindex", action: "call", tool: "search", args: '{"refresh":true}' }), true);
  await expect(event("mcp_proxy", { server: "ccc", action: "search", query: "refresh" }), false);
  // Approval success must never authorize mutated execution arguments.
  const mutable = event("Read", { file_path: join(root, "package.json") });
  await expect(mutable, false);
  mutable.phase = "execution";
  mutable.args.file_path = join(root, ".env");
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
  assert.equal((await overlay.check(event("Read", { path: ".env" }, "execution"))).decision, "deny");
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

  // Temporary HOME fixture. Synthetic helpers are real subprocesses and do not touch the user HOME or a real scanner.
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const modDoc = readFileSync(join(repoRoot, "MOD.md"), "utf8");
  const legacySkill = ["~/.agents", "skills/ccc"].join("/");
  const persistentClaim = ["No persistent state is ", "written"].join("");
  const managedScanner = ["mahiro-ccc", "gitleaks"].join("/");
  const pinnedVersion = ["8", "30", "1"].join(".");
  for (const [name, text] of [["policy", POLICY], ["readme", readme], ["mod", modDoc]]) {
    assert.equal(text.includes(legacySkill), false, name);
    assert.equal(text.includes(persistentClaim), false, name);
    assert.equal(text.includes(managedScanner), false, name);
    assert.equal(text.includes(pinnedVersion), false, name);
  }
  assert.equal(POLICY.includes("~/.letta/skills/ccc"), true);
  assert.equal(CHECKER_TIMEOUT_MS, 500_000);
  assert.match(modDoc, /~\/\.letta\/skills\/ccc/);
  assert.match(modDoc, /missing-binary/);
  assert.match(modDoc, /private pinned scanner cache/);
  assert.equal(modDoc.includes(["missing ", "scanner"].join("")), false);
  assert.match(readme, /ensure-gitleaks\.py/);

  const home = join(root, "ccc-home");
  const project = join(root, "ccc-project");
  const state = join(home, "fixture-state");
  const scriptDir = join(home, ".letta", "skills", "ccc", "scripts");
  const scannerPath = join(state, "pinned-scanner");
  const modeFile = join(state, "mode");
  const logPath = join(state, "commands.jsonl");
  const pidFile = join(state, "sleep.pid");
  const scannerBytes = Buffer.from("synthetic-pinned-scanner\n");
  const lyingHash = "ab".repeat(32);
  const HELPER_UNAVAILABLE = "CCC portable security helper is unavailable";
  const SETTINGS_FAILED = "CCC project settings are missing or drifted from the portable V2 policy";
  const PREFLIGHT_FAILED = "CCC filename-only project preflight did not pass";
  const PIN_METADATA_INVALID = "CCC pinned scanner metadata is invalid";
  const PIN_UNSAFE = "CCC pinned scanner is unavailable or unsafe";
  const PIN_PROVISION_FAILED = "CCC pinned scanner is missing and could not be provisioned";
  const STRICT_FAILED = "CCC strict receipt is missing, stale, unsafe, or records findings";
  const TIMED_OUT = "CCC security check timed out";
  const WORKTREE = "CCC command must run inside a Git worktree";
  const ROOT_UNRESOLVED = "CCC project root cannot be resolved";
  const CONTROL_UNSAFE = "CCC control path is unsafe";
  const pass = ["settings", "preflight", "pin-check", "strict"];
  const repairPass = ["settings", "preflight", "pin-check", "ensure", ...pass];
  const blockedPin = ["settings", "preflight", "pin-check"];
  const failedEnsure = [...blockedPin, "ensure"];
  const stillMissing = [...failedEnsure, "settings", "preflight", "pin-check"];
  mkdirSync(state, { recursive: true });
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(project, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: project, stdio: "ignore" });
  const gitRoot = execFileSync("git", ["-C", project, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const logPreamble = String.raw`
import json, os, sys
from pathlib import Path
state = Path(os.environ["CCC_FIXTURE_STATE"])
mode = (state / "mode").read_text().strip()
argv = sys.argv[1:]
with (state / "commands.jsonl").open("a") as handle:
    handle.write(json.dumps({"argv": argv}, separators=(",", ":")) + "\n")
`;
  const syncScript = `#!/usr/bin/env python3\n${logPreamble}
if mode == "settings-fail":
    raise SystemExit(1)
if "--check" not in argv or "--fix" in argv or "scan" in argv:
    raise SystemExit(9)
raise SystemExit(0)
`;
  const preflightScript = `#!/usr/bin/env python3\n${logPreamble}
if mode == "preflight-fail":
    raise SystemExit(1)
if "--check-settings" not in argv or "--fix" in argv or "scan" in argv:
    raise SystemExit(9)
raise SystemExit(0)
`;
  const strictScript = `#!/usr/bin/env python3\n${logPreamble}
import hashlib
if not argv or argv[0] != "check" or "scan" in argv or "filename-only" in argv or "--fix" in argv:
    raise SystemExit(9)
if mode in {"stale-ready", "repair-stale"}:
    raise SystemExit(4)

def flag(name):
    return argv[argv.index(name) + 1]
digest = hashlib.sha256(Path(flag("--gitleaks")).read_bytes()).hexdigest()
if digest != flag("--expected-binary-sha256"):
    raise SystemExit(5)
raise SystemExit(0)
`;
  const ensureScript = String.raw`#!/usr/bin/env python3
import hashlib, json, os, sys, time
from pathlib import Path
state = Path(os.environ["CCC_FIXTURE_STATE"])
mode = (state / "mode").read_text().strip()
binary = state / "pinned-scanner"
argv = sys.argv[1:]
with (state / "commands.jsonl").open("a") as handle:
    handle.write(json.dumps({"argv": argv}, separators=(",", ":")) + "\n")
if "scan" in argv or "--dest" in argv or "--offline" in argv or "index" in argv:
    raise SystemExit(9)
action = argv[0]
payload_bytes = b"synthetic-pinned-scanner\n"

def emit(payload, code):
    sys.stderr.write("STDERR_SENTINEL\n")
    sys.stdout.write(json.dumps(payload, sort_keys=True, separators=(",", ":")))
    raise SystemExit(code)

def error(code, exit_code=2, **extra):
    payload = {
        "schema": "mahiro-ccc-gitleaks-pin-v1",
        "action": action,
        "status": "error",
        "error_code": code,
        "version": "9.9.9",
        "repaired": False,
        "network": False,
    }
    payload.update(extra)
    emit(payload, exit_code)

def success(action_name, repaired, network, **overrides):
    payload = {
        "schema": "mahiro-ccc-gitleaks-pin-v1",
        "action": action_name,
        "status": "ok",
        "version": "9.9.9",
        "target": "fixture_test",
        "path": str(binary.resolve()),
        "archive_name": "fixture.tar.gz",
        "archive_sha256": "ab" * 32,
        "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
        "repaired": repaired,
        "network": network,
    }
    payload.update(overrides)
    emit(payload, 0)

def materialize(executable=True):
    binary.write_bytes(payload_bytes)
    binary.chmod(0o755 if executable else 0o644)

if action == "check" and mode == "sleep":
    (state / "sleep.pid").write_text(str(os.getpid()))
    time.sleep(30)
    raise SystemExit(0)
if action == "ensure":
    if mode == "ensure-fails":
        error("download-failed")
    if mode == "ensure-bad-action":
        materialize()
        success("check", False, False)
    materialize()
    success("ensure", True, True)
if mode == "ready":
    success("check", False, False)
elif mode == "stale-ready":
    success("check", False, False)
elif mode == "lie-hash":
    success("check", False, False, binary_sha256="ab" * 32)
elif mode in {"missing-repair", "repair-stale"}:
    if binary.exists():
        success("check", False, False)
    error("missing-binary")
elif mode == "always-missing":
    error("missing-binary")
elif mode == "ensure-fails":
    error("missing-binary")
elif mode == "hash-mismatch":
    error("binary-hash-mismatch")
elif mode == "symlink-binary":
    error("symlink-binary")
elif mode == "unsafe-binary":
    error("unsafe-binary")
elif mode == "unsupported":
    error("unsupported-platform")
elif mode == "permission":
    error("permission-failure")
elif mode == "malformed":
    sys.stderr.write("STDERR_SENTINEL\n")
    sys.stdout.write("{")
    raise SystemExit(0)
elif mode == "oversized":
    sys.stderr.write("STDERR_SENTINEL\n")
    sys.stdout.write("x" * 5000)
    raise SystemExit(0)
elif mode == "bad-schema":
    materialize()
    success("check", False, False, schema="other-schema")
elif mode == "bad-action":
    materialize()
    success("ensure", True, True)
elif mode == "bad-path":
    materialize()
    success("check", False, False, path="relative/scanner")
elif mode == "bad-hash":
    materialize()
    success("check", False, False, binary_sha256="zz")
elif mode == "ok-symlink":
    materialize()
    link = state / "scanner-link"
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(binary)
    success("check", False, False, path=str(link))
elif mode == "ok-directory":
    materialize()
    success("check", False, False, path=str(state))
elif mode == "ok-missing-path":
    materialize()
    success("check", False, False, path=str(state / "absent-scanner"))
elif mode == "non-executable":
    materialize(False)
    success("check", False, False)
elif mode == "missing-extra":
    error("missing-binary", path="/tmp/not-used")
elif mode == "missing-wrong-exit":
    error("missing-binary", exit_code=1)
elif mode == "missing-network":
    error("missing-binary", network=True)
elif mode == "missing-repaired-true":
    error("missing-binary", repaired=True)
else:
    raise SystemExit(9)
`;
  const decoyScript = String.raw`#!/usr/bin/env python3
import os
from pathlib import Path
state = Path(os.environ["CCC_FIXTURE_STATE"])
(state / "decoy-ran").write_text("ran\n")
raise SystemExit(0)
`;
  writeFileSync(join(scriptDir, "sync-project-excludes.py"), syncScript);
  writeFileSync(join(scriptDir, "preflight.py"), preflightScript);
  writeFileSync(join(scriptDir, "strict-gitleaks-scan.py"), strictScript);
  writeFileSync(join(scriptDir, "ensure-gitleaks.py"), ensureScript);
  const decoyDir = join(home, ".agents", "skills", "ccc", "scripts");
  mkdirSync(decoyDir, { recursive: true });
  writeFileSync(join(decoyDir, "ensure-gitleaks.py"), decoyScript);
  for (const name of ["sync-project-excludes.py", "preflight.py", "strict-gitleaks-scan.py", "ensure-gitleaks.py"]) {
    const source = readFileSync(join(scriptDir, name), "utf8");
    assert.equal(source.includes("urllib"), false, name);
    assert.equal(source.includes("socket"), false, name);
  }
  const fixtureEnv = { ...process.env, HOME: home, CCC_FIXTURE_STATE: state };
  const readCommands = () => existsSync(logPath)
    ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).argv)
    : [];
  const commandLabels = (commands) => commands.map((argv) => {
    if (argv[0] === "ensure") return "ensure";
    if (argv[0] === "check" && argv.includes("--json")) return "pin-check";
    if (argv[0] === "check" && argv.includes("--gitleaks")) return "strict";
    if (argv.includes("--check-settings")) return "preflight";
    if (argv.includes("--check")) return "settings";
    return "other";
  });
  const assertPrivate = (issue) => {
    if (issue == null) return;
    assert.equal(typeof issue, "string");
    assert.equal(issue.includes(project), false);
    assert.equal(issue.includes(gitRoot), false);
    assert.equal(issue.includes(home), false);
    assert.equal(issue.includes("STDERR_SENTINEL"), false);
    assert.equal(issue.includes("http://"), false);
    assert.equal(issue.includes("https://"), false);
    assert.equal(issue.length <= 512, true);
  };
  const assertClosed = (commands) => {
    for (const argv of commands) {
      assert.equal(argv.includes("scan"), false);
      assert.equal(argv.includes("index"), false);
      assert.equal(argv.includes("--fix"), false);
      assert.equal(argv.includes("filename-only"), false);
      assert.equal(argv.includes("--dest"), false);
      assert.equal(argv.includes("--offline"), false);
      assert.equal(commandLabels([argv])[0] === "other", false);
    }
  };
  const prepare = (mode) => {
    writeFileSync(modeFile, `${mode}\n`);
    rmSync(logPath, { force: true });
    rmSync(pidFile, { force: true });
    rmSync(join(state, "decoy-ran"), { force: true });
    rmSync(join(state, "scanner-link"), { force: true });
    if (["ready", "stale-ready", "lie-hash"].includes(mode)) {
      writeFileSync(scannerPath, scannerBytes);
      chmodSync(scannerPath, 0o755);
    } else {
      rmSync(scannerPath, { force: true });
    }
  };
  const runPython = (driver, env = fixtureEnv, cwd = project) => {
    const output = execFileSync("/usr/bin/python3", ["-I", "-c", `__name__ = 'fixture'\n${POLICY}\n${driver}`], {
      cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  };
  const assertHelpers = (helpers) => {
    assert.deepEqual(helpers.map((helper) => helper.split("/").at(-1)), [
      "sync-project-excludes.py", "preflight.py", "ensure-gitleaks.py", "strict-gitleaks-scan.py",
    ]);
    for (const helper of helpers) {
      assert.equal(helper.startsWith(`${scriptDir}/`), true);
      assert.equal(helper.includes(legacySkill), false);
    }
  };
  const runCase = (mode, workdir = project) => {
    prepare(mode);
    const parsed = runPython(`
workdir = ${JSON.stringify(workdir)}
result = {
    "read": check("Read", {"path": "package.json"}),
    "env": check("Bash", {"command": "printenv", "workdir": workdir}),
    "cd": check("Bash", {"command": "cd fixture && ccc index", "workdir": workdir}),
    "ccc": check("Bash", {"command": "ccc index", "workdir": workdir}),
    "budget": CCC_GUARD_BUDGET,
    "helpers": [str(CCC_SYNC_SCRIPT), str(CCC_PREFLIGHT_SCRIPT), str(CCC_ENSURE_SCRIPT), str(CCC_STRICT_SCRIPT)],
}
sys.stdout.write(json.dumps(result))
`);
    const commands = readCommands();
    assert.equal(parsed.read, null);
    assert.equal(parsed.env, "command may dump process environment");
    assert.equal(parsed.cd, "CCC guarded commands must use the tool workdir instead of shell cd");
    assert.equal(parsed.budget, 485);
    assertHelpers(parsed.helpers);
    assert.equal(existsSync(join(state, "decoy-ran")), false);
    assertPrivate(parsed.ccc);
    assertClosed(commands);
    return { issue: parsed.ccc, commands, labels: commandLabels(commands) };
  };
  const assertSequence = (result, issue, expected) => {
    assert.equal(result.issue, issue);
    assert.deepEqual(result.labels, expected);
    assert.equal(result.labels.filter((label) => label === "ensure").length <= 1, true);
    for (const [label, argv] of result.labels.map((label, index) => [label, result.commands[index]])) {
      if (label === "pin-check") assert.deepEqual(argv, ["check", "--json"]);
      if (label === "ensure") assert.deepEqual(argv, ["ensure", "--json"]);
      if (label === "settings" || label === "preflight" || label === "strict") {
        assert.equal(argv[argv.indexOf("--project-root") + 1], gitRoot);
      }
      if (label === "strict") {
        assert.equal(argv[0], "check");
        const hash = argv[argv.indexOf("--expected-binary-sha256") + 1];
        const scanner = argv[argv.indexOf("--gitleaks") + 1];
        if (hash !== lyingHash) {
          assert.equal(createHash("sha256").update(readFileSync(scanner)).digest("hex"), hash);
        } else {
          assert.equal(createHash("sha256").update(readFileSync(scanner)).digest("hex") === hash, false);
        }
      }
    }
  };

  const controlDir = join(gitRoot, ".cocoindex_code", "ccc-security");
  const policyPath = join(controlDir, "local-deny-patterns.txt");
  const allowPath = join(controlDir, "allowlist.json");
  mkdirSync(controlDir, { recursive: true });
  writeFileSync(policyPath, "synthetic\n");
  writeFileSync(allowPath, "{}\n");
  const withControls = runCase("ready");
  assertSequence(withControls, null, pass);
  const strictArgs = withControls.commands.at(-1);
  assert.equal(strictArgs.includes("--local-policy"), true);
  assert.deepEqual(strictArgs.slice(-2), ["--allowlist", allowPath]);
  unlinkSync(policyPath);
  symlinkSync(join(scriptDir, "sync-project-excludes.py"), policyPath);
  const unsafePolicy = runCase("ready");
  assert.equal(unsafePolicy.issue, CONTROL_UNSAFE);
  assert.deepEqual(unsafePolicy.commands, []);
  unlinkSync(policyPath);
  unlinkSync(allowPath);
  mkdirSync(allowPath);
  const unsafeAllow = runCase("ready");
  assert.equal(unsafeAllow.issue, CONTROL_UNSAFE);
  assert.deepEqual(unsafeAllow.commands, []);
  rmSync(join(gitRoot, ".cocoindex_code"), { recursive: true, force: true });

  assertSequence(runCase("ready"), null, pass);
  assertSequence(runCase("missing-repair"), null, repairPass);
  assertSequence(runCase("ensure-fails"), PIN_PROVISION_FAILED, failedEnsure);
  assertSequence(runCase("always-missing"), PIN_PROVISION_FAILED, stillMissing);
  assertSequence(runCase("hash-mismatch"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("symlink-binary"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("unsafe-binary"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("unsupported"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("permission"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("malformed"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("oversized"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("bad-schema"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("bad-action"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("bad-path"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("bad-hash"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("missing-extra"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("missing-wrong-exit"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("missing-repaired-true"), PIN_METADATA_INVALID, blockedPin);
  assertSequence(runCase("missing-network"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("ok-symlink"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("ok-directory"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("ok-missing-path"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("non-executable"), PIN_UNSAFE, blockedPin);
  assertSequence(runCase("lie-hash"), STRICT_FAILED, pass);
  assertSequence(runCase("stale-ready"), STRICT_FAILED, pass);
  assertSequence(runCase("repair-stale"), STRICT_FAILED, repairPass);
  assertSequence(runCase("settings-fail"), SETTINGS_FAILED, ["settings"]);
  assertSequence(runCase("preflight-fail"), PREFLIGHT_FAILED, ["settings", "preflight"]);
  assertSequence(runCase("ready", home), WORKTREE, []);
  const notDir = join(root, "not-a-directory");
  writeFileSync(notDir, "x\n");
  assertSequence(runCase("ready", notDir), WORKTREE, []);

  prepare("ready");
  const expired = runPython(`
issue = _ccc_security_gate(Path(${JSON.stringify(project)}), time.monotonic() - 1, True)
sys.stdout.write(json.dumps({"ccc": issue}))
`);
  assert.equal(expired.ccc, TIMED_OUT);
  assert.deepEqual(readCommands(), []);
  mkdirSync(join(root, "empty-bin"), { recursive: true });
  prepare("ready");
  const unresolved = runPython(`
issue = check("Bash", {"command": "ccc index", "workdir": ${JSON.stringify(project)}})
sys.stdout.write(json.dumps({"ccc": issue}))
`, { ...fixtureEnv, PATH: join(root, "empty-bin") });
  assert.equal(unresolved.ccc, ROOT_UNRESOLVED);
  assert.deepEqual(readCommands(), []);

  const runTool = (tool, input) => {
    prepare("ready");
    const parsed = runPython(`
issue = check(${JSON.stringify(tool)}, ${JSON.stringify(input)})
sys.stdout.write(json.dumps({"ccc": issue}))
`);
    const commands = readCommands();
    assertPrivate(parsed.ccc);
    assertClosed(commands);
    assert.equal(existsSync(join(state, "decoy-ran")), false);
    assertSequence({ issue: parsed.ccc, commands, labels: commandLabels(commands) }, null, pass);
  };
  runTool("mcp__ccc__index", { workdir: project });
  runTool("Bash", { command: "ccc grep token", workdir: project });
  runTool("Bash", { command: "ccc search parser --refresh", workdir: project });
  runTool("Bash", { command: "sh -c 'ccc index'", workdir: project });

  const ensurePath = join(scriptDir, "ensure-gitleaks.py");
  const ensureBackup = readFileSync(ensurePath);
  unlinkSync(ensurePath);
  const missingHelper = runCase("ready");
  assert.equal(missingHelper.issue, HELPER_UNAVAILABLE);
  assert.deepEqual(missingHelper.commands, []);
  symlinkSync(join(scriptDir, "sync-project-excludes.py"), ensurePath);
  const symlinkHelper = runCase("ready");
  assert.equal(symlinkHelper.issue, HELPER_UNAVAILABLE);
  assert.deepEqual(symlinkHelper.commands, []);
  unlinkSync(ensurePath);
  writeFileSync(ensurePath, ensureBackup);

  prepare("ready");
  rmSync(logPath, { force: true });
  const phaseChecker = createChecker({ env: fixtureEnv });
  const cccEvent = (phase) => ({
    toolName: "Bash",
    args: { command: "ccc index", workdir: project },
    phase,
    cwd: project,
    workingDirectory: project,
  });
  assert.equal(await phaseChecker.check(cccEvent("approval")), undefined);
  assert.deepEqual(commandLabels(readCommands()), pass);
  rmSync(logPath, { force: true });
  writeFileSync(modeFile, "stale-ready\n");
  const execution = await phaseChecker.check(cccEvent("execution"));
  assert.equal(execution.decision, "deny");
  assert.equal(execution.reason, `Mahiro secret-read guard: ${STRICT_FAILED}.`);
  assertPrivate(execution.reason);
  const executionCommands = readCommands();
  assert.deepEqual(commandLabels(executionCommands), pass);
  assert.equal(executionCommands.some((argv) => argv[0] === "ensure"), false);
  rmSync(logPath, { force: true });
  assert.equal(await phaseChecker.check({ ...cccEvent("execution"), toolName: "Read", args: { file_path: "package.json" } }), undefined);
  assert.equal(existsSync(logPath), false);
  const deniedRead = await phaseChecker.check({ ...cccEvent("approval"), toolName: "Read", args: { file_path: ".env" } });
  assert.equal(deniedRead.reason, "Mahiro secret-read guard: Read tool attempted to read a sensitive file.");
  assert.equal(existsSync(logPath), false);
  phaseChecker.dispose();

  prepare("sleep");
  const abortGate = new AbortController();
  const sleeper = createChecker({ signal: abortGate.signal, env: fixtureEnv });
  const sleeping = sleeper.check(cccEvent("approval"));
  const sleepStarted = Date.now();
  while (!existsSync(pidFile) && Date.now() - sleepStarted < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(existsSync(pidFile), true);
  const sleepPid = Number(readFileSync(pidFile, "utf8").trim());
  abortGate.abort();
  assert.equal((await sleeping).decision, "deny");
  let sleepAlive = true;
  const deathStarted = Date.now();
  while (sleepAlive && Date.now() - deathStarted < 1000) {
    try { process.kill(sleepPid, 0); } catch { sleepAlive = false; }
    if (sleepAlive) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(sleepAlive, false);
  assert.deepEqual(commandLabels(readCommands()), blockedPin);
  assert.equal((await sleeper.check(cccEvent("execution"))).decision, "deny");
  sleeper.dispose();

  console.log(`Secret-read guard valid: ${checked} synthetic decisions, final-args phases, aliases, exceptions, failure/abort/cleanup, and CCC missing-binary repair contracts. Not real-host Main/subagent coverage.`);
} finally {
  checker.dispose();
  rmSync(root, { recursive: true, force: true });
}
