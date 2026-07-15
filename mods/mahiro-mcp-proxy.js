import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const MOD_ID = "mahiro-mcp-proxy";
const MOD_VERSION = "0.2.0";
const MOD_HOME = path.join(homedir(), ".letta", "mcp-proxy");
const CACHE_PATH = path.join(MOD_HOME, "cache.json");
const CACHE_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 40_000;
const MAX_SCHEMA_CHARS = 8_000;
const MCP_PROTOCOL_VERSION = "2024-11-05";

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
}

function writeJsonFile(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function truncateText(text, max = MAX_OUTPUT_CHARS) {
  const value = String(text ?? "");
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[truncated ${value.length - max} chars]`;
}

function formatSchemaCompact(schema) {
  return truncateText(JSON.stringify(schema ?? {}, null, 2), MAX_SCHEMA_CHARS);
}

function compactDescription(description, max = 180) {
  const value = String(description || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatToolRow(tool) {
  const description = compactDescription(tool.description);
  return `  - ${tool.name} (${tool.originalName})${description ? ` — ${description}` : ""}`;
}

function normalizeLimit(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

function isJsonFormat(value) {
  return String(value || "text").toLowerCase() === "json";
}

function pickToolFields(tool, includeSchema = false) {
  const result = {
    name: tool.name,
    originalName: tool.originalName,
    serverName: tool.serverName,
    description: tool.description || "",
  };
  if (includeSchema) result.inputSchema = tool.inputSchema ?? {};
  return result;
}

function parseCommandOptions(parts) {
  const positionals = [];
  const options = { format: "text", limit: null, includeSchemas: false, server: null };
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === "--json") { options.format = "json"; continue; }
    if (part === "--schemas" || part === "--include-schemas") { options.includeSchemas = true; continue; }
    if (part === "--limit") { options.limit = normalizeLimit(parts[index + 1]); index += 1; continue; }
    if (part?.startsWith("--limit=")) { options.limit = normalizeLimit(part.slice("--limit=".length)); continue; }
    if (part === "--server") { options.server = parts[index + 1] || null; index += 1; continue; }
    if (part?.startsWith("--server=")) { options.server = part.slice("--server=".length) || null; continue; }
    positionals.push(part);
  }
  return { positionals, options };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const liveApprovalFingerprints = new Map();

function rememberApproval(toolCallId, fingerprint) {
  if (!toolCallId) return;
  liveApprovalFingerprints.set(toolCallId, fingerprint);
  if (liveApprovalFingerprints.size > 1000) {
    const oldest = liveApprovalFingerprints.keys().next().value;
    if (oldest) liveApprovalFingerprints.delete(oldest);
  }
}

function consumeApproval(toolCallId, fingerprint) {
  if (!toolCallId) return false;
  const matched = liveApprovalFingerprints.get(toolCallId) === fingerprint;
  if (matched) liveApprovalFingerprints.delete(toolCallId);
  return matched;
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) return { version: CACHE_VERSION, servers: {} };
  const parsed = readJsonFile(CACHE_PATH);
  if (!isRecord(parsed) || !isRecord(parsed.servers)) return { version: CACHE_VERSION, servers: {} };
  return { version: CACHE_VERSION, servers: parsed.servers };
}

function saveCache(cache) {
  writeJsonFile(CACHE_PATH, { version: CACHE_VERSION, servers: cache.servers ?? {} });
}

function findUp(startDir, relativePath) {
  let current = path.resolve(startDir || process.cwd());
  const root = path.parse(current).root;
  while (true) {
    const candidate = path.join(current, relativePath);
    if (existsSync(candidate)) return candidate;
    if (current === root) return null;
    current = path.dirname(current);
  }
}

function getConfigCandidatePaths(cwd) {
  const globalConfig = path.join(homedir(), ".letta", "mcp.json");
  const projectConfig = findUp(cwd, ".mcp.json");
  const foundLettaProjectConfig = findUp(cwd, path.join(".letta", "mcp.json"));
  const lettaProjectConfig = foundLettaProjectConfig && path.resolve(foundLettaProjectConfig) !== path.resolve(globalConfig) ? foundLettaProjectConfig : null;
  return [
    { label: "global ~/.letta/mcp.json", path: globalConfig, exists: existsSync(globalConfig) },
    { label: "project .mcp.json", path: projectConfig || path.join(path.resolve(cwd || process.cwd()), ".mcp.json"), exists: Boolean(projectConfig) },
    { label: "project .letta/mcp.json", path: lettaProjectConfig || path.join(path.resolve(cwd || process.cwd()), ".letta", "mcp.json"), exists: Boolean(lettaProjectConfig) },
  ];
}

function interpolate(value, env = process.env) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => env[name] ?? "")
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name) => env[name] ?? "");
}

function normalizeServerEntry(server, baseDir) {
  const normalized = { ...server };
  if (Array.isArray(server.args)) normalized.args = server.args.map((item) => interpolate(String(item)));
  if (server.command !== undefined) normalized.command = interpolate(String(server.command));
  if (server.cwd !== undefined) {
    const cwd = interpolate(String(server.cwd));
    normalized.cwd = path.isAbsolute(cwd) ? cwd : path.resolve(baseDir, cwd);
  }
  if (isRecord(server.env)) {
    normalized.env = Object.fromEntries(Object.entries(server.env).map(([key, value]) => [key, interpolate(String(value))]));
  }
  if (server.url !== undefined) normalized.url = interpolate(String(server.url));
  if (isRecord(server.headers)) {
    normalized.headers = Object.fromEntries(Object.entries(server.headers).map(([key, value]) => [key, interpolate(String(value))]));
  }
  if (server.bearerToken !== undefined) normalized.bearerToken = interpolate(String(server.bearerToken));
  if (server.bearerTokenEnv !== undefined) normalized.bearerTokenEnv = String(server.bearerTokenEnv);
  return normalized;
}

function mergeConfig(base, next) {
  return {
    ...base,
    ...next,
    mcpServers: {
      ...(base.mcpServers ?? {}),
      ...(next.mcpServers ?? {}),
    },
    settings: base.settings || next.settings ? { ...(base.settings ?? {}), ...(next.settings ?? {}) } : undefined,
  };
}

function loadConfig(cwd) {
  const warnings = [];
  const globalConfig = path.join(homedir(), ".letta", "mcp.json");
  const projectConfig = findUp(cwd, ".mcp.json");
  const foundLettaProjectConfig = findUp(cwd, path.join(".letta", "mcp.json"));
  const lettaProjectConfig = foundLettaProjectConfig && path.resolve(foundLettaProjectConfig) !== path.resolve(globalConfig) ? foundLettaProjectConfig : null;
  const sources = [existsSync(globalConfig) ? globalConfig : null, projectConfig, lettaProjectConfig].filter(Boolean);
  let config = { mcpServers: {}, settings: {} };
  let globalSettings = {};
  let projectSettings = {};

  for (const sourcePath of sources) {
    const parsed = readJsonFile(sourcePath);
    if (parsed?.__error) {
      warnings.push(`Invalid JSON in ${sourcePath}: ${parsed.__error}`);
      continue;
    }
    if (!isRecord(parsed)) {
      warnings.push(`Invalid MCP config in ${sourcePath}: root must be an object.`);
      continue;
    }
    if (parsed.mcpServers !== undefined && !isRecord(parsed.mcpServers)) {
      warnings.push(`Invalid MCP config in ${sourcePath}: mcpServers must be an object.`);
      continue;
    }
    const settings = parsed.settings === undefined
      ? {}
      : isRecord(parsed.settings)
        ? parsed.settings
        : null;
    if (!settings) {
      warnings.push(`Invalid MCP config in ${sourcePath}: settings must be an object.`);
      continue;
    }
    const baseDir = path.dirname(sourcePath);
    const mcpServers = {};
    for (const [name, server] of Object.entries(parsed.mcpServers ?? {})) {
      if (!isRecord(server)) {
        warnings.push(`Invalid MCP server "${name}" in ${sourcePath}: entry must be an object.`);
        continue;
      }
      mcpServers[name] = normalizeServerEntry(server, baseDir);
    }
    config = mergeConfig(config, { ...parsed, settings, mcpServers });
    if (path.resolve(sourcePath) === path.resolve(globalConfig)) {
      globalSettings = { ...globalSettings, ...settings };
    } else {
      projectSettings = { ...projectSettings, ...settings };
    }
  }

  return { config, globalSettings, projectSettings, sources, warnings };
}

function isPathInsideOrEqual(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath));
}

function resolveTrustedRoot(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const interpolated = interpolate(value.trim());
  if (interpolated === "~") return homedir();
  if (interpolated.startsWith(`~${path.sep}`) || interpolated.startsWith("~/")) {
    return path.resolve(homedir(), interpolated.slice(2));
  }
  return path.resolve(interpolated);
}

function getLiveApprovalPolicy(cwd, state = getServerState(cwd)) {
  const currentCwd = path.resolve(cwd || process.cwd());
  const projectMode = String(state.projectSettings?.liveApproval || "").toLowerCase();
  const globalMode = String(state.globalSettings?.liveApproval || "ask").toLowerCase();

  if (projectMode === "ask") {
    return { mode: "ask", reason: "project MCP settings require approval" };
  }

  if (globalMode === "auto") {
    return { mode: "auto", reason: "global ~/.letta/mcp.json explicitly enables live auto-approval" };
  }

  if (projectMode === "auto") {
    const trustedRoots = Array.isArray(state.globalSettings?.trustedLiveApprovalRoots)
      ? state.globalSettings.trustedLiveApprovalRoots.map(resolveTrustedRoot).filter(Boolean)
      : [];
    if (trustedRoots.some((rootPath) => isPathInsideOrEqual(rootPath, currentCwd))) {
      return { mode: "auto", reason: "project auto-approval is allowed by a globally trusted root" };
    }
    return { mode: "ask", reason: "project auto-approval request ignored because this cwd is not globally trusted" };
  }

  return { mode: "ask", reason: "live actions require approval" };
}

function hashSecret(value) {
  return value ? createHash("sha256").update(String(value)).digest("hex").slice(0, 16) : null;
}

function commandHash(server) {
  if (server.url) {
    const token = resolveBearerTokenValue("hash", server, process.env, false);
    const safe = {
      url: server.url ?? null,
      transport: server.transport ?? "auto",
      headers: isRecord(server.headers) ? server.headers : {},
      auth: server.auth ?? null,
      bearerTokenEnv: server.bearerTokenEnv ?? null,
      bearerTokenHash: hashSecret(token),
    };
    return createHash("sha256").update(JSON.stringify(safe)).digest("hex").slice(0, 16);
  }
  const safe = {
    command: server.command ?? null,
    args: Array.isArray(server.args) ? server.args : [],
    cwd: server.cwd ?? null,
    envKeys: isRecord(server.env) ? Object.keys(server.env).sort() : [],
  };
  return createHash("sha256").update(JSON.stringify(safe)).digest("hex").slice(0, 16);
}

function normalizeToolName(name) {
  return String(name || "tool").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "tool";
}

function exposedToolName(serverName, originalName) {
  return normalizeToolName(`${serverName}_${originalName}`);
}

function shortHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 6);
}

function collisionSafeName(baseName, originalName, usedNames) {
  if (!usedNames.has(baseName)) return baseName;
  const suffix = shortHash(originalName || baseName);
  const maxBaseLength = Math.max(1, 64 - suffix.length - 1);
  let candidate = `${baseName.slice(0, maxBaseLength)}_${suffix}`;
  let counter = 2;
  while (usedNames.has(candidate)) {
    const counterSuffix = `${suffix}_${counter}`;
    candidate = `${baseName.slice(0, Math.max(1, 64 - counterSuffix.length - 1))}_${counterSuffix}`;
    counter += 1;
  }
  return candidate;
}

function getServerState(cwd) {
  const loaded = loadConfig(cwd);
  const cache = loadCache();
  const servers = new Map();
  for (const [name, server] of Object.entries(loaded.config.mcpServers ?? {})) {
    const hash = commandHash(server);
    const entry = cache.servers?.[name] ?? null;
    const cacheValid = !!entry && entry.commandHash === hash;
    const tools = cacheValid && Array.isArray(entry.tools) ? entry.tools : [];
    servers.set(name, { name, definition: server, commandHash: hash, cacheEntry: entry, cacheValid, tools });
  }
  return { ...loaded, cache, servers };
}

function validateStdioServer(serverName, server) {
  if (server.url) return `Server "${serverName}" is configured as HTTP; expected stdio command.`;
  if (!server.command || typeof server.command !== "string") return `Server "${serverName}" is missing a stdio command.`;
  return null;
}

function isHttpServer(server) {
  return Boolean(server?.url);
}

function resolveHttpUrl(serverName, server) {
  if (!server.url) throw new Error(`Server "${serverName}" is missing url.`);
  let url;
  try { url = new URL(server.url); } catch (error) {
    throw new Error(`Server "${serverName}" has invalid URL: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Server "${serverName}" uses unsupported URL protocol "${url.protocol}". Use http: or https:.`);
  }
  return url;
}

function resolveHttpMode(server) {
  const mode = server.transport ?? "auto";
  if (mode === "auto" || mode === "streamable-http" || mode === "sse") return mode;
  throw new Error('HTTP MCP transport must be "auto", "streamable-http", or "sse".');
}

function resolveBearerTokenValue(serverName, server, env = process.env, throwOnMissing = true) {
  if (server.bearerTokenEnv) {
    const token = env[server.bearerTokenEnv];
    if (token) return token;
    if (throwOnMissing) throw new Error(`Server "${serverName}" references bearerTokenEnv "${server.bearerTokenEnv}", but it is not set.`);
    return undefined;
  }
  if (server.bearerToken) return server.bearerToken;
  if (server.auth === "bearer" && throwOnMissing) {
    throw new Error(`Server "${serverName}" requires bearer auth but no bearer token was resolved.`);
  }
  return undefined;
}

function resolveHttpHeaders(serverName, server, env = process.env) {
  const headers = { ...(isRecord(server.headers) ? server.headers : {}) };
  const token = resolveBearerTokenValue(serverName, server, env, true);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function mergeHeaders(base, extra) {
  const headers = new Headers(base);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
}

function validateServerConfig(serverName, server) {
  if (isHttpServer(server)) {
    try {
      resolveHttpUrl(serverName, server);
      resolveHttpMode(server);
      resolveBearerTokenValue(serverName, server, process.env, false);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return validateStdioServer(serverName, server);
}

class JsonRpcStdioClient {
  constructor(serverName, server, options = {}) {
    this.serverName = serverName;
    this.server = server;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.buffer = "";
    this.closed = false;
    this.initialized = false;
    this.starting = null;
    this.commandHash = options.commandHash ?? null;
  }

  async start(signal) {
    if (this.initialized && !this.closed) return;
    if (this.starting) return await this.starting;
    this.starting = this.startInternal(signal);
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async startInternal(signal) {
    const invalid = validateStdioServer(this.serverName, this.server);
    if (invalid) throw new Error(invalid);
    const cwd = this.server.cwd || process.cwd();
    const env = { ...process.env, ...(isRecord(this.server.env) ? this.server.env : {}) };
    this.child = spawn(this.server.command, Array.isArray(this.server.args) ? this.server.args : [], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4000);
    });
    this.child.on("error", (error) => {
      this.closed = true;
      this.initialized = false;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Failed to start MCP server "${this.serverName}": ${error.message}`));
      }
      this.pending.clear();
    });
    this.child.on("exit", (code, exitSignal) => {
      this.closed = true;
      this.initialized = false;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP server "${this.serverName}" exited (${code ?? exitSignal ?? "unknown"}).${this.stderr ? ` stderr: ${this.stderr.trim()}` : ""}`));
      }
      this.pending.clear();
    });
    if (signal) {
      if (signal.aborted) throw new Error("MCP request cancelled before start.");
      signal.addEventListener("abort", () => this.close(), { once: true });
    }
    await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mahiro-mcp-proxy", version: MOD_VERSION },
    });
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  onStdout(chunk) {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index < 0) return;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      const message = safeJsonParse(line);
      if (!message || message.id === undefined) continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  request(method, params = {}) {
    if (this.closed) return Promise.reject(new Error(`MCP server "${this.serverName}" is closed.`));
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${this.timeoutMs}ms.${this.stderr ? ` stderr: ${this.stderr.trim()}` : ""}`));
        this.close();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  notify(method, params = {}) {
    if (this.closed) return;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`, "utf8");
  }

  async listTools(signal) {
    await this.start(signal);
    const result = await this.request("tools/list", {});
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(toolName, args, signal) {
    await this.start(signal);
    return await this.request("tools/call", { name: toolName, arguments: args ?? {} });
  }

  close() {
    if (!this.child || this.closed) return;
    this.closed = true;
    this.initialized = false;
    try { this.child.stdin.end(); } catch {}
    try { this.child.kill("SIGTERM"); } catch {}
    setTimeout(() => {
      try { if (this.child && !this.child.killed) this.child.kill("SIGKILL"); } catch {}
    }, 500).unref?.();
  }
}

async function loadMcpSdkHttp() {
  try {
    const [{ Client }, { StreamableHTTPClientTransport }, { SSEClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
      import("@modelcontextprotocol/sdk/client/sse.js"),
    ]);
    return { Client, StreamableHTTPClientTransport, SSEClientTransport };
  } catch (error) {
    throw new Error(`HTTP/SSE MCP requires @modelcontextprotocol/sdk in the packaged mod runtime: ${error instanceof Error ? error.message : String(error)}`);
  }
}

class SdkHttpClient {
  constructor(serverName, server, options = {}) {
    this.serverName = serverName;
    this.server = server;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.client = null;
    this.transport = null;
    this.transportKind = null;
    this.closed = false;
  }

  async start(signal) {
    if (this.client && !this.closed) return;
    const mode = resolveHttpMode(this.server);
    const errors = [];
    if (mode === "streamable-http" || mode === "auto") {
      try { await this.connectKind("streamable-http", signal); return; }
      catch (error) { if (mode !== "auto") throw error; errors.push(error); }
    }
    if (mode === "sse" || mode === "auto") {
      try { await this.connectKind("sse", signal); return; }
      catch (error) { errors.push(error); }
    }
    throw new Error(`Failed to connect to "${this.serverName}" over HTTP MCP. ${errors.map((error) => error instanceof Error ? error.message : String(error)).join(". ")}`);
  }

  async connectKind(kind, signal) {
    const { Client, StreamableHTTPClientTransport, SSEClientTransport } = await loadMcpSdkHttp();
    const url = resolveHttpUrl(this.serverName, this.server);
    const headers = resolveHttpHeaders(this.serverName, this.server, process.env);
    const client = new Client({ name: "mahiro-mcp-proxy", version: MOD_VERSION }, { capabilities: {} });
    const transport = kind === "streamable-http"
      ? new StreamableHTTPClientTransport(url, { requestInit: { headers } })
      : new SSEClientTransport(url, {
          requestInit: { headers },
          eventSourceInit: {
            fetch: async (input, init) => fetch(input, { ...init, headers: mergeHeaders(init?.headers, headers) }),
          },
        });
    try {
      await client.connect(transport, { signal, timeout: this.timeoutMs });
      this.client = client;
      this.transport = transport;
      this.transportKind = kind;
      this.closed = false;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw new Error(`${kind} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listTools(signal) {
    await this.start(signal);
    const tools = [];
    const seen = new Set();
    for (let page = 0, cursor = undefined; page < 1000; page += 1) {
      const result = await this.client.listTools(cursor ? { cursor } : undefined, { signal, timeout: this.timeoutMs });
      tools.push(...(Array.isArray(result.tools) ? result.tools : []));
      cursor = result.nextCursor;
      if (!cursor) break;
      if (seen.has(cursor)) throw new Error(`MCP tools metadata repeated cursor "${cursor}".`);
      seen.add(cursor);
    }
    return tools;
  }

  async callTool(toolName, args, signal) {
    await this.start(signal);
    return await this.client.callTool({ name: toolName, arguments: args ?? {} }, undefined, { signal, timeout: this.timeoutMs });
  }

  close() {
    this.closed = true;
    this.client?.close?.().catch?.(() => undefined);
  }
}

