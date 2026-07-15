import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const entries = [
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
  return loaded.default;
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

const activations = new Map();
for (const entry of entries) {
  const activate = await loadMod(entry);
  activations.set(entry, activate);
  smokeActivate(activate, entry);
}

checkMcpPermissionGuard(activations.get("mods/mahiro-mcp-proxy.js"));
checkRtkRegistration(activations.get("mods/rtk-control.ts"));
checkStatuslineRegistration(activations.get("mods/statusline.tsx"));

console.log(`Mod source valid: ${entries.length} entries transpiled with command, event, panel, tool, permission, and cleanup smoke checks.`);
