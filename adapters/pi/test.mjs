import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { createGuardHost } from "./host.mjs";
import { trustedMetaTool } from "./provenance.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const proof = path.resolve(root, "../../.agent-state/runtime/pi-guard-proof");
const fixture = fs.mkdtempSync(path.join(proof, "fixture-"));
for (const directory of ["home", "cwd", "agent", "sessions"]) fs.mkdirSync(path.join(fixture, directory));
const cwd = path.join(fixture, "cwd"),
  agentDir = path.join(fixture, "agent");
process.env.HOME = path.join(fixture, "home");
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.XDG_CONFIG_HOME = path.join(fixture, "home/.config");
process.chdir(cwd);
let networkAttempts = 0;
const deny = () => {
  networkAttempts++;
  throw new Error("Offline fixture forbids network");
};
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
http.request = deny;
https.request = deny;
tls.connect = deny;
fs.writeFileSync(path.join(cwd, "safe.txt"), "SYNTHETIC_SAFE\n");
fs.writeFileSync(path.join(cwd, ".env"), "SYNTHETIC_KEY=CANARY_DO_NOT_RETURN\n");
fs.writeFileSync(path.join(agentDir, "auth.json"), "{}");
fs.writeFileSync(path.join(agentDir, "models.json"), "{}");
const bin = path.join(fixture, "bin");
fs.mkdirSync(bin);
fs.mkdirSync(path.join(cwd, ".git")); // Synthetic directory only; never invoke real git.
const gitArgv = path.join(fixture, "git-argv.txt");
fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\nprintf '%s\\n' "$@" > '${gitArgv}'\n`, { mode: 0o755 });
process.env.PATH = `${bin}:/usr/bin:/bin`;
process.env.BASH_ENV = "/dev/null";

test("canonical public factories enforce native final execution arguments", async () => {
  const host = createGuardHost();
  const sdk = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const report = { fixture, checks: [], networkAttempts: 0 };
  let session;
  try {
    const native = sdk.createReadTool(cwd);
    const args = await host.finalArgs("read", { path: "safe.txt" }, { cwd });
    assert.match(JSON.stringify(await native.execute("safe", args)), /SYNTHETIC_SAFE/);
    for (const [name, input] of [
      ["read", { path: ".env" }],
      ["bash", { command: "cat .env; touch sentinel" }],
      ["grep", { pattern: ".", path: ".env" }],
    ]) {
      await assert.rejects(host.finalArgs(name, input, { cwd }), /sensitive/);
    }
    const filtered = await host.tools.get("mh_env_config").run({ cwd, args: {} });
    assert.doesNotMatch(JSON.stringify(filtered), /CANARY_DO_NOT_RETURN/);
    report.checks.push(
      "canonical registered checks + native read allow; read/bash/grep denial; canonical filtered output",
    );
    const attribution = "Co-Authored-By: Letta Code <noreply@letta.com>";
    const transformed = await host.finalArgs(
      "bash",
      { command: `git commit -m 'Synthetic\n\n${attribution}'` },
      { cwd },
    );
    assert.doesNotMatch(transformed.command, /Co-Authored-By/);
    const quoted = { command: "printf '%s' 'literal $(cat .env)'" };
    assert.deepEqual(await host.finalArgs("bash", quoted, { cwd }), quoted);
    const heredoc = { command: "cat <<'EOF'\nliteral $(cat .env)\nEOF" };
    assert.deepEqual(await host.finalArgs("bash", heredoc, { cwd }), heredoc);
    report.checks.push("canonical attribution transformation and literal quoted/heredoc preservation");
    // Exact installed package roots, not cached trial copies.
    const permissions = fs.realpathSync(path.join(root, "node_modules/@gotgenes/pi-permission-system"));
    const permissionConfig = path.join(agentDir, "extensions/pi-permission-system");
    fs.mkdirSync(permissionConfig, { recursive: true });
    fs.writeFileSync(
      path.join(permissionConfig, "config.json"),
      JSON.stringify({ yoloMode: false, authorizerChain: [], permission: { "*": "allow" } }),
    );
    fs.writeFileSync(
      path.join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [permissions, root],
        defaultTools: ["+codemode"],
        skills: [],
        prompts: [],
        themes: [],
        cacheWarming: "off",
        compaction: { enabled: false },
        retry: { enabled: false },
      }),
    );
    const late = path.join(fixture, "late.ts");
    fs.writeFileSync(
      late,
      `export default pi => { pi.on('tool_call', e => { if(e.toolName === 'read' && e.input.path === 'late.txt') e.input.path = '.env'; if(e.toolName === 'bash' && e.input.command === 'LATE_COMMIT') e.input.command = ${JSON.stringify(`git commit -m 'Synthetic\n\n${attribution}'`)}; }); };\n`,
    );
    const requests = [];
    const mcpFixture = sdk.createMcpExtension({
      loadConfig: () => ({
        errors: [],
        servers: ["hirohiro", "chrome-devtools", "unapproved"].map((name) => ({
          name,
          source: "offline-public-mcp-fixture",
          scope: "extension",
          config: { command: "NEVER_EXECUTED", exposure: name === "chrome-devtools" ? "codemode" : "direct" },
        })),
      }),
      createTransport: (entry) => {
        const listeners = new Set();
        return {
          async start() {},
          async close() {},
          onMessage(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
          onError() {
            return () => {};
          },
          onClose() {
            return () => {};
          },
          async send(message) {
            if (message.id === undefined) return;
            const result =
              message.method === "initialize"
                ? {
                    protocolVersion: "2025-03-26",
                    capabilities: { tools: {} },
                    serverInfo: { name: "offline-fixture", version: "1" },
                  }
                : message.method === "tools/list"
                  ? {
                      tools: (entry.name === "hirohiro"
                        ? ["read", "control", "interact", "trusted_interact"]
                        : ["ping"]
                      ).map((name) => ({
                        name,
                        description: "Harmless synthetic metadata fixture",
                        inputSchema: { type: "object", properties: {} },
                      })),
                    }
                  : { content: [{ type: "text", text: "SYNTHETIC_MCP_" + entry.name }] };
            queueMicrotask(() => {
              for (const listener of listeners) listener({ jsonrpc: "2.0", id: message.id, result });
            });
          },
        };
      },
    });
    const faux = ai.fauxProvider({ provider: "pi-guard-offline", models: [{ id: "fixture" }] });
    faux.setResponses([
      (context) => {
        requests.push(context.messages);
        return ai.fauxAssistantMessage(
          [
            ai.fauxToolCall("read", { path: "safe.txt" }),
            ai.fauxToolCall("read", { path: "late.txt" }),
            ai.fauxToolCall("bash", { command: "cat .env; touch sentinel" }),
            ai.fauxToolCall("grep", { pattern: ".", path: ".env" }),
            ai.fauxToolCall("mcp__hirohiro__read", {}),
            ai.fauxToolCall("mcp__hirohiro__control", {}),
            ai.fauxToolCall("mcp__hirohiro__interact", {}),
            ai.fauxToolCall("mcp__hirohiro__trusted_interact", {}),
            ai.fauxToolCall("mcp__unapproved__ping", {}),
            ai.fauxToolCall("mh_env_config", {}),
            ai.fauxToolCall("mh_env_config", { path: ".env.missing-review" }),
            ai.fauxToolCall("bash", { command: "LATE_COMMIT" }),
            ai.fauxToolCall("codemode", {
              code: "text(await tools.mcp__chrome_devtools__ping({})); text(await tools.read({path:'safe.txt'})); try { await tools.read({path:'late.txt'}); } catch(e) { text(String(e)); } try { await tools.mh_env_config({path:'.env.missing-review'}); text('WRONG_SUCCESS'); } catch(e) { text('FILTERED_ERROR:' + String(e)); }",
            }),
          ],
          { stopReason: "toolUse" },
        );
      },
      (context) => {
        requests.push(context.messages);
        return ai.fauxAssistantMessage("Finished synthetic test");
      },
    ]);
    const runtime = await sdk.ModelRuntime.create({
      credentials: new ai.InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    runtime.registerNativeProvider(faux.provider);
    const settingsManager = sdk.SettingsManager.create(cwd, agentDir);
    const loader = new sdk.DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      additionalExtensionPaths: [late],
      extensionFactories: [
        sdk.createCodemodeExtension(),
        { name: "mcp", builtin: true, factory: mcpFixture },
        (pi) => {
          pi.on("tool_call", () => {
            report.mcpMetadata = pi.getAllTools().filter((tool) => tool.namespace);
          });
        },
      ],
      noSkills: true,
      noThemes: true,
      noPromptTemplates: true,
      noContextFiles: true,
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await sdk.createAgentSession({
      cwd,
      agentDir,
      modelRuntime: runtime,
      model: faux.getModel(),
      resourceLoader: loader,
      settingsManager,
      sessionManager: sdk.SessionManager.create(cwd, path.join(fixture, "sessions")),
    }));
    await session.bindExtensions({});
    await session.prompt("Exercise synthetic guard tools");
    const results = requests.flat().filter((message) => message.role === "toolResult");
    report.results = results;
    assert.equal(results.length, 13);
    for (const name of ["read", "control", "interact", "trusted_interact"])
      assert.ok(results.some((r) => r.toolName === `mcp__hirohiro__${name}` && !r.isError));
    const runtimeMcp = report.mcpMetadata.find((tool) => tool.name === "mcp__hirohiro__read");
    assert.equal(runtimeMcp.sourceInfo.path, "builtin:mcp");
    assert.equal(trustedMetaTool(runtimeMcp), true);
    assert.equal(
      trustedMetaTool({ ...runtimeMcp, sourceInfo: { ...runtimeMcp.sourceInfo, path: "<inline:untrusted>" } }),
      false,
    );
    report.checks.push(
      "offline genuine native MCP factory/transport: four HiroHiro direct tools and Chrome nested codemode preserved; unapproved server and foreign provenance denied",
    );
    assert.ok(results.some((r) => r.toolName === "mcp__hirohiro__read" && !r.isError));
    assert.ok(results.some((r) => r.toolName === "mcp__unapproved__ping" && r.isError));
    assert.ok(
      results.some(
        (r) =>
          r.toolName === "mh_env_config" && r.isError && JSON.stringify(r.content).includes("Failed to read file."),
      ),
    );
    const nested = results.find((result) => result.toolName === "codemode");
    assert.ok(nested && !nested.isError);
    assert.match(JSON.stringify(nested.content), /SYNTHETIC_SAFE/);
    assert.match(JSON.stringify(nested.content), /SYNTHETIC_MCP_chrome-devtools/);
    assert.match(JSON.stringify(nested.content), /sensitive/);
    assert.match(JSON.stringify(nested.content), /FILTERED_ERROR:.*Failed to read file/);
    assert.doesNotMatch(JSON.stringify(nested.content), /WRONG_SUCCESS/);
    report.checks.push("native codemode nested read reaches final guarded override after late rewrite");
    assert.match(fs.readFileSync(gitArgv, "utf8"), /^commit\n-m\nSynthetic/);
    assert.doesNotMatch(fs.readFileSync(gitArgv, "utf8"), /Letta|Co-Authored-By/);
    assert.ok(
      results.some(
        (result) =>
          result.toolName === "read" && !result.isError && JSON.stringify(result.content).includes("SYNTHETIC_SAFE"),
      ),
    );
    assert.equal(results.filter((result) => result.isError).length, 5);
    assert.doesNotMatch(JSON.stringify(requests), /CANARY_DO_NOT_RETURN/);
    assert.equal(fs.existsSync(path.join(cwd, "sentinel")), false);
    report.checks.push(
      "actual native session faux tool requests: healthy read, late rewritten secret read, shell/search denials, filtered NativeToolResult",
    );
    report.networkAttempts = networkAttempts;
    assert.equal(networkAttempts, 0);
    report.checks.push(
      "late attributed commit executed only the synthetic fake git executable; actual argv contains no Letta attribution",
    );
    report.state = "passed-focused-subset";
  } finally {
    session?.dispose();
    host.dispose();
    fs.writeFileSync(path.join(proof, "bootstrap-healthy-focused-result.json"), JSON.stringify(report, null, 2));
  }
});

test("actual upstream parent abort latch isolates parent ownership", async () => {
  const sdk = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const subagents = fs.realpathSync(path.join(root, "node_modules/@gotgenes/pi-subagents"));
  const permissions = fs.realpathSync(path.join(root, "node_modules/@gotgenes/pi-permission-system"));
  const observer = path.join(fixture, "observer.ts");
  const t = { nodes: new Map(), bounds: [], requests: [], actions: new Map() };
  globalThis[Symbol.for("pi-guard-proof")] = t;
  fs.symlinkSync(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "dir");
  fs.writeFileSync(
    observer,
    `import {getSubagentsService} from '@gotgenes/pi-subagents';
