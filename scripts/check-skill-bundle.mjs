import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

// Isolated HOME and CWD only: never reconnect, install or use real user state.
mkdirSync(".agent-state", { recursive: true });
const root = mkdtempSync(path.resolve(".agent-state/skill-bundle-"));
const previousHome = process.env.HOME;
process.env.HOME = path.join(root, "home");
const write = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
};
try {
  const cwd = path.join(root, "workspace");
  write(path.join(cwd, ".mcp.json"), { mcpServers: {} });
  write(path.join(cwd, ".letta/mcp.json"), { mcpServers: {} });
  const directory = path.join(cwd, "skills", "studying-codrops");
  let binding = { version: 1, skill: "studying-codrops", steps: {
    "source-acquisition": { instructions: "references/source.md", tools: [
      { server: "hirohiro", tool: "control" }, { server: "hirohiro", tool: "read" },
    ] },
  } };
  const bindingPath = path.join(directory, "mcp-bindings.json");
  if (process.argv[2]) binding = JSON.parse(readFileSync(path.join(process.argv[2], "mcp-bindings.json"), "utf8"));
  write(bindingPath, binding);
  const reference = binding.steps["source-acquisition"].instructions;
  write(path.join(directory, reference), process.argv[2]
    ? readFileSync(path.join(process.argv[2], reference), "utf8")
    : "Read parent skill. Acquire source only; no screenshot or QA authorization.");
  const server = { command: "/fixture/must-not-execute", args: [] };
  write(path.join(process.env.HOME, ".letta/mcp.json"), { mcpServers: { hirohiro: server } });
  const commandHash = createHash("sha256").update(JSON.stringify({ command: server.command, args: [], cwd: null, envKeys: [] })).digest("hex").slice(0, 16);
  const cache = { version: 1, servers: { hirohiro: { commandHash, tools: ["control", "read", "trusted_interact"].map((name) => ({ name: `hirohiro_${name}`, originalName: name, description: `Fixture ${name}`, inputSchema: { type: "object", properties: { action: { type: "string" } } } })) } } };
  const cachePath = path.join(process.env.HOME, ".letta/mcp-proxy/cache.json");
  write(cachePath, cache);
  const { default: activate } = await import("../mods/mahiro-mcp-proxy.js");
  const tools = [];
  const permissions = [];
  const dispose = activate({ capabilities: { tools: true, permissions: true },
    tools: { register(tool) { tools.push(tool); return () => {}; } },
    permissions: { register(policy) { permissions.push(policy); return () => {}; } },
  });
  const proxy = tools.find((tool) => tool.name === "mcp_proxy");
  const args = { action: "skill_bundle", skill: "studying-codrops", step: "source-acquisition" };
  const run = async (overrides = {}) => JSON.parse(await proxy.run({ cwd, args: { ...args, ...overrides } }));
  const result = await run();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.tools.map((tool) => tool.originalName), ["control", "read"]);
  assert(result.tools.every((tool) => tool.inputSchema.type === "object"));
  assert(!JSON.stringify(result).includes("trusted_interact"));
  assert.equal(permissions[0].check({ toolName: "mcp_proxy", args }).decision, "allow");
  assert.equal((await run({ step: "unknown" })).ok, false);
  assert.equal((await run({ skill: "../escape" })).ok, false);
  const descriptions = await proxy.run({ cwd, args: { action: "describe", tool: "read" } });
  assert(descriptions.includes("Fixture read"), "Existing describe must remain functional");
  const controlDescription = await proxy.run({ cwd, args: { action: "describe", tool: "control" } });
  const baselineBytes = Buffer.byteLength(result.instructions + descriptions + controlDescription);
  const bundleBytes = Buffer.byteLength(await proxy.run({ cwd, args }));
  const instructionFile = path.join(directory, reference);
  const originalInstructions = readFileSync(instructionFile, "utf8");
  write(instructionFile, "x".repeat(12001));
  assert.match((await run()).error, /12000-byte budget/);
  write(instructionFile, originalInstructions);
  const fallbackDirectory = path.join(cwd, ".agents/skills/studying-codrops");
  write(path.join(fallbackDirectory, "mcp-bindings.json"), binding);
  write(path.join(fallbackDirectory, reference), "Fallback must not override workspace source.");
  assert.equal((await run()).instructions, originalInstructions);
  cache.servers.hirohiro.tools = cache.servers.hirohiro.tools.filter((tool) => tool.originalName !== "read");
  write(cachePath, cache);
  const missingTool = await run();
  assert.equal(missingTool.ok, false);
  assert.equal(missingTool.tools[1].available, false);
  cache.servers.hirohiro.tools.push({ name: "hirohiro_read", originalName: "read", inputSchema: { description: "x".repeat(41000) } });
  write(cachePath, cache);
  assert.match((await run()).error, /output budget/);
  cache.servers.hirohiro.commandHash = "stale";
  write(cachePath, cache);
  const stale = await run();
  assert.equal(stale.ok, false);
  assert(stale.tools.every((tool) => tool.cacheState === "stale" && !tool.inputSchema));
  write(cachePath, { version: 1, servers: {} });
  assert((await run()).tools.every((tool) => tool.cacheState === "missing"));
  write(path.join(process.env.HOME, ".letta/mcp.json"), { mcpServers: {} });
  assert((await run()).tools.every((tool) => tool.cacheState === "unconfigured"));
  write(path.join(directory, "outside.md"), "not an instruction");
  binding.steps["source-acquisition"].instructions = "../outside.md";
  write(path.join(cwd, "skills/outside.md"), "outside");
  write(bindingPath, binding);
  assert.match((await run()).error, /escapes/);
  symlinkSync(path.join(cwd, "skills/outside.md"), path.join(directory, "linked.md"));
  binding.steps["source-acquisition"].instructions = "linked.md";
  write(bindingPath, binding);
  assert.match((await run()).error, /escapes/);
  dispose();
  console.log(`Skill bundle fixtures passed. Fixture baseline: 3 calls, ${baselineBytes} UTF-8 bytes; bundle: 1 call, ${bundleBytes} bytes. Disclosure calls decrease, response bytes may increase. Not a live token/latency benchmark.`);
} finally {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  rmSync(root, { recursive: true, force: true });
}