const stdioConnections = new Map();

function isStdioConnectionReusable(serverName, commandHash) {
  const client = stdioConnections.get(serverName);
  return Boolean(client && !client.closed && client.initialized && client.commandHash === commandHash);
}

function closeStdioConnection(serverName) {
  const client = stdioConnections.get(serverName);
  stdioConnections.delete(serverName);
  if (client) client.close();
}

function closeAllStdioConnections() {
  for (const client of stdioConnections.values()) client.close();
  stdioConnections.clear();
}

function disconnectStdioConnection(serverName) {
  if (!serverName || serverName === "all") {
    const count = stdioConnections.size;
    closeAllStdioConnections();
    return `Disconnected ${count} MCP stdio ${count === 1 ? "connection" : "connections"}.`;
  }
  const existed = stdioConnections.has(serverName);
  closeStdioConnection(serverName);
  return existed ? `Disconnected MCP stdio server "${serverName}".` : `No live MCP stdio connection for "${serverName}".`;
}

async function getStdioClient(serverName, serverState, timeoutMs, signal, options = {}) {
  const existing = stdioConnections.get(serverName);
  if (!options.forceReconnect && existing && !existing.closed && existing.commandHash === serverState.commandHash) {
    await existing.start(signal);
    return existing;
  }
  if (existing) closeStdioConnection(serverName);
  const client = new JsonRpcStdioClient(serverName, serverState.definition, { timeoutMs, commandHash: serverState.commandHash });
  stdioConnections.set(serverName, client);
  try {
    await client.start(signal);
    return client;
  } catch (error) {
    stdioConnections.delete(serverName);
    client.close();
    throw error;
  }
}

