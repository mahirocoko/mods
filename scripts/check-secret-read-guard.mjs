import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const { default: activate, __testing: { POLICY, createChecker } } = await import("../mods/mahiro-secret-read-guard.js");
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

  // Exercise the exact embedded CCC policy with synthetic metadata and stubs.
  // No project scanner, real helper, hook, credentials, or repository reads run.
  const cccTests = String.raw`
import tempfile
from unittest.mock import patch
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    for name in ('sync', 'preflight', 'strict', 'gitleaks'):
        (root / name).write_text('synthetic')
    CCC_SYNC_SCRIPT, CCC_PREFLIGHT_SCRIPT, CCC_STRICT_SCRIPT, CCC_GITLEAKS = [root / name for name in ('sync', 'preflight', 'strict', 'gitleaks')]
    calls = []
    def run(command, timeout):
        calls.append((command, timeout))
        return True
    with patch.dict(globals(), {'_run_ccc_guard': run}):
        assert ccc_portable_security_issue(root) is None
        assert [timeout for _, timeout in calls] == [30, 30, 180]
        assert calls[0][0][-1] == '--check'
        assert calls[1][0][-1] == '--check-settings'
        assert calls[2][0][2] == 'check'
        assert calls[2][0][-1] == CCC_GITLEAKS_SHA256
        assert all('--project-root' in command for command, _ in calls)
        control = root / CCC_LOCAL_POLICY
        control.parent.mkdir(parents=True)
        control.write_text('synthetic-policy')
        allowlist = root / CCC_ALLOWLIST
        allowlist.write_text('{}')
        calls.clear()
        assert ccc_portable_security_issue(root) is None
        assert all('--local-policy' in command for command, _ in calls)
        assert calls[-1][0][-2:] == ['--allowlist', str(allowlist)]
        control.unlink()
        control.symlink_to(root / 'sync')
        assert 'unsafe' in ccc_portable_security_issue(root)
        control.unlink()
        allowlist.unlink()
        allowlist.mkdir()
        assert 'unsafe' in ccc_portable_security_issue(root)
        allowlist.rmdir()
    for fail_at in (0, 1, 2):
        calls.clear()
        def fail(command, timeout):
            calls.append(command)
            return len(calls) - 1 != fail_at
        with patch.dict(globals(), {'_run_ccc_guard': fail}):
            assert ccc_portable_security_issue(root)
            assert len(calls) == fail_at + 1
    CCC_GITLEAKS.unlink()
    assert 'unavailable' in ccc_portable_security_issue(root)
    CCC_GITLEAKS.symlink_to(CCC_SYNC_SCRIPT)
    assert 'unavailable' in ccc_portable_security_issue(root)
    with patch('subprocess.run', side_effect=OSError()):
        assert not _run_ccc_guard(['synthetic'], 1)
        assert resolve_ccc_project_root({})[1]
    with patch('subprocess.run', side_effect=subprocess.TimeoutExpired('synthetic', 1)):
        assert not _run_ccc_guard(['synthetic'], 1)
        assert resolve_ccc_project_root({})[1]
print('Synthetic CCC helper/receipt contract passed')
`;
  const output = execFileSync("/usr/bin/python3", ["-I", "-c", `__name__ = 'fixture'\n${POLICY}\n${cccTests}`], { encoding: "utf8", cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  assert.match(output, /Synthetic CCC helper\/receipt contract passed/);
  console.log(`Secret-read guard valid: ${checked} synthetic decisions, final-args phases, aliases, exceptions, failure/abort/cleanup, and CCC contracts. Not real-host Main/subagent coverage.`);
} finally {
  checker.dispose();
  rmSync(root, { recursive: true, force: true });
}