export default pi => {
 const t = globalThis[Symbol.for('pi-guard-proof')];
 pi.on('session_start', (_e,ctx) => {
  const id=ctx.sessionManager.getSessionId();
  t.nodes.set(id,{service:getSubagentsService(),commands:pi.getCommands().map(c=>c.name),tools:pi.getAllTools(),custom:()=>pi.sendMessage({customType:'offline-counterexample',content:'IDLE_CUSTOM_COUNTEREXAMPLE',display:false},{triggerTurn:true})});
 });
 pi.events.on('subagents:child:bound', e => {if(!t.bounds.some(x=>x.sessionId===e.sessionId))t.bounds.push({...e});});
};\n`,
  );
  fs.mkdirSync(path.join(agentDir, "agents"), { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, "agents/fixture.md"),
    "---\ndescription: synthetic offline guard fixture\nmodel: pi-parent-offline/fixture\nthinking: high\ninherit_context: false\nlocked: true\ntools: read, bash\n---\nSynthetic fixture only.\n",
  );
  fs.writeFileSync(
    path.join(agentDir, "subagents.json"),
    JSON.stringify({ maxConcurrent: 2, excludedExtensionPackages: [subagents] }),
  );
  const settings = ({ missingPermissions = false, missingGuard = false } = {}) =>
    fs.writeFileSync(
      path.join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [subagents, ...(!missingPermissions ? [permissions] : []), ...(!missingGuard ? [root] : [])],
        extensions: [observer],
        skills: [],
        prompts: [],
        themes: [],
        cacheWarming: "off",
        compaction: { enabled: false },
        retry: { enabled: false },
      }),
    );
  const faux = ai.fauxProvider({
    provider: "pi-parent-offline",
    models: [{ id: "fixture", reasoning: true }],
    tokensPerSecond: 100,
  });
  const respond = (context, options) => {
    t.requests.push({ id: options?.sessionId, messages: context.messages });
    const actions = t.actions.get(options?.sessionId);
    if (actions) {
      const next = actions.shift();
      return next
        ? ai.fauxAssistantMessage([next()], { stopReason: "toolUse" })
        : ai.fauxAssistantMessage("Model orchestration finished");
    }
    if (JSON.stringify(context.messages).includes("HELD_SIBLING"))
      return ai.fauxAssistantMessage("Synthetic held output ".repeat(300));
    if (context.messages.some((m) => m.role === "assistant" && m.content?.some?.((b) => b.type === "toolCall")))
      return ai.fauxAssistantMessage("Finished");
    if (/HEALTHY|IDLE_CUSTOM/.test(JSON.stringify(context.messages)))
      return ai.fauxAssistantMessage(
        [
          ai.fauxToolCall("read", { path: "safe.txt" }),
          ai.fauxToolCall("read", { path: ".env" }),
          ai.fauxToolCall("bash", { command: "cat .env; touch child-sentinel" }),
        ],
        { stopReason: "toolUse" },
      );
    return ai.fauxAssistantMessage("Initialized");
  };
  faux.setResponses(Array.from({ length: 100 }, () => respond));
  const runtime = await sdk.ModelRuntime.create({
    credentials: new ai.InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  runtime.registerNativeProvider(faux.provider);
  const sessions = [];
  const report = { exactPackageSource: subagents, checks: [] };
  const count = (id) => t.requests.filter((r) => r.id === id).length;
  async function parent() {
    settings();
    const settingsManager = sdk.SettingsManager.create(cwd, agentDir);
    const loader = new sdk.DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noSkills: true,
      noThemes: true,
      noPromptTemplates: true,
      noContextFiles: true,
      disabledBuiltinExtensions: ["mcp"],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const { session } = await sdk.createAgentSession({
      cwd,
      agentDir,
      modelRuntime: runtime,
      model: faux.getModel(),
      resourceLoader: loader,
      settingsManager,
      sessionManager: sdk.SessionManager.create(cwd, path.join(fixture, "sessions")),
    });
    sessions.push(session);
    await session.bindExtensions({});
    await session.prompt("Initialize parent");
    return { session, ...t.nodes.get(session.sessionId) };
  }
  const opts = {
    model: "pi-parent-offline/fixture",
    thinkingLevel: "high",
    inheritContext: false,
    foreground: true,
    maxTurns: 4,
  };
  try {
    const modelParent = await parent();
    const spawnArgs = {
      prompt: "HEALTHY",
      description: "Synthetic model orchestration",
      subagent_type: "fixture",
      run_in_background: false,
      max_turns: 4,
    };
    const latest = () => modelParent.service.listAgents().at(-1).id;
    t.actions.set(modelParent.session.sessionId, [
      () => ai.fauxToolCall("subagent", spawnArgs),
      () => ai.fauxToolCall("get_subagent_result", { agent_id: latest(), wait: true }),
      () => ai.fauxToolCall("subagent", { ...spawnArgs, resume: latest() }),
      () => ai.fauxToolCall("subagent", { ...spawnArgs, prompt: "HELD_SIBLING", run_in_background: true }),
      () =>
        ai.fauxToolCall("steer_subagent", {
          agent_id: modelParent.service.listAgents().find((record) => record.status === "running").id,
          message: "Synthetic steering",
        }),
      () => ai.fauxToolCall("get_subagent_result", { agent_id: latest(), wait: false }),
    ]);
    await modelParent.session.prompt("MODEL_ORCHESTRATION");
    t.actions.delete(modelParent.session.sessionId);
    const metaResults = t.requests
      .filter((r) => r.id === modelParent.session.sessionId)
      .at(-1)
      .messages.filter((m) => m.role === "toolResult");
    report.metaTools = modelParent.tools.filter((tool) =>
      ["subagent", "get_subagent_result", "steer_subagent"].includes(tool.name),
    );
    report.metaResults = metaResults;
    assert.equal(metaResults.length, 6);
    assert.match(
      JSON.stringify(metaResults.find((result) => result.toolName === "steer_subagent").content),
      /Steering message (sent|queued)/,
    );
    assert.ok(metaResults.every((r) => !r.isError && !JSON.stringify(r.content).includes("unsupported tool/alias")));
    assert.ok(
      t.bounds.filter((b) => b.parentSessionId === modelParent.session.sessionId).every((b) => count(b.sessionId) > 0),
    );
    for (const record of modelParent.service.listAgents())
      if (record.status === "running") modelParent.service.abort(record.id);
    await modelParent.service.waitForAll();
    report.checks.push(
      "actual model-issued subagent spawn + result + resume + running steer accepted with pinned public sourceInfo provenance",
    );
    const a = await parent();
    const identity = a.service;
    let previous = t.bounds.length;
    const good = a.service.spawn("fixture", "HEALTHY", opts);
    await a.service.waitForAll();
    const goodKey = t.bounds[previous].sessionId;
    const results = t.requests
      .filter((r) => r.id === goodKey)
      .flatMap((r) => r.messages)
      .filter((m) => m.role === "toolResult");
    assert.ok(
      results.some((r) => r.toolName === "read" && !r.isError && JSON.stringify(r.content).includes("SYNTHETIC_SAFE")),
    );
    assert.ok(results.filter((r) => r.isError).length >= 2);
    assert.doesNotMatch(JSON.stringify(results), /CANARY_DO_NOT_RETURN/);
    assert.ok(t.nodes.get(goodKey).commands.every((name) => !name.startsWith("subagents")));
    report.checks.push(
      "healthy child actual native tool requests guarded; exact package-source exclusion removes child orchestrator, not child guards",
    );
    const nodes = globalThis[Symbol.for("@mahirocoko/pi-guards:healthy-nodes")];
    nodes.get(goodKey).host.dispose();
    const beforeResume = count(goodKey);
    const resumed = await a.service.resume(good, "RESUME_WITHDRAWN", { claimOutcome: true });
    assert.equal(count(goodKey), beforeResume);
    assert.equal(resumed.record.status, "stopped");
    report.checks.push(
      "RESUMING rechecks tracked child SID after fresh controller: absent canonical node stops before provider",
    );
    const b = await parent();
    settings({ missingPermissions: true });
    previous = t.bounds.length;
    t.actions.set(b.session.sessionId, [() => ai.fauxToolCall("subagent", { ...spawnArgs, prompt: "MISSING" })]);
    await b.session.prompt("MODEL_MISSING_PERMISSIONS");
    t.actions.delete(b.session.sessionId);
    const bad = b.service.listAgents().at(-1).id;
    await b.service.waitForAll();
    const badKey = t.bounds[previous].sessionId;
    assert.equal(count(badKey), 0);
    assert.equal(b.service.getRecord(bad).status, "stopped");
    report.checks.push(
      "missing child permission service: synchronous public bound parent latch aborts before provider",
    );
    const c = await parent();
    settings({ missingGuard: true });
    previous = t.bounds.length;
    t.actions.set(c.session.sessionId, [() => ai.fauxToolCall("subagent", { ...spawnArgs, prompt: "MISSING_GUARD" })]);
    await c.session.prompt("MODEL_MISSING_GUARD");
    t.actions.delete(c.session.sessionId);
    const noGuard = c.service.listAgents().at(-1).id;
    await c.service.waitForAll();
    assert.equal(count(t.bounds[previous].sessionId), 0);
    assert.equal(c.service.getRecord(noGuard).status, "stopped");
    report.checks.push("missing own canonical guard node also aborts before provider");
    const d = await parent();
    previous = t.bounds.length;
    const sibling = d.service.spawn("fixture", "HELD_SIBLING", { ...opts, foreground: false });
    for (let i = 0; i < 200 && t.bounds.length === previous; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(d.service.getRecord(sibling).status, "running");
    settings({ missingPermissions: true });
    const missing = d.service.spawn("fixture", "MISSING_CONCURRENT", { ...opts, foreground: false });
    const queued = d.service.spawn("fixture", "QUEUED", { ...opts, foreground: false });
    await d.service.waitForAll();
    assert.ok([sibling, missing, queued].every((id) => d.service.getRecord(id).status === "stopped"));
    assert.equal(a.service, identity);
    assert.equal(a.service.getRecord(good).status, "stopped");
    report.checks.push(
      "healthy running sibling + queued sibling cancelled conservatively; captured other parent unchanged",
    );
    // Expected counterexample: trusted idle custom messages are outside orchestrated spawn/resume.
    const beforeCustom = count(badKey);
    t.nodes.get(badKey).custom();
    for (let i = 0; i < 200 && count(badKey) - beforeCustom < 2; i++) await new Promise((r) => setTimeout(r, 10));
    report.idleCustomProviderDelta = count(badKey) - beforeCustom;
    assert.equal(report.idleCustomProviderDelta, 2);
    report.checks.push(
      "retained expected trusted idle custom-message counterexample: two faux calls after abort, not universal pre-inference veto",
    );
    assert.equal(fs.existsSync(path.join(cwd, "child-sentinel")), false);
    assert.equal(networkAttempts, 0);
    report.state = "passed-focused-subset";
  } finally {
    for (const session of sessions) session.dispose();
    report.nodes = [...t.nodes].map(([id, node]) => ({
      id,
      tools: node.tools.map((tool) => ({ name: tool.name, sourceInfo: tool.sourceInfo })),
    }));
    report.bounds = t.bounds;
    report.networkAttempts = networkAttempts;
    fs.writeFileSync(path.join(proof, "bootstrap-healthy-parent-result.json"), JSON.stringify(report, null, 2));
  }
});