async function refreshServer(cwd, serverName, signal) {
  const state = getServerState(cwd);
  const serverState = state.servers.get(serverName);
  if (!serverState) return `Server "${serverName}" is not configured. Add it to .mcp.json first.`;
  const timeoutMs = Number(state.config.settings?.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const client = isHttpServer(serverState.definition)
    ? new SdkHttpClient(serverName, serverState.definition, { timeoutMs })
    : await getStdioClient(serverName, serverState, timeoutMs, signal, { forceReconnect: true });
  try {
    const rawTools = await client.listTools(signal);
    const usedNames = new Set();
    const tools = rawTools.map((tool) => {
      const originalName = String(tool.name || "");
      const baseName = exposedToolName(serverName, originalName);
      const name = collisionSafeName(baseName, originalName, usedNames);
      usedNames.add(name);
      return {
        name,
        originalName,
        description: String(tool.description || ""),
        inputSchema: tool.inputSchema ?? { type: "object", properties: {}, additionalProperties: true },
      };
    });
    const cache = loadCache();
    cache.servers[serverName] = {
      updatedAt: nowIso(),
      commandHash: serverState.commandHash,
      tools,
    };
    saveCache(cache);
    const transportNote = isHttpServer(serverState.definition)
      ? ` via ${client.transportKind || resolveHttpMode(serverState.definition)}`
      : "; connection kept alive";
    return `MCP server "${serverName}" refreshed: ${tools.length} cached ${tools.length === 1 ? "tool" : "tools"}${transportNote}.`;
  } finally {
    if (isHttpServer(serverState.definition)) client.close();
  }
}

function formatStatus(cwd) {
  const state = getServerState(cwd);
  const liveApproval = getLiveApprovalPolicy(cwd, state);
  const lines = [`mahiro-mcp-proxy: ${state.servers.size} configured servers.`];
  if (state.sources.length) lines.push(`Config: ${state.sources.join(", ")}`);
  else lines.push("Config: no project .mcp.json or .letta/mcp.json found.");
  lines.push(`Live approval: ${liveApproval.mode} (${liveApproval.reason}).`);
  if (state.warnings.length) lines.push("", "Warnings:", ...state.warnings.map((warning) => `- ${warning}`));
  if (!state.servers.size) {
    lines.push("", "Create .mcp.json with { \"mcpServers\": { ... } }.");
    return lines.join("\n");
  }
  lines.push("");
  for (const server of state.servers.values()) {
    const invalid = validateServerConfig(server.name, server.definition);
    const connected = isStdioConnectionReusable(server.name, server.commandHash) ? ", connected" : "";
    const suffix = invalid ? `unsupported: ${invalid}` : server.cacheValid ? `${server.tools.length} cached tools${connected}` : server.cacheEntry ? `stale cache${connected}` : `no cache${connected}`;
    lines.push(`- ${server.name}: ${suffix}`);
  }
  return lines.join("\n");
}

function allCachedTools(state) {
  const tools = [];
  for (const server of state.servers.values()) {
    if (!server.cacheValid) continue;
    for (const tool of server.tools) tools.push({ ...tool, serverName: server.name });
  }
  return tools;
}

function listTools(cwd, serverName, includeSchemas = false, options = {}) {
  const state = getServerState(cwd);
  const servers = serverName ? [state.servers.get(serverName)] : [...state.servers.values()];
  if (serverName && !servers[0]) return `Server "${serverName}" is not configured.`;
  const limit = normalizeLimit(options.limit);
  const json = isJsonFormat(options.format);
  const rows = [];
  const lines = [];
  for (const server of servers) {
    if (!server) continue;
    if (!server.cacheEntry) {
      if (json) rows.push({ serverName: server.name, cacheState: "missing", tools: [] });
      else lines.push(`${server.name}: no cache. Run /mcp-proxy reconnect ${server.name}.`);
      continue;
    }
    if (!server.cacheValid) {
      if (json) rows.push({ serverName: server.name, cacheState: "stale", tools: [] });
      else lines.push(`${server.name}: stale cache. Run /mcp-proxy reconnect ${server.name}.`);
      continue;
    }
    const slicedTools = limit ? server.tools.slice(0, limit) : server.tools;
    if (json) {
      rows.push({
        serverName: server.name,
        cacheState: "valid",
        totalTools: server.tools.length,
        returnedTools: slicedTools.length,
        tools: slicedTools.map((tool) => pickToolFields({ ...tool, serverName: server.name }, includeSchemas)),
      });
      continue;
    }
    lines.push(`${server.name} (${server.tools.length} cached ${server.tools.length === 1 ? "tool" : "tools"}${limit && server.tools.length > limit ? `, showing ${slicedTools.length}` : ""}):`);
    if (!server.tools.length) {
      lines.push("  (no tools)");
      continue;
    }
    for (const tool of slicedTools) {
      lines.push(formatToolRow(tool));
      if (includeSchemas) lines.push(`    schema: ${formatSchemaCompact(tool.inputSchema).replace(/\n/g, "\n    ")}`);
    }
    if (limit && server.tools.length > limit) lines.push(`  ... ${server.tools.length - limit} more tools. Use --limit ${server.tools.length} or describe/search.`);
  }
  if (json) return truncateText(JSON.stringify({ servers: rows }, null, 2));
  return truncateText(lines.length ? lines.join("\n") : "No configured MCP servers.");
}

function formatSetup(cwd) {
  const state = getServerState(cwd);
  const candidates = getConfigCandidatePaths(cwd);
  const lines = [
    "mahiro-mcp-proxy setup",
    "=======================",
    "",
    `Current cwd: ${cwd || process.cwd()}`,
    "Precedence: global ~/.letta/mcp.json, then project .mcp.json, then project .letta/mcp.json overrides matching servers/settings.",
    "Global config is loaded from ~/.letta/mcp.json in v0.2.",
    "",
    "Config paths:",
    ...candidates.map((candidate) => `- ${candidate.exists ? "loaded" : "missing"}: ${candidate.label} -> ${candidate.path}`),
    "",
    `Cache: ${CACHE_PATH}`,
    "",
    "Configured servers:",
  ];
  if (!state.servers.size) {
    lines.push("- (none)");
  } else {
    for (const server of state.servers.values()) {
      const invalid = validateServerConfig(server.name, server.definition);
      const connected = isStdioConnectionReusable(server.name, server.commandHash) ? ", connected" : "";
      const cache = server.cacheValid ? `${server.tools.length} cached tools${connected}` : server.cacheEntry ? `stale cache${connected}` : `no cache${connected}`;
      lines.push(`- ${server.name}: ${invalid || cache}`);
      lines.push(`  command: ${server.definition.command || "(none)"}${Array.isArray(server.definition.args) && server.definition.args.length ? " [args hidden]" : ""}`);
      if (server.definition.cwd) lines.push(`  cwd: ${server.definition.cwd}`);
      if (isRecord(server.definition.env)) lines.push(`  env keys: ${Object.keys(server.definition.env).sort().join(", ") || "(none)"}`);
    }
  }
  lines.push(
    "",
    "Minimal local config example:",
    JSON.stringify({
      settings: { timeoutMs: 30000 },
      mcpServers: {
        "cocoindex-code": { command: "ccc", args: ["mcp"], cwd: cwd || process.cwd() },
      },
    }, null, 2),
    "",
    "Read-only model tool: mcp_proxy. Live model tool: mcp_proxy_live (approval-gated).",
    "Project liveApproval=auto is ignored unless the current cwd is inside a global settings.trustedLiveApprovalRoots entry; global liveApproval=auto remains an explicit user-level override.",
    "Slash /mcp-proxy reconnect/call are explicit human commands; agents should prefer mcp_proxy_live for live actions.",
    "Live stdio connections are reused until reload, disconnect, process exit, or config hash change.",
    "Next: reconnect a server only when needed, then inspect via /mcp-proxy tools <server> or /mcp-proxy search <query>.",
  );
  return truncateText(lines.join("\n"));
}

function searchTools(cwd, query, includeSchemas = false, options = {}) {
  const state = getServerState(cwd);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return "Search query is required.";
  if (options.server && !state.servers.has(options.server)) return `Server "${options.server}" is not configured.`;
  const candidates = allCachedTools(state).filter((tool) => !options.server || tool.serverName === options.server);
  const allMatches = candidates.filter((tool) => `${tool.name} ${tool.originalName} ${tool.description}`.toLowerCase().includes(q));
  if (!allMatches.length) return `No cached MCP tools matched "${query}". Run /mcp-proxy reconnect <server> first if cache is missing.`;
  const limit = normalizeLimit(options.limit, 20);
  const matches = limit ? allMatches.slice(0, limit) : allMatches;
  if (isJsonFormat(options.format)) {
    return truncateText(JSON.stringify({
      query,
      totalMatches: allMatches.length,
      returnedMatches: matches.length,
      matches: matches.map((tool) => pickToolFields(tool, includeSchemas)),
    }, null, 2));
  }
  const output = matches.map((tool) => {
    const lines = [`${tool.name} (${tool.serverName})`, `  original: ${tool.originalName}`, `  ${compactDescription(tool.description) || "(no description)"}`];
    if (includeSchemas) lines.push(`  schema: ${formatSchemaCompact(tool.inputSchema).replace(/\n/g, "\n  ")}`);
    return lines.join("\n");
  });
  if (allMatches.length > matches.length) output.push(`... ${allMatches.length - matches.length} more matches. Use limit to show more.`);
  return truncateText(output.join("\n\n"));
}

function describeTool(cwd, requested) {
  const state = getServerState(cwd);
  const name = String(requested || "").trim();
  if (!name) return "Tool name is required.";
  const matches = allCachedTools(state).filter((tool) => tool.name === name || tool.originalName === name);
  if (!matches.length) return `No cached MCP tool named "${name}". Run /mcp-proxy search <query> or /mcp-proxy reconnect <server>.`;
  if (matches.length > 1) return `Tool "${name}" is ambiguous. Use the exposed name: ${matches.map((tool) => tool.name).join(", ")}`;
  const tool = matches[0];
  return truncateText([`Tool: ${tool.name}`, `Server: ${tool.serverName}`, `Original: ${tool.originalName}`, `Description: ${tool.description || "(none)"}`, "Parameters:", formatSchemaCompact(tool.inputSchema)].join("\n"));
}

function resolveTool(cwd, requested, serverName) {
  const state = getServerState(cwd);
  const name = String(requested || "").trim();
  const candidates = allCachedTools(state).filter((tool) => (!serverName || tool.serverName === serverName) && (tool.name === name || tool.originalName === name));
  if (!candidates.length) return { ok: false, message: `No cached MCP tool named "${name}". Run /mcp reconnect <server> first.` };
  if (candidates.length > 1) return { ok: false, message: `Tool "${name}" is ambiguous. Provide server or use one of: ${candidates.map((tool) => tool.name).join(", ")}` };
  const tool = candidates[0];
  const server = state.servers.get(tool.serverName);
  if (!server) return { ok: false, message: `Server "${tool.serverName}" is not configured.` };
  return { ok: true, state, server, tool };
}

function parseArgsJson(raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: {} };
  if (isRecord(raw)) return { ok: true, value: raw };
  if (typeof raw !== "string") return { ok: false, message: "args must be a JSON string or object." };
  const parsed = safeJsonParse(raw, undefined);
  if (!isRecord(parsed)) return { ok: false, message: "args must parse to a JSON object." };
  return { ok: true, value: parsed };
}

