import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

const {
  default: activate,
  __testing: {
    POLICY,
    createChecker,
    CHECKER_TIMEOUT_MS,
    NPM_CONFIG_TOOL,
    runNpmConfig,
    ENV_CONFIG_TOOL,
    runEnvConfig,
    PYPI_CONFIG_TOOL,
    runPypiConfig,
  },
} = await import("../mods/mahiro-secret-read-guard.js");
const event = (toolName, args, phase = "approval") => ({ toolName, args, phase, cwd: root, workingDirectory: root, permissionMode: "bypassPermissions", agentId: "fixture", conversationId: "fixture", toolCallId: "fixture" });
let checked = 0;
const checker = createChecker();
const expect = async (value, deny) => {
  const result = await checker.check(value);
  assert.equal(result?.decision, deny ? "deny" : undefined, `synthetic decision ${checked}: ${value?.toolName ?? "invalid event"} ${String(value?.args?.command ?? "").slice(0, 160)}`);
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

  // Outcome A: Tool argument roles
  // Read aliases inspect target fields only, not description/content/patch/query strings
  await expect(event("Read", { file_path: join(root, "package.json"), description: `Check ${dotenv} configuration` }), false);
  await expect(event("Read", { path: join(root, "package.json"), explanation: `Mentions ${credentials}` }), false);
  await expect(event("ReadFile", { file_path: join(root, "package.json"), query: `select from ${npmAuth}` }), false);
  await expect(event("Read", { files: [join(root, "package.json"), join(root, "settings.json")] }), false);
  await expect(event("Read", { files: [join(root, "package.json"), join(root, dotenv)] }), true);
  await expect(event("Read", { file_path: 123 }), true); // Malformed fail-closed
  await expect(event("Read", {}), true); // Missing target fail-closed

  // Grep/search inspects target path operands, not pattern
  await expect(event("Grep", { path: join(root, "src"), pattern: dotenv }), false);
  await expect(event("Grep", { path: join(root, dotenv), pattern: "export" }), true);
  await expect(event("search", { directory: join(root, "src"), query: credentials }), false);
  await expect(event("ripgrep", { dir_path: join(root, dotenv), query: "token" }), true);

  // Filename discovery (Glob/metadata) does not read contents
  await expect(event("Glob", { pattern: `**/${dotenv}*` }), false);
  await expect(event("list_files", { path: root }), false);

  // Write-only tools and ApplyPatch text should not be classified as reads
  await expect(event("write_to_file", { target_file: join(root, dotenv), code_content: "KEY=1" }), false);
  await expect(event("apply_patch", { patch: `diff --git a/${dotenv} b/${dotenv}\n+KEY=1` }), false);

  // Edit implicitly reads target and must not bypass real sensitive paths
  await expect(event("Edit", { file_path: join(root, dotenv), content: "KEY=1" }), true);
  await expect(event("Edit", { file_path: join(root, "package.json"), targetcontent: dotenv }), false);

  // Bounded fallback for arbitrary unknown tools
  await expect(event("OtherTool", { nested: { path: `nested/${dotenv}` } }), true);
  await expect(event("OtherTool", { path: "config.yaml" }), false);
  await expect(event("OtherTool", { description: `Inspect ${dotenv} securely` }), false);
  await expect(event("OtherTool", { query: `where ${npmAuth}` }), false);

  // Outcome C schema validation in checker: narrow mh_npm_config recognized
  await expect(event("mh_npm_config", {}), false);
  await expect(event("mh_npm_config", { path: npmAuth }), false);
  await expect(event("mh_npm_config", { path: join(root, npmAuth) }), false);
  await expect(event("mh_npm_config", { path: "other.txt" }), true);
  await expect(event("mh_npm_config", { path: npmAuth, extra: "invalid" }), true);
  await expect(event("mh_npm_config", { path: 123 }), true);

  // Outcome C schema validation in checker: narrow mh_env_config recognized
  await expect(event("mh_env_config", {}), false);
  await expect(event("mh_env_config", { path: dotenv }), false);
  await expect(event("mh_env_config", { path: `${dotenv}.local` }), false);
  await expect(event("mh_env_config", { path: `${dotenv}.production` }), false);
  await expect(event("mh_env_config", { path: join(root, `${dotenv}.test`) }), false);
  await expect(event("mh_env_config", { path: `${dotenv}.sample` }), false);
  await expect(event("mh_env_config", { path: "other.txt" }), true);
  await expect(event("mh_env_config", { path: npmAuth }), true);
  await expect(event("mh_env_config", { path: ".pypirc" }), true);
  await expect(event("mh_env_config", { path: dotenv, extra: "invalid" }), true);
  await expect(event("mh_env_config", { path: 123 }), true);
  await expect(event("mh_env_config", { path: "" }), true);

  // Outcome C schema validation in checker: narrow mh_pypi_config recognized
  await expect(event("mh_pypi_config", {}), false);
  await expect(event("mh_pypi_config", { path: ".pypirc" }), false);
  await expect(event("mh_pypi_config", { path: join(root, ".pypirc") }), false);
  await expect(event("mh_pypi_config", { path: "other.txt" }), true);
  await expect(event("mh_pypi_config", { path: dotenv }), true);
  await expect(event("mh_pypi_config", { path: npmAuth }), true);
  await expect(event("mh_pypi_config", { path: ".pypirc", extra: "invalid" }), true);
  await expect(event("mh_pypi_config", { path: 123 }), true);
  await expect(event("mh_pypi_config", { path: "" }), true);

  // Outcome B: Bounded shell roles
  for (const command of [
    "cat package.json config.yaml pyproject.toml notes.txt", "set -e", "set -eu", "set -euo pipefail",
    "env NODE_ENV=test node --version", "/usr/bin/env python3 --version", "env -u EXAMPLE node --version",
    `python3 -c 'links=sorted(set(["https://example.com/docs", "https://example.com/docs"]))'`,
    `curl -s https://example.com/ | python3 -c 'import sys,re; s=sys.stdin.read(); links=sorted(set(re.findall("href",s))); print(links)'`,
    `python3 -c 'print(set()); print(set([1, 1]))'`,
    `bash -c 'python3 -c "print(set([1, 1]))"'`,
    `ls ${dotenv} ${npmAuth}`, `test -f ${npmAuth}`, `stat ${dotenv}`, `find . -name ${npmAuth}`,
    `cat <<'PY'\nprint('cat ${dotenv} and printenv')\nPY`,
    `echo ${dotenv}`, `printf '%s\\n' ${dotenv}`,
    "printenv --help", "printenv -h", "printenv --version",
    "env --help", "env --version",
    `# cat ${dotenv}`,
  ]) await expect(event("Bash", { command }), false);

  for (const command of [
    `cat ${npmAuth}`, `cat nested/${dotenv}.local`, `head ${credentials}`, `rg token ${dotenv}`,
    `find . -name ${npmAuth} -exec cat {} \\;`,
    `find . -name ${npmAuth} -execdir cat {} \\;`,
    `ls ${dotenv} && cat ${dotenv}`, `test -f ${npmAuth}|cat ${npmAuth}`,
    "printenv", "export -p", "declare -x", "set", "true; set", "cat /proc/self/environ", "env", "/usr/bin/env -0", "env X=fixture", "env -u EXAMPLE",
    "true\nset", "set\n(true)", "set \n(true)", "(set)", "command set", "builtin set", "exec set", "env X=fixture set",
    "env -u EXAMPLE set", `sh -lc 'true; set; true'`,
    `echo "$(set)"`, `if true; then set; fi`,
    `echo "$(echo $(true); set)"`, "time set;", "2>/dev/null set;", "echo `true; set; true`",
    `env -S 'sh' -c 'true; set; true'`,
    `echo < ${dotenv}`, `cat < ${dotenv}`,
    `ls ${dotenv}\ncat ${dotenv}`, `ls ${dotenv} & cat ${dotenv}`, `stat ${dotenv}; cat ${dotenv}`,
    `sh -c 'cat ${dotenv}'`, `bash -lc 'cat ${dotenv}'`,
    `cat <<EOF\n$(cat ${dotenv})\nEOF`,
    `bash <<EOF\ncat ${dotenv}\nEOF`,
  ]) await expect(event("Bash", { command }), true);

  // Independent-verifier defects: classify strings only, never execute them.
  for (const phase of ["approval", "execution"]) {
    for (const command of [
      `echo '$(cat ${dotenv})'`, `# $(cat ${dotenv})\nprintf ok`,
      `rg 'x printenv y' docs`, `printenv PATH`, `env --help`,
      `grep -ne '${dotenv}' src`, `rtk rg -ne'${dotenv}' src`,
      `env MODE=fixture rg -n -e '${dotenv}' src`,
      `rtk ls ${dotenv}`, `rtk find . -name '${npmAuth}'`,
      `cat <<'DATA'\n'$(cat ${dotenv})'\nDATA`,
      `echo '<<DATA'`, `printf '%s\\n' 'cat ${dotenv}'`,
      `test -f /proc/self/environ`,
    ]) await expect(event("Bash", { command }, phase), false);
    for (const command of [
      `env MODE=fixture cat ${credentials}`, `env cat id_rsa`,
      `rtk ls ${dotenv}; cat ${dotenv}`, `rtk find . -name ${dotenv} -exec cat {} \\;`,
      `nice cat ${credentials}`, `timeout 10 cat ${credentials}`, `stdbuf -oL cat ${credentials}`,
      `cat \\\n${dotenv}`, `cat \\\n${credentials}`,
      `rg --ignore-file ${dotenv} pattern src`, `rg --ignore-file=${dotenv} pattern src`,
      `grep -nf ${dotenv} src`, `rtk rg -nf${npmAuth} src`,
      `grep --exclude-from=${dotenv} pattern src`,
      `rg -- -e ${dotenv}`, `rg -e token -- ${dotenv}`,
      `echo $(echo $(echo $(echo $(cat ${dotenv}))))`,
      `cat <<DATA\n'$(cat ${dotenv})'\nDATA`,
      `echo '<<DATA'\ncat ${dotenv}`, `# <<DATA\ncat ${dotenv}`,
      `env MODE=fixture sh <<'DATA'\ncat ${dotenv}\nDATA`,
      `true < ${credentials}`, `(set; true)`,
    ]) await expect(event("Bash", { command }, phase), true);
    await expect(event("Read", { path: "package.json", description: dotenv }, phase), false);
    await expect(event("mh_npm_config", { path: null }, phase), true);
    await expect(event("mh_env_config", { path: null }, phase), true);
    await expect(event("mh_pypi_config", { path: null }, phase), true);
    await expect(event("Grep", { path: 42, pattern: "safe" }, phase), true);
    await expect(event("apply_patch", { input: `*** Begin Patch\n*** Update File: ${dotenv}\n@@\n-a\n+b\n*** End Patch` }, phase), true);
    await expect(event("apply_patch", { input: `*** Begin Patch\n*** Update File: src/index.ts\n@@\n-a\n+${dotenv}\n*** End Patch` }, phase), false);
  }

  // Explicit first search patterns and normal options are data; file operands still own reads.
  for (const phase of ["approval", "execution"]) {
    for (const binary of ["rg", "grep", "/usr/bin/grep", "rtk rg", "/usr/bin/rtk rg"]) {
      for (const option of ["-e", "--regexp"]) {
        await expect(event("Bash", { command: `${binary} ${option} '${dotenv}' src` }, phase), false);
        await expect(event("Bash", { command: `${binary} ${option} '${dotenv}' ${dotenv}` }, phase), true);
        await expect(event("Bash", { command: `${binary} ${option} token ${npmAuth}` }, phase), true);
      }
    }
    // Normal plain search patterns and rg/grep option combinations
    for (const command of [
      `rg '${dotenv}' src`, `rtk rg '${dotenv}' src`, `grep '${dotenv}' src`,
      `rg -n '${dotenv}' src`, `rg -i '${dotenv}' src`, `rg -F '${dotenv}' src`,
      `rg -C 2 '${dotenv}' src`, `rg -C2 '${dotenv}' src`,
      `rg -n -e '${dotenv}' src`, `rtk rg -n -e '${dotenv}' src`,
      `grep -n -e '${dotenv}' src`,
    ]) await expect(event("Bash", { command }, phase), false);

    for (const command of [
      `cat -e ${dotenv}`, `rg -f ${dotenv} src`, `grep -f ${dotenv} src`,
      `rg -f -e ${dotenv}`,
      `rg -e ${dotenv} src; cat ${dotenv}`, `rg -e ${dotenv} src|cat ${dotenv}`,
      `rg -e ${dotenv} src && rg -f ${dotenv} src`,
      `rg -e $(cat ${dotenv}) src`,
      `rg -e ${dotenv}\ncat ${dotenv}`,
      `rtk rg -e ${dotenv} src; cat ${dotenv}`, `rtk rg -e ${dotenv} src|cat ${dotenv}`,
      `rtk rg -f ${dotenv} src`,
      `rtk rg -e ${dotenv}\ncat ${dotenv}`, `rtk rg -e $(cat ${dotenv}) src`,
      `rtk rg -e token ${credentials}`, `rtk cat -e ${dotenv}`,
      `rtk -- rg -e ${dotenv} src`,
    ]) await expect(event("Bash", { command }, phase), true);
  }

  // Outcome C: mh_npm_config tool execution & strict allowlist filtering
  // Tested ONLY against isolated synthetic fixture files in root
  assert(NPM_CONFIG_TOOL && typeof NPM_CONFIG_TOOL.run === "function", "mh_npm_config tool must be defined");
  const synthMarker = "npm_synth_token_98765xyz";
  const safeDir = join(root, "safe-dir");
  mkdirSync(safeDir, { recursive: true });
  const safeNpmrc = join(safeDir, npmAuth);
  const authNpmrc = join(root, npmAuth);
  writeFileSync(safeNpmrc, `
# Ordinary project configuration
strict-ssl = true
save-exact = false
node-linker = hoisted
registry = https://registry.npmjs.org/
@myorg:registry = https://npm.pkg.github.com/myorg
fetch-retries = 3
loglevel = notice
`);
  writeFileSync(authNpmrc, `
strict-ssl = true
save-exact = true
registry = https://testuser:${synthMarker}@registry.npmjs.org/secret/path?query=secret#hash
@myorg:registry = https://npm.pkg.github.com/
//registry.npmjs.org/:_authToken = ${synthMarker}
_AuthToken = ${synthMarker}
_auth = ${synthMarker}
_password = secretpassword
username = testuser
email = dev@example.com
custom-unrecognized-setting = unvalidated_free_text
`);

  // 1. Safe config execution
  const safeRes = await runNpmConfig({ cwd: root, args: { path: "safe-dir/.npmrc" } });
  assert.equal(safeRes.status, "success");
  assert.equal(safeRes.settings["strict-ssl"], true);
  assert.equal(safeRes.settings["save-exact"], false);
  assert.equal(safeRes.settings["node-linker"], "hoisted");
  assert.equal(safeRes.settings["registry"], "https://registry.npmjs.org");
  assert.equal(safeRes.settings["@myorg:registry"], "https://npm.pkg.github.com");
  assert.equal(safeRes.settings["fetch-retries"], 3);
  assert.equal(safeRes.settings["loglevel"], "notice");
  assert.equal(safeRes.redacted_count, 0);

  // 2. Auth config execution: verify synthetic token and credentials absent from every field
  const authRes = await runNpmConfig({ cwd: root, args: {} });
  assert.equal(authRes.status, "success");
  assert.equal(authRes.settings["strict-ssl"], true);
  assert.equal(authRes.settings["save-exact"], true);
  assert.equal(authRes.settings["registry"], "https://registry.npmjs.org");
  assert.equal(authRes.settings["@myorg:registry"], "https://npm.pkg.github.com");
  assert(authRes.redacted_count >= 7, "Auth keys and unknown fields must increment redacted_count");
  assert(authRes.redacted_reasons.includes("credential_key"), "Redacted reasons must record credential_key");
  assert(authRes.redacted_reasons.includes("unrecognized_setting"), "Redacted reasons must record unrecognized_setting");

  const authJson = JSON.stringify(authRes);
  assert(!authJson.includes(synthMarker), "Synthetic token marker must NOT appear anywhere in output");
  assert(!authJson.includes("secretpassword"), "Password must NOT appear anywhere in output");
  assert(!authJson.includes("testuser"), "Userinfo must NOT appear anywhere in output");
  assert(!authJson.includes("secret/path"), "URL path must NOT appear anywhere in output");
  assert(!authJson.includes("query=secret"), "URL query must NOT appear anywhere in output");
  assert(!authJson.includes("unvalidated_free_text"), "Unrecognized values must NOT appear in output");

  // 3. Same config path safe vs auth (no state mutation or cache poisoning)
  writeFileSync(authNpmrc, "strict-ssl = true\n");
  const rerunRes = await runNpmConfig({ cwd: root, args: {} });
  assert.equal(rerunRes.status, "success");
  assert.equal(rerunRes.settings["strict-ssl"], true);
  assert.equal(rerunRes.redacted_count, 0);

  // 4. Symlink refusal
  const symlinkDir = join(root, "symlink-dir");
  mkdirSync(symlinkDir, { recursive: true });
  const symlinkNpmrc = join(symlinkDir, npmAuth);
  symlinkSync(safeNpmrc, symlinkNpmrc);
  const symlinkRes = await runNpmConfig({ cwd: root, args: { path: "symlink-dir/.npmrc" } });
  assert.equal(symlinkRes.status, "error");
  assert(symlinkRes.error.includes("symbolic link"));

  // 5. Non-regular file (directory named .npmrc)
  const dirNpmrc = join(root, "dir-file", npmAuth);
  mkdirSync(dirNpmrc, { recursive: true });
  const dirRes = await runNpmConfig({ cwd: root, args: { path: `dir-file/${npmAuth}` } });
  assert.equal(dirRes.status, "error");
  assert.equal(dirRes.error, "Target is not a regular file.");

  // 6. Basename restriction
  const badBasenameRes = await runNpmConfig({ cwd: root, args: { path: "other.config" } });
  assert.equal(badBasenameRes.status, "error");
  assert(badBasenameRes.error.includes("basename"));

  // 7. Multiline continuation rejection
  const contDir = join(root, "cont-dir");
  mkdirSync(contDir, { recursive: true });
  const contNpmrc = join(contDir, npmAuth);
  writeFileSync(contNpmrc, "strict-ssl = \\\ntrue\n");
  const contRes = await runNpmConfig({ cwd: root, args: { path: "cont-dir/.npmrc" } });
  assert.equal(contRes.status, "error");
  assert(contRes.error.includes("continuation"));

  // 8. Cancellation / abort
  const abortCtrl = new AbortController();
  abortCtrl.abort();
  const abortedRes = await runNpmConfig({ cwd: root, signal: abortCtrl.signal });
  assert.equal(abortedRes.status, "error");
  assert(abortedRes.error.includes("aborted"));

  // Real scoped host shape, bounded descriptor read, encoding and quoted INI.
  for (const ctx of [{}, { cwd: root }, { cwd: root, args: { extra: true } }, { cwd: root, args: { path: null } }]) {
    assert.equal((await runNpmConfig(ctx)).status, "error");
  }
  writeFileSync(authNpmrc, `save-exact = "true"\nstrict-ssl = 'false'\nnode-linker = "hoisted"\nfetch-retries = "3"\n`);
  const quoted = await runNpmConfig({ cwd: root, args: {} });
  assert.equal(quoted.status, "success");
  assert.deepEqual(quoted.settings, { "save-exact": true, "strict-ssl": false, "node-linker": "hoisted", "fetch-retries": 3 });
  writeFileSync(authNpmrc, `#${"x".repeat(64 * 1024)}`);
  assert.equal((await runNpmConfig({ cwd: root, args: {} })).status, "error");
  writeFileSync(authNpmrc, "# fixture\n".repeat(501));
  assert.equal((await runNpmConfig({ cwd: root, args: {} })).status, "error");
  writeFileSync(authNpmrc, Buffer.from([0xff, 0xfe]));
  assert.equal((await runNpmConfig({ cwd: root, args: {} })).status, "error");
  writeFileSync(authNpmrc, "strict-ssl=true\n");

  // Outcome C: mh_env_config tool execution & strict allowlist filtering
  assert(ENV_CONFIG_TOOL && typeof ENV_CONFIG_TOOL.run === "function", "mh_env_config tool must be defined");
  const synthEnvSecret = "env_secret_token_12345xyz";
  const envFile = join(root, dotenv);
  const envLocalFile = join(root, `${dotenv}.local`);
  const envBomFile = join(root, `${dotenv}.bom`);

  writeFileSync(envFile, `
# Standard dotenv configuration with various formats
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/mydb
SECRET_TOKEN=${synthEnvSecret}
API_KEY=<insert-api-key-here>
OPTIONAL_VAL=
EMPTY_QUOTED=""
EMPTY_SINGLE=''
export EXPORTED_VAR=exported_value
export EXPORTED_QUOTED="quoted_exported"
PLACEHOLDER_BRACKET=[YOUR_TOKEN]
PLACEHOLDER_BRACE=\${ENV_VAR}
CHANGE_ME=changeme
TODO_ITEM=todo
DUP_KEY=first_assignment
DUP_KEY=second_assignment
COMMENTED_INLINE=val # inline comment here
QUOTED_WITH_HASH="value # not comment" # real comment
`);

  // 1. Success case on default .env
  const envRes = await runEnvConfig({ cwd: root, args: {} });
  assert.equal(envRes.status, "success");
  assert.equal(Array.isArray(envRes.keys), true);
  const envKeyMap = new Map(envRes.keys.map((k) => [k.name, k]));

  // Verify presence & placeholder classifications
  assert.deepEqual(envKeyMap.get("PORT"), { name: "PORT", present: true, placeholder_like: false });
  assert.deepEqual(envKeyMap.get("OPTIONAL_VAL"), { name: "OPTIONAL_VAL", present: false, placeholder_like: false });
  assert.deepEqual(envKeyMap.get("EMPTY_QUOTED"), { name: "EMPTY_QUOTED", present: false, placeholder_like: false });
  assert.deepEqual(envKeyMap.get("EMPTY_SINGLE"), { name: "EMPTY_SINGLE", present: false, placeholder_like: false });
  assert.deepEqual(envKeyMap.get("API_KEY"), { name: "API_KEY", present: true, placeholder_like: true });
  assert.deepEqual(envKeyMap.get("PLACEHOLDER_BRACKET"), { name: "PLACEHOLDER_BRACKET", present: true, placeholder_like: true });
  assert.deepEqual(envKeyMap.get("PLACEHOLDER_BRACE"), { name: "PLACEHOLDER_BRACE", present: true, placeholder_like: true });
  assert.deepEqual(envKeyMap.get("CHANGE_ME"), { name: "CHANGE_ME", present: true, placeholder_like: true });
  assert.deepEqual(envKeyMap.get("TODO_ITEM"), { name: "TODO_ITEM", present: true, placeholder_like: true });
  assert.deepEqual(envKeyMap.get("EXPORTED_VAR"), { name: "EXPORTED_VAR", present: true, placeholder_like: false });
  assert.deepEqual(envKeyMap.get("EXPORTED_QUOTED"), { name: "EXPORTED_QUOTED", present: true, placeholder_like: false });
  assert.deepEqual(envKeyMap.get("COMMENTED_INLINE"), { name: "COMMENTED_INLINE", present: true, placeholder_like: false });
  assert.deepEqual(envKeyMap.get("QUOTED_WITH_HASH"), { name: "QUOTED_WITH_HASH", present: true, placeholder_like: false });

  // Verify last assignment wins: DUP_KEY appears once
  assert.equal(envRes.keys.filter((k) => k.name === "DUP_KEY").length, 1);
  assert.deepEqual(envKeyMap.get("DUP_KEY"), { name: "DUP_KEY", present: true, placeholder_like: false });

  // STRICT SECURITY CHECK: No secret values, snippets, or URLs in ANY output field
  const envOutputStr = JSON.stringify(envRes);
  assert(!envOutputStr.includes(synthEnvSecret), "Secret token must not appear in dotenv output");
  assert(!envOutputStr.includes("3000"), "Port value must not appear in dotenv output");
  assert(!envOutputStr.includes("postgres://"), "Database URL must not appear in dotenv output");
  assert(!envOutputStr.includes("password"), "Password must not appear in dotenv output");
  assert(!envOutputStr.includes("first_assignment"), "Value snippet must not appear in dotenv output");
  assert(!envOutputStr.includes("second_assignment"), "Value snippet must not appear in dotenv output");
  assert(!envOutputStr.includes("exported_value"), "Exported value must not appear in dotenv output");
  assert(!envOutputStr.includes("not comment"), "Quoted content must not appear in dotenv output");

  // 2. Explicit basename .env.<suffix>
  writeFileSync(envLocalFile, "LOCAL_KEY=local_val\n");
  const envLocalRes = await runEnvConfig({ cwd: root, args: { path: `${dotenv}.local` } });
  assert.equal(envLocalRes.status, "success");
  assert.deepEqual(envLocalRes.keys, [{ name: "LOCAL_KEY", present: true, placeholder_like: false }]);

  // 3. UTF-8 BOM and CRLF handling
  writeFileSync(envBomFile, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("BOM_KEY=bom_val\r\nCRLF_KEY=crlf_val\r\n")]));
  const envBomRes = await runEnvConfig({ cwd: root, args: { path: `${dotenv}.bom` } });
  assert.equal(envBomRes.status, "success");
  assert.deepEqual(envBomRes.keys.map((k) => k.name).sort(), ["BOM_KEY", "CRLF_KEY"]);

  // 4. Cross-format path rejection & invalid basename
  const envCrossNpm = await runEnvConfig({ cwd: root, args: { path: npmAuth } });
  assert.equal(envCrossNpm.status, "error");
  assert(envCrossNpm.error.includes("basename"));
  const envCrossPypi = await runEnvConfig({ cwd: root, args: { path: ".pypirc" } });
  assert.equal(envCrossPypi.status, "error");
  assert(envCrossPypi.error.includes("basename"));
  const envBadSuffix = await runEnvConfig({ cwd: root, args: { path: "other.env" } });
  assert.equal(envBadSuffix.status, "error");
  assert(envBadSuffix.error.includes("basename"));

  // 5. Malformed lines fail closed generically with NO secret leakage in error
  const malformedDotenv = join(root, `${dotenv}.malformed`);
  writeFileSync(malformedDotenv, `KEY_BEFORE=1\nMALFORMED_LINE_WITHOUT_EQUALS_${synthEnvSecret}\n`);
  const malformedRes = await runEnvConfig({ cwd: root, args: { path: `${dotenv}.malformed` } });
  assert.equal(malformedRes.status, "error");
  assert(!malformedRes.error.includes(synthEnvSecret), "Malformed error must not leak line contents");
  assert(!JSON.stringify(malformedRes).includes(synthEnvSecret));

  writeFileSync(malformedDotenv, `KEY="unclosed_quote_${synthEnvSecret}\n`);
  const unclosedRes = await runEnvConfig({ cwd: root, args: { path: `${dotenv}.malformed` } });
  assert.equal(unclosedRes.status, "error");
  assert(!unclosedRes.error.includes(synthEnvSecret));

  writeFileSync(malformedDotenv, `KEY=val\\\n`);
  const contDotenvRes = await runEnvConfig({ cwd: root, args: { path: `${dotenv}.malformed` } });
  assert.equal(contDotenvRes.status, "error");
  assert(contDotenvRes.error.includes("continuation"));

  writeFileSync(malformedDotenv, `KEY-WITH-DASH=1\n`);
  const badKeyRes = await runEnvConfig({ cwd: root, args: { path: `${dotenv}.malformed` } });
  assert.equal(badKeyRes.status, "error");

  // 6. Symlink refusal
  const symlinkEnv = join(root, `${dotenv}.symlink`);
  symlinkSync(envFile, symlinkEnv);
  const symlinkEnvRes = await runEnvConfig({ cwd: root, args: { path: `${dotenv}.symlink` } });
  assert.equal(symlinkEnvRes.status, "error");
  assert(symlinkEnvRes.error.includes("symbolic link"));

  // 7. Non-regular file
  const dirEnv = join(root, "dir-env", dotenv);
  mkdirSync(dirEnv, { recursive: true });
  const dirEnvRes = await runEnvConfig({ cwd: root, args: { path: `dir-env/${dotenv}` } });
  assert.equal(dirEnvRes.status, "error");
  assert.equal(dirEnvRes.error, "Target is not a regular file.");

  // 8. Cancellation / abort
  const abortCtrlEnv = new AbortController();
  abortCtrlEnv.abort();
  const abortedEnvRes = await runEnvConfig({ cwd: root, signal: abortCtrlEnv.signal });
  assert.equal(abortedEnvRes.status, "error");
  assert(abortedEnvRes.error.includes("aborted"));

  // 9. No caching / state poisoning: overwrite same path
  writeFileSync(envFile, "FRESH_KEY=fresh_val\n");
  const rerunEnvRes = await runEnvConfig({ cwd: root, args: {} });
  assert.equal(rerunEnvRes.status, "success");
  assert.deepEqual(rerunEnvRes.keys, [{ name: "FRESH_KEY", present: true, placeholder_like: false }]);

  // Independent QA counterexamples: comment prose is never a value.
  writeFileSync(envFile, "EMPTY= # comment\nNO_SPACE=#comment\nCOMMENT_QUOTES=# user's \"comment\"\nQUOTED=\"#literal\"\nSINGLE='#literal'\n");
  const commentsEnvRes = await runEnvConfig({ cwd: root, args: {} });
  assert.equal(commentsEnvRes.status, "success");
  assert.deepEqual(commentsEnvRes.keys, [
    { name: "EMPTY", present: false, placeholder_like: false },
    { name: "NO_SPACE", present: false, placeholder_like: false },
    { name: "COMMENT_QUOTES", present: false, placeholder_like: false },
    { name: "QUOTED", present: true, placeholder_like: false },
    { name: "SINGLE", present: true, placeholder_like: false },
  ]);

  // Outcome C: mh_pypi_config tool execution & strict allowlist filtering
  assert(PYPI_CONFIG_TOOL && typeof PYPI_CONFIG_TOOL.run === "function", "mh_pypi_config tool must be defined");
  const synthPypiSecret = "pypi_token_98765secretxyz";
  const pypiFile = join(root, ".pypirc");

  writeFileSync(pypiFile, `
[distutils]
index-servers =
    pypi
    testpypi
    internal-repo

[pypi]
repository = https://upload.pypi.org/legacy/
username = __token__
password = ${synthPypiSecret}

[testpypi]
repository = "https://test.pypi.org/legacy/"
username = testuser
password = testpass

[internal-repo]
repository = https://user:pass@internal.pkg.example.com:8443/simple?token=${synthPypiSecret}#hash
token = ${synthPypiSecret}
custom_setting = unvalidated_value
`);

  // 1. Success case on .pypirc
  const pypiRes = await runPypiConfig({ cwd: root, args: {} });
  assert.equal(pypiRes.status, "success");
  assert.deepEqual(pypiRes.index_servers, ["pypi", "testpypi", "internal-repo"]);
  assert.equal(pypiRes.repositories.pypi.repository, "https://upload.pypi.org");
  assert.equal(pypiRes.repositories.testpypi.repository, "https://test.pypi.org");
  assert.equal(pypiRes.repositories["internal-repo"].repository, "https://internal.pkg.example.com:8443");
  assert(pypiRes.redacted_count >= 5);
  assert(pypiRes.redacted_reasons.includes("credential_key"));
  assert(pypiRes.redacted_reasons.includes("unrecognized_setting"));

  // STRICT SECURITY CHECK: No secret tokens, credentials, or URL query/paths in output
  const pypiOutputStr = JSON.stringify(pypiRes);
  assert(!pypiOutputStr.includes(synthPypiSecret), "Token must not appear in .pypirc output");
  assert(!pypiOutputStr.includes("testuser"), "Userinfo must not appear in .pypirc output");
  assert(!pypiOutputStr.includes("testpass"), "Password must not appear in .pypirc output");
  assert(!pypiOutputStr.includes("unvalidated_value"), "Unknown setting must not appear in .pypirc output");
  assert(!pypiOutputStr.includes("/legacy/"), "URL path must not appear in .pypirc output");
  assert(!pypiOutputStr.includes("/simple"), "URL path must not appear in .pypirc output");
  assert(!pypiOutputStr.includes("token="), "URL query must not appear in .pypirc output");
  assert(!pypiOutputStr.includes("#hash"), "URL hash must not appear in .pypirc output");

  // This entire suite is an isolated Node process. Runtime-owned builtins must
  // remain unchanged even when repository section names collide with them.
  const protectedObjects = [Object.prototype, Object, Object.prototype.toString, Object.prototype.valueOf];
  const beforeRepositoryDescriptors = protectedObjects.map((value) => Object.getOwnPropertyDescriptor(value, "repository"));
  for (const section of ["__proto__", "constructor", "toString", "valueOf", "normal_repo"]) {
    writeFileSync(pypiFile, `[${section}]\nrepository=https://probe.example.com/private\npassword=${synthPypiSecret}\n`);
    const collisionRes = await runPypiConfig({ cwd: root, args: {} });
    assert.equal(collisionRes.status, "success");
    assert(Object.hasOwn(collisionRes.repositories, section), "each section is an own profile, never an inherited builtin");
    assert.equal(collisionRes.repositories[section].repository, "https://probe.example.com");
    assert(!JSON.stringify(collisionRes).includes(synthPypiSecret));
    assert.deepEqual(protectedObjects.map((value) => Object.getOwnPropertyDescriptor(value, "repository")), beforeRepositoryDescriptors);
    assert(Object.hasOwn(JSON.parse(JSON.stringify(collisionRes)).repositories, section));
  }

  // 2. Inline index-servers and duplicate section/key updates (last assignment wins)
  writeFileSync(pypiFile, `
[distutils]
index-servers = pypi, other
[pypi]
repository = https://first.pypi.org
repository = https://second.pypi.org
`);
  const dupPypiRes = await runPypiConfig({ cwd: root, args: {} });
  assert.equal(dupPypiRes.status, "success");
  assert.deepEqual(dupPypiRes.index_servers, ["pypi", "other"]);
  assert.equal(dupPypiRes.repositories.pypi.repository, "https://second.pypi.org");

  // 3. Cross-format path rejection & exact basename
  const pypiCrossNpm = await runPypiConfig({ cwd: root, args: { path: npmAuth } });
  assert.equal(pypiCrossNpm.status, "error");
  assert(pypiCrossNpm.error.includes("basename"));
  const pypiCrossEnv = await runPypiConfig({ cwd: root, args: { path: dotenv } });
  assert.equal(pypiCrossEnv.status, "error");
  assert(pypiCrossEnv.error.includes("basename"));
  const pypiBadName = await runPypiConfig({ cwd: root, args: { path: "other.pypirc" } });
  assert.equal(pypiBadName.status, "error");
  assert(pypiBadName.error.includes("basename"));

  // 4. Malformed INI structures fail closed generically without secret echoes
  const malformedPypi = join(root, "malformed-dir", ".pypirc");
  mkdirSync(join(root, "malformed-dir"), { recursive: true });
  writeFileSync(malformedPypi, `key_before_section = ${synthPypiSecret}\n[pypi]\n`);
  const noSecRes = await runPypiConfig({ cwd: root, args: { path: "malformed-dir/.pypirc" } });
  assert.equal(noSecRes.status, "error");
  assert(!noSecRes.error.includes(synthPypiSecret), "Error must not leak values");

  writeFileSync(malformedPypi, `[bad section header with space ${synthPypiSecret}]\nkey=1\n`);
  const badSecRes = await runPypiConfig({ cwd: root, args: { path: "malformed-dir/.pypirc" } });
  assert.equal(badSecRes.status, "error");
  assert(!badSecRes.error.includes(synthPypiSecret));

  writeFileSync(malformedPypi, `[pypi]\nrepository = \\\nhttps://upload.pypi.org\n`);
  const contPypiRes = await runPypiConfig({ cwd: root, args: { path: "malformed-dir/.pypirc" } });
  assert.equal(contPypiRes.status, "error");
  assert(contPypiRes.error.includes("continuation"));

  writeFileSync(malformedPypi, `[pypi]\nmalformed_line_no_delimiter_${synthPypiSecret}\n`);
  const noDelimRes = await runPypiConfig({ cwd: root, args: { path: "malformed-dir/.pypirc" } });
  assert.equal(noDelimRes.status, "error");
  assert(!noDelimRes.error.includes(synthPypiSecret));

  // 5. Symlink refusal
  const symlinkPypi = join(root, "symlink-pypi", ".pypirc");
  mkdirSync(join(root, "symlink-pypi"), { recursive: true });
  symlinkSync(pypiFile, symlinkPypi);
  const symlinkPypiRes = await runPypiConfig({ cwd: root, args: { path: "symlink-pypi/.pypirc" } });
  assert.equal(symlinkPypiRes.status, "error");
  assert(symlinkPypiRes.error.includes("symbolic link"));

  // 6. Non-regular file
  const dirPypi = join(root, "dir-pypi", ".pypirc");
  mkdirSync(dirPypi, { recursive: true });
  const dirPypiRes = await runPypiConfig({ cwd: root, args: { path: "dir-pypi/.pypirc" } });
  assert.equal(dirPypiRes.status, "error");
  assert.equal(dirPypiRes.error, "Target is not a regular file.");

  // 7. Cancellation / abort
  const abortCtrlPypi = new AbortController();
  abortCtrlPypi.abort();
  const abortedPypiRes = await runPypiConfig({ cwd: root, signal: abortCtrlPypi.signal });
  assert.equal(abortedPypiRes.status, "error");
  assert(abortedPypiRes.error.includes("aborted"));

  // 8. No caching / state poisoning
  writeFileSync(pypiFile, "[distutils]\nindex-servers = clean\n[clean]\nrepository = https://clean.org\n");
  const cleanPypiRes = await runPypiConfig({ cwd: root, args: {} });
  assert.equal(cleanPypiRes.status, "success");
  assert.equal(cleanPypiRes.redacted_count, 0);
  assert.deepEqual(cleanPypiRes.index_servers, ["clean"]);

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

  // Lifecycle with permissions-only capability
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

  // Lifecycle with both permissions and tools capabilities (guard 1 permission + 3 tools = 4)
  let dualRegistrations = 0, dualUnregistrations = 0;
  const registeredTools = [];
  const dualHost = (signal) => ({
    signal,
    capabilities: { permissions: true, tools: true },
    permissions: { register() { dualRegistrations++; return () => { dualUnregistrations++; }; } },
    tools: { register(def) { dualRegistrations++; registeredTools.push(def); return () => { dualUnregistrations++; }; } },
    diagnostics: { report() {} },
  });
  const dualController = new AbortController();
  const dualCleanup = activate(dualHost(dualController.signal));
  assert.equal(dualRegistrations, 4, "Both permission overlay and all three tools must be registered");
  assert.deepEqual(registeredTools.map((t) => t.name).sort(), ["mh_env_config", "mh_npm_config", "mh_pypi_config"]);
  const toolPendings = registeredTools.map((t) => t.run({ cwd: root, args: {} }));
  dualCleanup();
  assert.equal(dualUnregistrations, 4, "Normal cleanup must unregister all four entries");
  for (const pendingRun of toolPendings) {
    assert.equal((await pendingRun).status, "error", "disposal cancels in-flight inspection");
  }
  for (const t of registeredTools) {
    assert.equal((await t.run({ cwd: root, args: {} })).status, "error", "captured callback fails closed after disposal");
  }

  const abortedDualCleanup = activate(dualHost(dualController.signal));
  dualController.abort();
  abortedDualCleanup();
  assert.equal(dualUnregistrations, 4, "Engine-aborted reload cleanup must skip redundant unregister publishes");

  // Cross-instance independence: no shared disposed state
  const registeredA = [];
  const registeredB = [];
  const hostA = {
    signal: new AbortController().signal,
    capabilities: { permissions: true, tools: true },
    permissions: { register() { return () => {}; } },
    tools: { register(def) { registeredA.push(def); return () => {}; } },
    diagnostics: { report() {} },
  };
  const hostB = {
    signal: new AbortController().signal,
    capabilities: { permissions: true, tools: true },
    permissions: { register() { return () => {}; } },
    tools: { register(def) { registeredB.push(def); return () => {}; } },
    diagnostics: { report() {} },
  };
  const cleanupA = activate(hostA);
  const cleanupB = activate(hostB);
  cleanupA();
  for (const t of registeredB) {
    const res = await t.run({ cwd: root, args: {} });
    assert.notEqual(res.error, "Operation aborted.", "disposing instance A must not affect instance B");
  }
  cleanupB();

  // Partial registration failure cleans prior registrations and checker
  let regCount = 0;
  let unregCount = 0;
  const failingHost = {
    capabilities: { permissions: true, tools: true },
    permissions: { register() { regCount++; return () => { unregCount++; }; } },
    tools: {
      register(def) {
        if (def.name === "mh_env_config") {
          throw new Error("synthetic registration failure");
        }
        regCount++;
        return () => { unregCount++; };
      },
    },
    diagnostics: { report() {} },
  };
  let failed = false;
  try {
    activate(failingHost);
  } catch (err) {
    failed = true;
    assert(err.message.includes("synthetic registration failure"));
  }
  assert(failed, "partial registration error must rethrow");
  assert.equal(regCount, unregCount, "all prior registrations must be cleaned up on partial failure");

  assert.equal(POLICY.includes("CCC_"), false);
  assert.equal(CHECKER_TIMEOUT_MS, 10_000);
  console.log(`Secret-read guard valid: ${checked} synthetic decisions, final-args phases, aliases, exceptions, failure/abort/cleanup. Not real-host Main/subagent coverage.`);
} finally {
  checker.dispose();
  rmSync(root, { recursive: true, force: true });
}
