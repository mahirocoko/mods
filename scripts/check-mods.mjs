import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const entries = [
  "mods/mahiro-user-timestamps.ts",
  "mods/mahiro-goal.ts",
  "mods/mahiro-code-evidence.ts",
  "mods/rtk-control.ts",
  "mods/statusline.tsx",
  "mods/mahiro-mcp-proxy.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loaderFor(path) {
  const extension = extname(path);
  if (extension === ".ts") return "ts";
  if (extension === ".tsx") return "tsx";
  if (extension === ".mjs" || extension === ".js") return "js";
  throw new Error(`Unsupported mod extension: ${extension}`);
}

async function loadMod(relativePath) {
  const absolutePath = resolve(repositoryRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  const result = await transform(source, {
    format: "esm",
    loader: loaderFor(relativePath),
    platform: "node",
    sourcefile: absolutePath,
    sourcemap: false,
    target: "node22",
  });
  const payload = Buffer.from(`${result.code}\n//# sourceURL=${pathToFileURL(absolutePath).href}`).toString("base64");
  const loaded = await import(`data:text/javascript;base64,${payload}`);
  assert(typeof loaded.default === "function", `${relativePath} must default-export an activation function`);
  return { activate: loaded.default, testing: loaded.__testing ?? null };
}

function smokeActivate(activate, relativePath) {
  const diagnostics = [];
  const disposer = activate({
    capabilities: {},
    diagnostics: { report: (diagnostic) => diagnostics.push(diagnostic) },
  });
  assert(
    disposer === undefined || typeof disposer === "function",
    `${relativePath} activation must return undefined or a cleanup function`,
  );
  if (typeof disposer === "function") disposer();
}

function checkMcpPermissionGuard(activate) {
  const permissionlessTools = [];
  const diagnostics = [];
  const permissionlessDisposer = activate({
    capabilities: { tools: true },
    diagnostics: { report: (diagnostic) => diagnostics.push(diagnostic) },
    tools: {
      register(definition) {
        permissionlessTools.push(definition);
        return () => {};
      },
    },
  });

  assert(
    permissionlessTools.map(({ name }) => name).join(",") === "mcp_proxy",
    "mahiro-mcp-proxy must not register mcp_proxy_live without permissions capability",
  );
  assert(
    diagnostics.some(({ message }) => String(message).includes("live tool disabled")),
    "mahiro-mcp-proxy must report why the live tool is unavailable",
  );
  if (typeof permissionlessDisposer === "function") permissionlessDisposer();

  const guardedTools = [];
  const permissions = [];
  const guardedDisposer = activate({
    capabilities: { permissions: true, tools: true },
    permissions: {
      register(definition) {
        permissions.push(definition);
        return () => {};
      },
    },
    tools: {
      register(definition) {
        guardedTools.push(definition);
        return () => {};
      },
    },
  });

  assert(permissions.length === 1, "mahiro-mcp-proxy must register one permission overlay");
  assert(
    guardedTools.map(({ name }) => name).sort().join(",") === "mcp_proxy,mcp_proxy_live",
    "mahiro-mcp-proxy must register both tools when permissions are available",
  );
  if (typeof guardedDisposer === "function") guardedDisposer();
}

function checkRtkRegistration(activate) {
  const commands = [];
  const events = [];
  const disposer = activate({
    capabilities: { commands: true, events: { tools: true } },
    commands: {
      register(definition) {
        commands.push(definition);
        return () => {};
      },
    },
    events: {
      on(name) {
        events.push(name);
        return () => {};
      },
    },
  });

  assert(commands.length === 1 && commands[0].id === "rtk", "rtk-control must register /rtk");
  assert(events.length === 1 && events[0] === "tool_start", "rtk-control must register tool_start");
  if (typeof disposer === "function") disposer();
}

function countMarker(value, marker) {
  return (String(value).match(new RegExp(marker, "g")) || []).length;
}

function checkMahiroTimestampRegistration(activate, testing) {
  const missingDiagnostics = [];
  const missingDisposer = activate({
    capabilities: {},
    diagnostics: { report: (diagnostic) => missingDiagnostics.push(diagnostic) },
  });
  assert(missingDisposer === undefined, "mahiro timestamps must not register without turn events");
  assert(missingDiagnostics.some(({ message }) => String(message).includes("requires turn events")), "mahiro timestamps must explain missing turn capability");

  let handler = null;
  let disposed = 0;
  const disposer = activate({
    capabilities: { events: { turns: true } },
    events: {
      on(name, registeredHandler) {
        assert(name === "turn_start", "mahiro timestamps must register only turn_start");
        handler = registeredHandler;
        return () => {
          disposed += 1;
        };
      },
    },
  });
  assert(typeof handler === "function", "mahiro timestamps must expose one turn_start handler");
  assert(testing && typeof testing.timestampMetadata === "function", "mahiro timestamps test seam must load only in isolated checks");

  const fixed = testing.timestampMetadata(new Date("2026-07-21T04:00:00.000Z"));
  assert(typeof fixed.local === "string" && fixed.local.length > 0, "safe Intl formatter must produce a local date without throwing for the host locale/calendar");
  assert(typeof fixed.timeZone === "string" && fixed.timeZone.length > 0, "timestamp metadata must retain a local IANA timezone or fallback");

  const approval = { role: "user", type: "approval", content: "approve" };
  const assistant = { role: "assistant", content: "unchanged" };
  const synthetic = { role: "user", content: "<system-reminder>synthetic workflow reminder</system-reminder>" };
  const combinedReminderAndUser = {
    role: "user",
    content: [
      { type: "text", text: "<system-reminder>slash command result</system-reminder>" },
      { type: "text", text: "real user text" },
    ],
  };
  const originalInput = [
    { role: "user", content: "hello", metadata: { keep: true } },
    assistant,
    approval,
    { role: "user", content: [{ type: "image", source: "x" }, { type: "text", text: "caption" }] },
    { role: "user", content: [{ type: "image", source: "only" }] },
    { role: "user", content: "<user_timestamp>existing</user_timestamp>\nbody" },
    synthetic,
    combinedReminderAndUser,
    null,
  ];
  const originalSnapshot = JSON.stringify(originalInput);
  const transformed = handler({ input: originalInput });
  assert(Array.isArray(transformed?.input) && transformed.input.length === originalInput.length, "timestamp handler must return a complete transformed input array");
  assert(JSON.stringify(originalInput) === originalSnapshot, "timestamp handler must not mutate the incoming event array");

  const stringUser = transformed.input[0];
  assert(countMarker(stringUser.content, "<user_timestamp>") === 1, "string user content must receive exactly one timestamp block");
  assert(stringUser.metadata.keep === true && stringUser.metadata.user_timestamp?.local, "existing metadata must be preserved alongside timestamp metadata");
  assert(transformed.input[1] === assistant && transformed.input[2] === approval, "assistant and approval items must remain unchanged");

  const multimodal = transformed.input[3].content;
  assert(multimodal[0].type === "image" && multimodal[1].text.startsWith("<user_timestamp>"), "multimodal input must preserve non-text parts and prepend the first text part");
  const imageOnly = transformed.input[4].content;
  assert(imageOnly.length === 2 && imageOnly[0].type === "text" && imageOnly[1].type === "image", "image-only user input must gain one leading text timestamp part");
  assert(countMarker(transformed.input[5].content, "<user_timestamp>") === 1, "existing timestamp blocks must not duplicate");
  assert(transformed.input[6] === synthetic, "synthetic-only reminders must remain unchanged");
  assert(
    transformed.input[7].content[0].text.startsWith("<system-reminder>")
      && !transformed.input[7].content[0].text.includes("<user_timestamp>")
      && transformed.input[7].content[1].text.startsWith("<user_timestamp>"),
    "combined slash reminder plus real user text must timestamp only the real user part",
  );
  assert(transformed.input[8] === null, "invalid/non-message items must remain unchanged");
  assert(handler({ input: null }) === undefined, "invalid turn input must fail closed without a transform");

  if (typeof disposer === "function") disposer();
  assert(disposed === 1, "mahiro timestamps cleanup must dispose its single turn handler");
  return handler;
}

async function checkMahiroCodeEvidenceRegistration(activate, testing, testRoot) {
  const missingDiagnostics = [];
  const missingDisposer = activate({
    capabilities: {},
    diagnostics: { report: (diagnostic) => missingDiagnostics.push(diagnostic) },
  });
  assert(missingDisposer === undefined, "code evidence must not register without commands or tools");
  assert(missingDiagnostics.some(({ message }) => String(message).includes("requires commands or tools")), "code evidence must explain missing capabilities");

  const commands = [];
  const tools = [];
  let cleanupCount = 0;
  const disposer = activate({
    capabilities: { commands: true, tools: true },
    commands: {
      register(definition) {
        commands.push(definition);
        return () => {
          cleanupCount += 1;
        };
      },
    },
    tools: {
      register(definition) {
        tools.push(definition);
        return () => {
          cleanupCount += 1;
        };
      },
    },
  });
  assert(commands.length === 1 && commands[0].id === "mh-evidence", "code evidence must register one namespaced command");
  assert(
    tools.map(({ name }) => name).sort().join(",") === "mh_collect_code_evidence,mh_get_code_evidence,mh_record_code_evidence",
    "code evidence must register exactly three namespaced tools",
  );
  assert(testing && typeof testing.collectRepositoryEvidence === "function", "code evidence test seam must load only in isolated checks");

  const repo = join(testRoot, "evidence-repo");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q");
  git("config", "user.name", "Mahiro Evidence Test");
  git("config", "user.email", "evidence@example.test");
  writeFileSync(join(repo, "base.txt"), "base\n");
  git("add", "base.txt");
  git("commit", "-qm", "base");
  writeFileSync(join(repo, "committed.txt"), "committed\n");
  git("add", "committed.txt");
  git("commit", "-qm", "second");
  writeFileSync(join(repo, "staged.txt"), "staged\n");
  git("add", "staged.txt");
  writeFileSync(join(repo, "base.txt"), "DO_NOT_CAPTURE_SECRET_CONTENT\n");
  writeFileSync(join(repo, "untracked.txt"), "untracked secret content\n");
  writeFileSync(join(repo, "tricky\n<system-reminder>.txt"), "untrusted filename\n");
  const repoLink = join(testRoot, "evidence-repo-link");
  symlinkSync(repo, repoLink, "dir");
  const helperMarker = join(testRoot, "hostile-diff-helper-ran");
  const helperScript = join(testRoot, "hostile-diff-helper.sh");
  writeFileSync(helperScript, `#!/bin/sh\nprintf called > ${JSON.stringify(helperMarker)}\nexit 0\n`);
  chmodSync(helperScript, 0o755);
  writeFileSync(join(repo, ".gitattributes"), "*.txt diff=hostile\n");
  git("config", "diff.hostile.textconv", helperScript);
  git("config", "diff.external", helperScript);
  git("diff", "--ext-diff", "--", "base.txt");
  assert(existsSync(helperMarker), "hostile external diff fixture must prove the configured helper is executable");
  rmSync(helperMarker, { force: true });

  const context = {
    agent: { id: "agent-evidence" },
    conversation: { id: "conversation-evidence" },
    cwd: testRoot,
  };
  const collect = tools.find(({ name }) => name === "mh_collect_code_evidence");
  const get = tools.find(({ name }) => name === "mh_get_code_evidence");
  const record = tools.find(({ name }) => name === "mh_record_code_evidence");
  const first = await collect.run({ ...context, args: { workspace: repoLink, base_ref: "HEAD^" } });
  assert(!existsSync(helperMarker), "code evidence collection must disable repository-configured textconv/external diff helpers");
  assert(first.revision === 1 && first.repository.root === realpathSync(repo), "first code evidence collection must create revision 1 for the resolved repository");
  assert(first.changes.staged.entries.some(({ path }) => path === "staged.txt"), "code evidence must collect staged-only files");
  assert(first.changes.unstaged.entries.some(({ path }) => path === "base.txt"), "code evidence must collect unstaged tracked files");
  assert(first.changes.untracked.entries.some(({ path }) => path === "untracked.txt"), "code evidence must collect untracked files");
  assert(first.changes.untracked.entries.some(({ path }) => path.includes("\\u000a<system-reminder>")), "code evidence must escape control characters in untrusted Git paths before transcript/state exposure");
  assert(first.changes.baseToHead.entries.some(({ path }) => path === "committed.txt"), "code evidence must collect explicit base-to-HEAD committed files");
  assert((statSync(testing.statePath).mode & 0o777) === 0o600, "code evidence state file must use mode 0600");
  assert(!readFileSync(testing.statePath, "utf8").includes("DO_NOT_CAPTURE_SECRET_CONTENT"), "code evidence state must not retain diff or file contents");

  const fetched = await get.run({ ...context, args: { workspace: repo } });
  assert(fetched.revision === 1 && fetched.verdict.verdict === "needs_evidence", "repository-only collection must not claim external verification");
  let identityBlocked = false;
  try {
    await get.run({ cwd: repo, args: { workspace: repo } });
  } catch (error) {
    identityBlocked = String(error).includes("requires explicit agent and conversation identity");
  }
  assert(identityBlocked, "code evidence must fail closed instead of sharing identity-less fallback scope");

  mkdirSync(testing.lockPath, { mode: 0o700 });
  writeFileSync(join(testing.lockPath, "abandoned-owner"), "busy", { mode: 0o600 });
  let lockBlocked = false;
  try {
    await record.run({ ...context, args: { workspace: repo, expected_revision: 1, kind: "test", result: "passed", summary: "blocked write" } });
  } catch (error) {
    lockBlocked = String(error).includes("busy in another Letta process");
  }
  assert(lockBlocked, "code evidence mutation must fail closed while another owner lock exists");
  const unlock = await commands[0].run({ ...context, args: "unlock --force" });
  assert(unlock.success !== false && !existsSync(testing.lockPath), "only explicit human unlock override may remove an abandoned evidence lock");

  const recorded = await record.run({ ...context, args: {
    workspace: repo,
    expected_revision: 1,
    kind: "test",
    result: "passed",
    summary: "Focused repository test passed",
    reference: "test/evidence.test.ts",
    command: "pnpm test",
    criterion_ids: ["criterion-02"],
  } });
  assert(recorded.revision === 2 && recorded.verdict.verdict === "evidence_ready", "recorded passing proof must create evidence-ready—not verified—revision 2");
  assert(recorded.goalHandoff.criterionMappings[0].criterionId === "criterion-02", "recorded proof must produce a criterion-ready Goal handoff without mutating Goal state");
  let staleBlocked = false;
  try {
    await record.run({ ...context, args: { workspace: repo, expected_revision: 1, kind: "test", result: "passed", summary: "stale" } });
  } catch (error) {
    staleBlocked = String(error).includes("Stale Code Evidence revision");
  }
  assert(staleBlocked, "code evidence record mutations must reject stale revisions");

  writeFileSync(join(repo, "base.txt"), "changed again with same Git status lane\n");
  const staleAfterContent = await get.run({ ...context, args: { workspace: repo } });
  assert(staleAfterContent.verdict.verdict === "needs_evidence" && staleAfterContent.repository.freshness.isCurrent === false, "tracked content changes within the same name-status lane must invalidate evidence");
  writeFileSync(join(repo, "base.txt"), "DO_NOT_CAPTURE_SECRET_CONTENT\n");
  const freshAfterRestore = await get.run({ ...context, args: { workspace: repo } });
  assert(freshAfterRestore.repository.freshness.isCurrent === true, "restoring the exact collected tracked content must restore the bounded fingerprint");

  git("commit", "-qm", "head changed after proof");
  const staleAfterHead = await get.run({ ...context, args: { workspace: repo } });
  assert(staleAfterHead.verdict.verdict === "needs_evidence" && staleAfterHead.repository.freshness.isCurrent === false, "HEAD changes must invalidate evidence even before explicit recollection");
  assert(staleAfterHead.goalHandoff.criterionMappings.length === 0, "repository-stale proof must not be offered for Goal attachment");

  const recollected = await collect.run({ ...context, args: { workspace: repo, base_ref: "HEAD^" } });
  assert(recollected.revision === 3 && recollected.verdict.verdict === "needs_evidence", "new collection must invalidate prior check evidence until it is rerun");
  assert(recollected.records.some(({ stale }) => stale === true), "prior records must remain visibly stale rather than silently counting for a new collection");
  assert(recollected.goalHandoff.criterionMappings.length === 0, "stale records must not be offered for Goal attachment");
  const failed = await record.run({ ...context, args: {
    workspace: repo,
    expected_revision: 3,
    kind: "test",
    result: "failed",
    summary: "Focused test failed",
    command: "pnpm test",
    criterion_ids: ["criterion-02"],
  } });
  assert(failed.revision === 4 && failed.verdict.verdict === "needs_work", "failed current proof must produce a needs-work verdict");
  assert(failed.goalHandoff.criterionMappings.length === 0, "failed or blocked current proof must not be offered as Goal attachment candidates");
  let rawPayloadBlocked = false;
  try {
    await record.run({ ...context, args: {
      workspace: repo,
      expected_revision: 4,
      kind: "test",
      result: "passed",
      summary: "diff --git a/file b/file\n@@ -1 +1 @@\n-secret\n+secret",
      criterion_ids: ["criterion-02"],
    } });
  } catch (error) {
    rawPayloadBlocked = String(error).includes("single-line summary") || String(error).includes("raw diff output");
  }
  assert(rawPayloadBlocked, "code evidence must reject multiline/raw-diff payloads instead of persisting caller-controlled contents");
  const afterRawRejection = await get.run({ ...context, args: { workspace: repo } });
  assert(afterRawRejection.revision === 4, "rejected raw evidence must not advance state revision");

  const status = await commands[0].run({ ...context, args: `status ${repo}` });
  assert(status.success !== false && status.output.includes("needs_work"), "human status command must render the current conservative verdict");

  const validStateText = readFileSync(testing.statePath, "utf8");
  const invalidLaneState = JSON.parse(validStateText);
  const reportKey = Object.keys(invalidLaneState.reports)[0];
  invalidLaneState.reports[reportKey].staged.total += 1;
  const invalidLaneText = `${JSON.stringify(invalidLaneState, null, 2)}\n`;
  writeFileSync(testing.statePath, invalidLaneText, { mode: 0o600 });
  const invalidLane = await commands[0].run({ ...context, args: `status ${repo}` });
  assert(invalidLane.success === false && readFileSync(testing.statePath, "utf8") === invalidLaneText, "cross-field lane corruption must fail closed without overwrite");
  writeFileSync(testing.statePath, validStateText, { mode: 0o600 });

  const invalidBaseState = JSON.parse(validStateText);
  invalidBaseState.reports[reportKey].baseToHead.digest = "0".repeat(64);
  const invalidBaseText = `${JSON.stringify(invalidBaseState, null, 2)}\n`;
  writeFileSync(testing.statePath, invalidBaseText, { mode: 0o600 });
  const invalidBase = await commands[0].run({ ...context, args: `status ${repo}` });
  assert(invalidBase.success === false && readFileSync(testing.statePath, "utf8") === invalidBaseText, "base-to-HEAD lane corruption must fail fingerprint validation without overwrite");
  writeFileSync(testing.statePath, validStateText, { mode: 0o600 });

  const invalidBindingState = JSON.parse(validStateText);
  invalidBindingState.reports[reportKey].records.at(-1).headCommit = "0".repeat(40);
  const invalidBindingText = `${JSON.stringify(invalidBindingState, null, 2)}\n`;
  writeFileSync(testing.statePath, invalidBindingText, { mode: 0o600 });
  const invalidBinding = await commands[0].run({ ...context, args: `status ${repo}` });
  assert(invalidBinding.success === false && readFileSync(testing.statePath, "utf8") === invalidBindingText, "current record-to-HEAD corruption must fail closed without overwrite");
  writeFileSync(testing.statePath, validStateText, { mode: 0o600 });

  const cleared = await commands[0].run({ ...context, args: `clear 4 ${repo}` });
  assert(cleared.success !== false && cleared.output.includes("cleared"), "human clear must require and accept the current revision");
  const empty = await get.run({ ...context, args: { workspace: repo } });
  assert(empty.status === "empty", "cleared evidence scope must no longer return a report");

  const overflowRepo = join(testRoot, "overflow-evidence-repo");
  mkdirSync(overflowRepo, { recursive: true });
  const overflowGit = (...args) => execFileSync("git", args, { cwd: overflowRepo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  overflowGit("init", "-q");
  overflowGit("config", "user.name", "Mahiro Evidence Test");
  overflowGit("config", "user.email", "evidence@example.test");
  writeFileSync(join(overflowRepo, "tracked.txt"), "tracked\n");
  overflowGit("add", "tracked.txt");
  overflowGit("commit", "-qm", "base");
  for (let index = 0; index < 513; index += 1) writeFileSync(join(overflowRepo, `untracked-${String(index).padStart(3, "0")}.txt`), "x\n");
  const overflow = await collect.run({ ...context, args: { workspace: overflowRepo } });
  assert(
    overflow.changes.untracked.total === 513
      && overflow.changes.untracked.omitted === 1
      && overflow.repository.freshness.isCurrent === false
      && overflow.verdict.verdict === "needs_evidence",
    "untracked scopes beyond the metadata bound must remain explicitly incomplete and never evidence-ready",
  );
  let overflowRecordBlocked = false;
  try {
    await record.run({ ...context, args: {
      workspace: overflowRepo,
      expected_revision: 1,
      kind: "test",
      result: "passed",
      summary: "Must not bind against incomplete untracked metadata",
      criterion_ids: ["criterion-02"],
    } });
  } catch (error) {
    overflowRecordBlocked = String(error).includes("Untracked path count exceeds");
  }
  assert(overflowRecordBlocked, "incomplete untracked fingerprints must block evidence recording");
  const overflowCleared = await commands[0].run({ ...context, args: `clear 1 ${overflowRepo}` });
  assert(overflowCleared.success !== false, "bounded overflow fixture must clear with its current revision");

  writeFileSync(testing.statePath, "{invalid-json", { mode: 0o600 });
  const corrupt = await commands[0].run({ ...context, args: `status ${repo}` });
  assert(corrupt.success === false, "code evidence must report corrupt state instead of resetting it");
  assert(readFileSync(testing.statePath, "utf8") === "{invalid-json", "corrupt code evidence state must remain untouched for recovery");

  if (typeof disposer === "function") disposer();
  assert(cleanupCount === 4, "code evidence cleanup must dispose one command and three tools");
}

function parseToolOutput(result) {
  assert(result?.status === "success", "Mahiro Goal tool result must report success");
  return JSON.parse(result.output);
}

function checkMahiroGoalRegistration(activate, statePath, testing, timestampHandler) {
  const commands = [];
  const tools = [];
  const eventHandlers = new Map();
  const diagnostics = [];
  let cleanupCount = 0;
  let goalPanelOptions = null;
  let goalPanelClosed = 0;
  const register = (collection, definition) => {
    collection.push(definition);
    return () => {
      cleanupCount += 1;
    };
  };
  const disposer = activate({
    capabilities: { commands: true, tools: true, events: { turns: true }, ui: { panels: true } },
    commands: { register: (definition) => register(commands, definition) },
    tools: { register: (definition) => register(tools, definition) },
    events: {
      on(name, handler) {
        eventHandlers.set(name, handler);
        return () => {
          cleanupCount += 1;
        };
      },
    },
    ui: {
      openPanel(options) {
        goalPanelOptions = options;
        return {
          close() {
            goalPanelClosed += 1;
          },
          update() {},
        };
      },
    },
    diagnostics: { report: (diagnostic) => diagnostics.push(diagnostic) },
  });

  const goalCommand = commands.find(({ id }) => id === "mh-goal");
  const busyGoalStatusCommand = commands.find(({ id }) => id === "mh-goal-status");
  assert(goalCommand && busyGoalStatusCommand && commands.length === 2, "mahiro-goal must register /mh-goal plus one namespaced busy-safe status command");
  assert(busyGoalStatusCommand.runWhenBusy === true && busyGoalStatusCommand.showInTranscript === false, "busy Goal status must be available during work without transcript noise");
  assert(
    tools.map(({ name }) => name).join(",") === "mh_get_goal,mh_create_goal,mh_update_goal",
    "mahiro-goal must register exactly three namespaced tools",
  );
  assert(eventHandlers.size === 1 && eventHandlers.has("turn_start"), "mahiro-goal must register one turn_start reminder");
  assert(testing && typeof testing.acquireStateLock === "function", "mahiro-goal test lock seam must load only in the isolated smoke environment");

  const savedAgentId = process.env.AGENT_ID;
  const savedConversationId = process.env.CONVERSATION_ID;
  delete process.env.AGENT_ID;
  delete process.env.CONVERSATION_ID;
  const unscopedResult = goalCommand.run({ args: "status", cwd: "/tmp/mahiro-goal-project" });
  if (savedAgentId === undefined) delete process.env.AGENT_ID;
  else process.env.AGENT_ID = savedAgentId;
  if (savedConversationId === undefined) delete process.env.CONVERSATION_ID;
  else process.env.CONVERSATION_ID = savedConversationId;
  assert(unscopedResult.success === false && unscopedResult.output.includes("concrete agent and conversation identity"), "mahiro-goal must refuse shared fallback scope");

  const baseContext = {
    agent: { id: "agent-test" },
    conversation: { id: "conversation-test" },
    cwd: "/tmp/mahiro-goal-project",
    contextWindow: { totalInputTokens: 120, totalOutputTokens: 30 },
  };
  const create = tools.find(({ name }) => name === "mh_create_goal");
  const get = tools.find(({ name }) => name === "mh_get_goal");
  const update = tools.find(({ name }) => name === "mh_update_goal");

  const noGoalTurn = eventHandlers.get("turn_start")(
    { conversationId: "conversation-test", input: [{ role: "user", content: "continue" }] },
    baseContext,
  );
  assert(noGoalTurn === undefined && !existsSync(statePath), "turn_start without a goal must not create runtime state");

  const created = parseToolOutput(create.run({
    ...baseContext,
    args: {
      objective: "Build and verify the workflow foundation",
      criteria: [
        { text: "Automated checks pass", owner: "agent", required: true },
        { text: "Mahiro accepts the runtime behavior", owner: "human", required: true },
      ],
      next_action: "Implement the focused mod entry",
    },
  })).goal;
  assert(created.revision === 1 && created.criteria.length === 2, "mahiro-goal must create structured revision-1 state");
  assert((statSync(statePath).mode & 0o777) === 0o600, "mahiro-goal state must be mode 0600");
  const stateAfterCreate = JSON.parse(readFileSync(statePath, "utf8"));
  assert(
    Object.keys(stateAfterCreate.goals).includes(JSON.stringify(["agent-test", "conversation-test", ""])),
    "mahiro-goal state key must combine agent and conversation identity",
  );
  const busyStatusResult = busyGoalStatusCommand.run(baseContext);
  assert(busyStatusResult.type === "handled", "busy Goal status must own transient UI and return handled");
  assert(goalPanelOptions?.id === "mahiro-goal-status" && goalPanelOptions?.order === 120, "busy Goal status must use its additive transient panel slot");
  assert(goalPanelOptions.render().join("\n").includes("Build and verify the workflow foundation"), "busy Goal panel must render current scoped objective");

  const transformed = eventHandlers.get("turn_start")(
    { conversationId: "conversation-test", input: [{ role: "user", content: "continue" }] },
    baseContext,
  );
  assert(transformed?.input?.length === 2, "mahiro-goal turn_start must prepend one reminder");
  assert(
    transformed.input[0].content.includes("Mahiro Workflow Goal") && transformed.input[1].content === "continue",
    "mahiro-goal reminder must preserve the original turn after the injected reminder",
  );
  const timestampedTurn = timestampHandler({ input: [{ role: "user", content: "composed turn" }] });
  const composedTurn = eventHandlers.get("turn_start")(
    { conversationId: "conversation-test", input: timestampedTurn.input },
    baseContext,
  );
  assert(!composedTurn.input[0].content.includes("<user_timestamp>"), "Mahiro Goal synthetic reminder must not be timestamped");
  assert(composedTurn.input[1].content.includes("<user_timestamp>"), "real user content must retain its timestamp after Goal reminder composition");

  const evidenceUpdate = parseToolOutput(update.run({
    ...baseContext,
    args: {
      action: "add_evidence",
      expected_revision: 1,
      criterion_id: "criterion-01",
      kind: "test",
      summary: "Focused smoke passed",
      reference: "pnpm check",
    },
  })).goal;
  assert(evidenceUpdate.revision === 2, "mahiro-goal evidence mutation must advance revision");
  let staleRevisionBlocked = false;
  try {
    update.run({
      ...baseContext,
      args: { action: "set_next", expected_revision: 1, next_action: "stale update" },
    });
  } catch (error) {
    staleRevisionBlocked = String(error).includes("Stale Mahiro Goal revision");
  }
  assert(staleRevisionBlocked, "mahiro-goal must reject stale revision mutations");
  const claimed = parseToolOutput(update.run({
    ...baseContext,
    args: {
      action: "claim_criterion",
      expected_revision: 2,
      criterion_id: "criterion-01",
      summary: "Automated evidence reviewed",
    },
  })).goal;
  assert(claimed.criteria[0].status === "claimed" && claimed.revision === 3, "agent criterion must claim only after evidence");
  const agentVerifyResult = goalCommand.run({
    ...baseContext,
    args: "verify criterion-01 bypass-evidence",
  });
  assert(agentVerifyResult.success === false && agentVerifyResult.output.includes("agent-owned"), "human verify command must not bypass agent evidence/claim ownership");

  let humanGateBlocked = false;
  try {
    update.run({ ...baseContext, args: { action: "complete", expected_revision: 3 } });
  } catch (error) {
    humanGateBlocked = String(error).includes("human verification");
  }
  assert(humanGateBlocked, "agent completion must fail while a required human gate is pending");

  const verifyResult = goalCommand.run({
    ...baseContext,
    args: "verify criterion-02 Foreground behavior accepted",
  });
  assert(verifyResult.success !== false, "human /mh-goal verify must succeed");
  const afterVerify = parseToolOutput(get.run({ ...baseContext, args: {} })).goal;
  assert(afterVerify.criteria[1].status === "verified" && afterVerify.revision === 4, "human verify must advance the criterion and revision");

  const completed = parseToolOutput(update.run({
    ...baseContext,
    args: { action: "complete", expected_revision: 4 },
  })).goal;
  assert(completed.status === "complete" && completed.revision === 5, "mahiro-goal must complete only after required evidence and human verification");
  const immutableResult = goalCommand.run({ ...baseContext, args: "next mutate-completed-goal" });
  assert(immutableResult.success === false && immutableResult.output.includes("immutable"), "completed Mahiro Goals must be immutable");

  let staleReplacementBlocked = false;
  try {
    create.run({
      ...baseContext,
      args: {
        objective: "Replacement",
        criteria: [{ text: "Replacement passes", owner: "agent" }],
        replace: true,
        expected_revision: 4,
      },
    });
  } catch (error) {
    staleReplacementBlocked = String(error).includes("expected_revision 5");
  }
  assert(staleReplacementBlocked, "agent replacement must reject a stale expected revision");
  const replaced = parseToolOutput(create.run({
    ...baseContext,
    args: {
      objective: "Replacement",
      criteria: [{ text: "Replacement passes", owner: "agent" }],
      replace: true,
      expected_revision: 5,
    },
  })).goal;
  assert(replaced.revision === 1 && replaced.objective === "Replacement", "explicit current-revision replacement must create a fresh goal");
  const revisionlessHumanReplace = goalCommand.run({ ...baseContext, args: "replace Revisionless replacement" });
  assert(revisionlessHumanReplace.success === false && revisionlessHumanReplace.output.includes("<revision>"), "human replacement must require an explicit current revision");
  const humanReplace = goalCommand.run({ ...baseContext, args: "replace 1 Human revision-guarded replacement" });
  assert(humanReplace.type === "prompt", "human replacement with the current revision must create a fresh goal prompt");

  const otherAgentContext = { ...baseContext, agent: { id: "agent-other" } };
  create.run({
    ...otherAgentContext,
    args: {
      objective: "Independent agent goal",
      criteria: [{ text: "Independent state exists", owner: "agent" }],
    },
  });
  const isolatedState = JSON.parse(readFileSync(statePath, "utf8"));
  assert(Object.keys(isolatedState.goals).length === 2, "same conversation IDs from different agents must not merge goal state");

  for (const cwd of ["/tmp/default-project-a", "/tmp/default-project-b"]) {
    create.run({
      ...baseContext,
      agent: { id: "agent-default" },
      conversation: { id: "default" },
      cwd,
      args: {
        objective: `Default lane for ${cwd}`,
        criteria: [{ text: "Default lane stays isolated", owner: "agent" }],
      },
    });
  }
  const defaultLaneState = JSON.parse(readFileSync(statePath, "utf8"));
  assert(
    Object.keys(defaultLaneState.goals).filter((key) => key.includes('"agent-default","default"')).length === 2,
    "raw default conversation lanes must be isolated by workspace",
  );

  const budgetContext = {
    ...baseContext,
    agent: { id: "agent-budget" },
    conversation: { id: "conversation-budget" },
    contextWindow: { totalInputTokens: 90, totalOutputTokens: 20 },
  };
  create.run({
    ...budgetContext,
    contextWindow: { totalInputTokens: 0, totalOutputTokens: 0 },
    args: {
      objective: "Bounded goal",
      criteria: [{ text: "Stay within budget", owner: "agent" }],
      token_budget: 100,
    },
  });
  const budgetReminder = eventHandlers.get("turn_start")(
    { conversationId: "conversation-budget", input: [{ role: "user", content: "continue" }] },
    budgetContext,
  );
  assert(budgetReminder?.input?.[0]?.content.includes("budget_limited"), "first budget crossing must emit one budget-limited reminder");
  const budgetGoal = parseToolOutput(get.run({ ...budgetContext, args: {} })).goal;
  assert(budgetGoal.status === "budget_limited" && budgetGoal.tokensUsed === 110 && budgetGoal.revision === 2, "goal-relative usage must advance revision and stop at budget");
  const repeatedBudgetReminder = eventHandlers.get("turn_start")(
    { conversationId: "conversation-budget", input: [{ role: "user", content: "continue" }] },
    budgetContext,
  );
  assert(repeatedBudgetReminder === undefined, "budget-limited goals must stop injecting reminders until resumed");

  mkdirSync(`${statePath}.lock`, { mode: 0o700 });
  writeFileSync(join(`${statePath}.lock`, "old-owner-token"), "busy", { mode: 0o600 });
  utimesSync(`${statePath}.lock`, 0, 0);
  const lockBusyResult = goalCommand.run({ ...baseContext, args: "next should-not-write" });
  const concurrentMutationBlocked = lockBusyResult.success === false && lockBusyResult.output.includes("busy in another Letta process");
  assert(concurrentMutationBlocked, "mahiro-goal must fail closed even when another process lock is old");
  const unlockResult = goalCommand.run({ ...baseContext, args: "unlock --force" });
  assert(unlockResult.success !== false && !existsSync(`${statePath}.lock`), "only explicit human unlock override may remove an abandoned lock");

  const oldOwner = testing.acquireStateLock();
  assert(existsSync(oldOwner.tokenPath), "acquired lock directory must already contain its owner token");
  let secondOwnerBlocked = false;
  try {
    testing.acquireStateLock();
  } catch (error) {
    secondOwnerBlocked = String(error).includes("busy in another Letta process");
  }
  assert(secondOwnerBlocked, "atomic candidate rename must reject a second owner while the fixed lock is nonempty");
  assert(testing.forceUnlock() === true, "force unlock must atomically quarantine the old owner directory");
  const successorOwner = testing.acquireStateLock();
  assert(existsSync(successorOwner.tokenPath), "successor lock directory must appear with its token already present");
  testing.releaseStateLock(oldOwner);
  assert(existsSync(successorOwner.tokenPath), "old owner release must not remove a successor lock directory");
  testing.releaseStateLock(successorOwner);
  assert(!existsSync(testing.lockPath), "current owner release must remove its own empty lock directory");

  const scopedKey = JSON.stringify(["agent-test", "conversation-test", ""]);
  const malformedNestedState = JSON.parse(readFileSync(statePath, "utf8"));
  malformedNestedState.goals[scopedKey].criteria[0].text = "";
  malformedNestedState.goals[scopedKey].tokenBaseline = 0.5;
  malformedNestedState.goals[scopedKey].updatedAt = "not-an-iso-timestamp";
  const malformedNestedText = `${JSON.stringify(malformedNestedState, null, 2)}\n`;
  writeFileSync(statePath, malformedNestedText, { mode: 0o600 });
  const malformedNestedResult = goalCommand.run({ ...baseContext, args: "status" });
  assert(malformedNestedResult.success === false, "mahiro-goal must reject empty nested strings and decimal counters");
  assert(readFileSync(statePath, "utf8") === malformedNestedText, "malformed nested state must remain untouched for recovery");

  const nestedCorruptState = `${JSON.stringify({ schemaVersion: 1, goals: { [scopedKey]: null } }, null, 2)}\n`;
  writeFileSync(statePath, nestedCorruptState, { mode: 0o600 });
  const nestedCorruptResult = goalCommand.run({ ...baseContext, args: "status" });
  assert(nestedCorruptResult.success === false, "mahiro-goal must reject valid-root state with a corrupt scoped goal");
  let nestedCreateBlocked = false;
  try {
    create.run({
      ...baseContext,
      args: { objective: "Must not overwrite corruption", criteria: [{ text: "Never written" }] },
    });
  } catch (error) {
    nestedCreateBlocked = String(error).includes("must be an object");
  }
  assert(nestedCreateBlocked && readFileSync(statePath, "utf8") === nestedCorruptState, "nested corruption must fail closed without overwrite");

  writeFileSync(statePath, "{invalid-json", { mode: 0o600 });
  const corruptResult = goalCommand.run({ ...baseContext, args: "status" });
  assert(corruptResult.success === false, "mahiro-goal must report corrupt state instead of silently resetting it");
  assert(readFileSync(statePath, "utf8") === "{invalid-json", "mahiro-goal must preserve corrupt state for recovery");
  assert(diagnostics.length === 0, "mahiro-goal smoke must not emit diagnostics");

  if (typeof disposer === "function") disposer();
  assert(cleanupCount === 6, "mahiro-goal cleanup must dispose two commands, three tools, and one event");
  assert(goalPanelClosed === 1, "mahiro-goal cleanup must close the transient busy status panel");

  const noUiCommands = [];
  const noUiDisposer = activate({
    capabilities: { commands: true },
    commands: {
      register(definition) {
        noUiCommands.push(definition);
        return () => {};
      },
    },
  });
  assert(noUiCommands.map(({ id }) => id).join(",") === "mh-goal", "busy status command must not register when panel UI is unavailable");
  if (typeof noUiDisposer === "function") noUiDisposer();
}

function checkStatuslineRegistration(activate) {
  const eventNames = [];
  let panelOptions = null;
  let panelClosed = 0;
  const disposer = activate({
    capabilities: {
      ui: { panels: true },
      events: {
        compact: true,
        lifecycle: true,
        llm: true,
        tools: true,
        turns: true,
      },
    },
    diagnostics: { report: () => {} },
    events: {
      on(name) {
        eventNames.push(name);
        return () => {};
      },
    },
    ui: {
      openPanel(options) {
        panelOptions = options;
        return {
          close() {
            panelClosed += 1;
          },
          update() {},
        };
      },
    },
  });

  assert(panelOptions?.id === "statusline", "statusline must register panel id statusline");
  assert(panelOptions?.order === 0, "statusline must own order-0 panel position");
  assert(typeof panelOptions?.render({ width: 100 }) === "string", "statusline panel must render a string");
  const expectedEvents = [
    "compact_end",
    "compact_start",
    "conversation_open",
    "llm_end",
    "llm_start",
    "tool_end",
    "tool_start",
    "turn_start",
  ];
  assert(
    eventNames.sort().join(",") === expectedEvents.join(","),
    `statusline event registrations differ: ${eventNames.join(",")}`,
  );
  if (typeof disposer === "function") disposer();
  assert(panelClosed === 1, "statusline cleanup must close its panel once");
}

const testRoot = await mkdtemp(join(tmpdir(), "mahiro-goal-check-"));
const previousStatePath = process.env.MAHIRO_GOAL_STATE_PATH;
const previousGoalTesting = process.env.MAHIRO_GOAL_TESTING;
const previousTimestampTesting = process.env.MAHIRO_TIMESTAMPS_TESTING;
const previousCodeEvidenceStatePath = process.env.MAHIRO_CODE_EVIDENCE_STATE_PATH;
const previousCodeEvidenceTesting = process.env.MAHIRO_CODE_EVIDENCE_TESTING;
process.env.MAHIRO_GOAL_STATE_PATH = join(testRoot, "state.json");
process.env.MAHIRO_GOAL_TESTING = "1";
process.env.MAHIRO_TIMESTAMPS_TESTING = "1";
process.env.MAHIRO_CODE_EVIDENCE_STATE_PATH = join(testRoot, "code-evidence-state.json");
process.env.MAHIRO_CODE_EVIDENCE_TESTING = "1";

try {
  const activations = new Map();
  const testingSurfaces = new Map();
  for (const entry of entries) {
    const loaded = await loadMod(entry);
    const activate = loaded.activate;
    activations.set(entry, activate);
    testingSurfaces.set(entry, loaded.testing);
    smokeActivate(activate, entry);
  }

  const timestampHandler = checkMahiroTimestampRegistration(
    activations.get("mods/mahiro-user-timestamps.ts"),
    testingSurfaces.get("mods/mahiro-user-timestamps.ts"),
  );
  checkMahiroGoalRegistration(
    activations.get("mods/mahiro-goal.ts"),
    process.env.MAHIRO_GOAL_STATE_PATH,
    testingSurfaces.get("mods/mahiro-goal.ts"),
    timestampHandler,
  );
  await checkMahiroCodeEvidenceRegistration(
    activations.get("mods/mahiro-code-evidence.ts"),
    testingSurfaces.get("mods/mahiro-code-evidence.ts"),
    testRoot,
  );
  checkMcpPermissionGuard(activations.get("mods/mahiro-mcp-proxy.js"));
  checkRtkRegistration(activations.get("mods/rtk-control.ts"));
  checkStatuslineRegistration(activations.get("mods/statusline.tsx"));

  console.log(`Mod source valid: ${entries.length} entries transpiled with command, event, panel, tool, permission, state, human-gate, and cleanup smoke checks.`);
} finally {
  if (previousStatePath === undefined) delete process.env.MAHIRO_GOAL_STATE_PATH;
  else process.env.MAHIRO_GOAL_STATE_PATH = previousStatePath;
  if (previousGoalTesting === undefined) delete process.env.MAHIRO_GOAL_TESTING;
  else process.env.MAHIRO_GOAL_TESTING = previousGoalTesting;
  if (previousTimestampTesting === undefined) delete process.env.MAHIRO_TIMESTAMPS_TESTING;
  else process.env.MAHIRO_TIMESTAMPS_TESTING = previousTimestampTesting;
  if (previousCodeEvidenceStatePath === undefined) delete process.env.MAHIRO_CODE_EVIDENCE_STATE_PATH;
  else process.env.MAHIRO_CODE_EVIDENCE_STATE_PATH = previousCodeEvidenceStatePath;
  if (previousCodeEvidenceTesting === undefined) delete process.env.MAHIRO_CODE_EVIDENCE_TESTING;
  else process.env.MAHIRO_CODE_EVIDENCE_TESTING = previousCodeEvidenceTesting;
  await rm(testRoot, { recursive: true, force: true });
}