function renderToolResult(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  if (!content.length) return truncateText(JSON.stringify(result ?? {}, null, 2));
  const parts = content.map((item) => {
    if (item?.type === "text") return String(item.text ?? "");
    return JSON.stringify(item);
  });
  return truncateText(parts.join("\n"));
}

async function callCachedTool(cwd, requested, rawArgs, serverName, signal) {
  const parsed = parseArgsJson(rawArgs);
  if (!parsed.ok) return parsed.message;
  const resolved = resolveTool(cwd, requested, serverName);
  if (!resolved.ok) return resolved.message;
  const timeoutMs = Number(resolved.state.config.settings?.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const client = isHttpServer(resolved.server.definition)
    ? new SdkHttpClient(resolved.server.name, resolved.server.definition, { timeoutMs })
    : await getStdioClient(resolved.server.name, resolved.server, timeoutMs, signal);
  try {
    const result = await client.callTool(resolved.tool.originalName, parsed.value, signal);
    return renderToolResult(result);
  } finally {
    if (isHttpServer(resolved.server.definition)) client.close();
  }
}

async function executeProxy(args, ctx) {
  const action = String(args.action || "status").toLowerCase();
  if (action === "status") return formatStatus(ctx.cwd);
  if (action === "setup") return formatSetup(ctx.cwd);
  if (action === "list" || action === "tools") return listTools(ctx.cwd, args.server, args.includeSchemas === true, { format: args.format, limit: args.limit });
  if (action === "search") return searchTools(ctx.cwd, args.query, args.includeSchemas === true, { format: args.format, limit: args.limit, server: args.server });
  if (action === "describe") return describeTool(ctx.cwd, args.tool || args.query);
  if (action === "reconnect" || action === "call") {
    return `Action "${action}" is live and approval-gated. Use mcp_proxy_live({ action: "${action}", ... }) instead.`;
  }
  return `Unknown action "${action}". Use status, setup, list, tools, search, or describe.`;
}

async function executeLiveProxy(args, ctx) {
  const action = String(args.action || "").toLowerCase();
  if (action === "reconnect") {
    const server = String(args.server || "").trim();
    if (!server) return "server is required for reconnect.";
    return await refreshServer(ctx.cwd, server, ctx.signal);
  }
  if (action === "call") {
    const tool = String(args.tool || "").trim();
    if (!tool) return "tool is required for call.";
    return await callCachedTool(ctx.cwd, tool, args.args, args.server, ctx.signal);
  }
  if (action === "disconnect") {
    return disconnectStdioConnection(String(args.server || "all").trim() || "all");
  }
  return `Unknown live action "${action}". Use reconnect, call, or disconnect.`;
}

function permissionForProxy(event) {
  const action = String(event.args?.action || "status").toLowerCase();
  if (event.toolName === "mcp_proxy") {
    if (["status", "setup", "list", "tools", "search", "describe"].includes(action)) return { decision: "allow", reason: "mahiro-mcp-proxy cached/read-only operation." };
    if (["reconnect", "call"].includes(action)) return { decision: "deny", reason: `Use mcp_proxy_live for live ${action}; mcp_proxy is read-only.` };
    return { decision: "deny", reason: `Unknown mahiro-mcp-proxy action "${action}".` };
  }
  if (event.toolName === "mcp_proxy_live") {
    if (["reconnect", "call", "disconnect"].includes(action)) {
      const cwd = event.cwd || event.workingDirectory || process.cwd();
      const liveApproval = getLiveApprovalPolicy(cwd);
      if (liveApproval.mode === "auto") {
        return { decision: "allow", reason: `mahiro-mcp-proxy live action auto-approved: ${liveApproval.reason}.` };
      }
      const fingerprint = stableStringify({ action, args: event.args, cwd: event.cwd || event.workingDirectory || "" });
      if (event.phase === "approval") {
        rememberApproval(event.toolCallId, fingerprint);
        return { decision: "ask", reason: `mahiro-mcp-proxy live ${action} may start, stop, or use an MCP stdio process.` };
      }
      if (event.phase === "execution" && consumeApproval(event.toolCallId, fingerprint)) {
        return { decision: "allow", reason: `mahiro-mcp-proxy live ${action} approved before execution.` };
      }
      return { decision: "deny", reason: `mahiro-mcp-proxy live ${action} reached execution without a matching approval.` };
    }
    return { decision: "deny", reason: `Unknown mahiro-mcp-proxy live action "${action}".` };
  }
  return undefined;
}

function commandHelp() {
  return [
    "mahiro-mcp-proxy commands:",
    "  /mcp-proxy status",
    "  /mcp-proxy setup",
    "  /mcp-proxy tools [server] [--limit N] [--json] [--schemas]",
    "  /mcp-proxy reconnect <server>",
    "  /mcp-proxy disconnect [server|all]",
    "  /mcp-proxy search <query> [--server name] [--limit N] [--json] [--schemas]",
    "  /mcp-proxy describe <tool>",
    "  /mcp-proxy call <tool> [json-args]",
    "",
    "Config: global ~/.letta/mcp.json plus optional project .mcp.json/.letta/mcp.json overrides.",
    "Read-only model tool: mcp_proxy({ action, server, query, tool, format, limit }).",
    "Live model tool: mcp_proxy_live({ action: 'reconnect'|'call'|'disconnect', server, tool, args }) (approval-gated).",
    "Read-only actions: status, setup, list/tools, search, describe. Live actions: reconnect, call, disconnect.",
    "Persistent stdio connections are reused until reload/disconnect/process exit/config change; HTTP/SSE uses SDK transport per live action.",
    "Note: slash reconnect/call are explicit human commands; agents should use mcp_proxy_live for live actions.",
  ].join("\n");
}

async function runCommand(ctx) {
  const input = String(ctx.args || "").trim();
  const [subRaw, ...tail] = input.split(/\s+/).filter(Boolean);
  const sub = (subRaw || "status").toLowerCase();
  const parsed = parseCommandOptions(tail);
  const rest = parsed.positionals.join(" ");
  if (["help", "--help", "-h"].includes(sub)) return { type: "output", output: commandHelp() };
  if (["status", "show"].includes(sub)) return { type: "output", output: formatStatus(ctx.cwd) };
  if (sub === "setup") return { type: "output", output: formatSetup(ctx.cwd) };
  if (["tools", "list"].includes(sub)) return { type: "output", output: listTools(ctx.cwd, parsed.positionals[0], parsed.options.includeSchemas, parsed.options) };
  if (sub === "reconnect" || sub === "connect") {
    if (!tail[0]) return { type: "output", success: false, output: "server is required." };
    return { type: "output", output: await refreshServer(ctx.cwd, tail[0], ctx.signal) };
  }
  if (sub === "disconnect") {
    return { type: "output", output: disconnectStdioConnection(tail[0] || "all") };
  }
  if (sub === "search") return { type: "output", output: searchTools(ctx.cwd, rest, parsed.options.includeSchemas, parsed.options) };
  if (sub === "describe") return { type: "output", output: describeTool(ctx.cwd, rest) };
  if (sub === "call") {
    const [tool, ...argParts] = tail;
    if (!tool) return { type: "output", success: false, output: "tool is required." };
    return { type: "output", output: await callCachedTool(ctx.cwd, tool, argParts.join(" "), undefined, ctx.signal) };
  }
  return { type: "output", success: false, output: `Unknown /mcp command "${sub}".\n\n${commandHelp()}` };
}

export default function activate(letta) {
  const disposers = [];
  const hasPermissionOverlay = Boolean(letta.capabilities?.permissions && letta.permissions);

  if (hasPermissionOverlay) {
    disposers.push(letta.permissions.register({
      id: "mahiro-mcp-proxy-permissions",
      description: "Gate mahiro-mcp-proxy reconnect and tool-call actions while allowing cached read-only operations.",
      check(event) {
        return permissionForProxy(event);
      },
    }));
  }

  if (letta.capabilities?.tools && letta.tools) {
    disposers.push(letta.tools.register({
      name: "mcp_proxy",
      description: "Read-only compact local MCP proxy. Use it to inspect cached MCP status/setup/list/search/describe from the current workspace. Use mcp_proxy_live for reconnect/call.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["status", "setup", "list", "tools", "search", "describe"], description: "Read-only operation to run. Defaults to status." },
          server: { type: "string", description: "Configured MCP server name for list/tools filtering." },
          query: { type: "string", description: "Search query, or fallback tool name for describe." },
          tool: { type: "string", description: "Cached exposed or original tool name for describe." },
          includeSchemas: { type: "boolean", description: "Include JSON schemas in list/search output." },
          format: { type: "string", enum: ["text", "json"], description: "Output format for list/search. Defaults to text." },
          limit: { type: "integer", description: "Maximum list/search rows to return, capped at 100." },
        },
        additionalProperties: false,
      },
      // Read-only cached operations should not prompt.
      requiresApproval: false,
      parallelSafe: false,
      async run(ctx) {
        return await executeProxy(ctx.args ?? {}, ctx);
      },
    }));

    if (hasPermissionOverlay) {
      disposers.push(letta.tools.register({
        name: "mcp_proxy_live",
        description: "Policy-gated live MCP proxy. Use it to reconnect/disconnect configured stdio MCP servers or call cached MCP tools from the current workspace after reviewing cached metadata.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["reconnect", "call", "disconnect"], description: "Live operation to run." },
            server: { type: "string", description: "Configured MCP server name for reconnect/call disambiguation." },
            tool: { type: "string", description: "Cached exposed or original tool name for action=call." },
            args: { type: "string", description: "JSON object string for tool arguments when action=call." },
          },
          required: ["action"],
          additionalProperties: false,
        },
        requiresApproval: false,
        approvalPolicy: "auto",
        parallelSafe: false,
        async run(ctx) {
          return await executeLiveProxy(ctx.args ?? {}, ctx);
        },
      }));
    } else {
      letta.diagnostics?.report?.({
        message: "mahiro-mcp-proxy live tool disabled because the permissions capability is unavailable.",
        severity: "warning",
      });
    }
  }

  if (letta.capabilities?.commands && letta.commands) {
    disposers.push(letta.commands.register({
      id: "mcp-proxy",
      description: "Inspect and refresh project stdio MCP servers through mahiro-mcp-proxy.",
      args: "[status|setup|tools|reconnect|disconnect|search|describe|call|help] [...]",
      run: runCommand,
    }));
  }

  return () => {
    closeAllStdioConnections();
    for (const dispose of disposers.reverse()) dispose();
  };
}
