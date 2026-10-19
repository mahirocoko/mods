import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const canonical = (value) => {
  try {
    return realpathSync(value);
  } catch {
    return undefined;
  }
};
let root = dirname(require.resolve("@gotgenes/pi-subagents"));
while (!existsSync(join(root, "package.json"))) {
  const parent = dirname(root);
  if (parent === root) throw new Error("Pi guard: subagents package metadata missing");
  root = parent;
}
const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (metadata.name !== "@gotgenes/pi-subagents" || metadata.version !== "23.4.1") {
  throw new Error("Pi guard: unexpected subagents package identity");
}
const entryPaths = new Set(metadata.pi.extensions.map((entry) => canonical(join(root, entry))));
const metaTools = new Set(["subagent", "get_subagent_result", "steer_subagent"]);

// The sole authored package checkout, not an arbitrary same-name package copy.
const continuityRoot = fileURLToPath(new URL("../../../mahiro-pi/", import.meta.url));
export function trustedRecallTool(tool) {
  if (!["recall_search", "recall_read"].includes(tool?.name)) return false;
  const source = tool.sourceInfo;
  try {
    const expected = canonical(continuityRoot);
    if (
      !expected ||
      source?.origin !== "package" ||
      !["user", "project", "temporary"].includes(source.scope) ||
      // source.source is the authored package reference, relative to settings,
      // not ctx.cwd. The SDK-resolved baseDir owns the actual package identity.
      canonical(source.baseDir) !== expected ||
      canonical(source.path) !== canonical(join(expected, "extensions/mahiro-continuity.ts"))
    )
      return false;
    const pkg = JSON.parse(readFileSync(join(expected, "package.json"), "utf8"));
    return (
      pkg.name === "@mahirocoko/mahiro-pi" &&
      pkg.version === "0.2.0" &&
      pkg.pi?.extensions?.includes("./extensions/mahiro-continuity.ts") === true
    );
  } catch {
    return false;
  }
}

export function trustedMemoryTool(tool) {
  if (!["agent_memory_read", "agent_memory_edit", "agent_memory_commit", "agent_memory_manage", "agent_memory_reflect"].includes(tool?.name)) return false;
  const source = tool.sourceInfo;
  try {
    const expected = canonical(continuityRoot);
    if (!expected || source?.origin !== "package" || !["user", "project", "temporary"].includes(source.scope) || canonical(source.baseDir) !== expected || canonical(source.path) !== canonical(join(expected, "extensions/mahiro-agent-memory.ts"))) return false;
    const pkg = JSON.parse(readFileSync(join(expected, "package.json"), "utf8"));
    return pkg.name === "@mahirocoko/mahiro-pi" && pkg.version === "0.2.0" && pkg.pi?.extensions?.includes("./extensions/mahiro-agent-memory.ts") === true;
  } catch { return false; }
}

// Reads only runtime ToolInfo; a name or caller-supplied approval flag is insufficient.
export function trustedMetaTool(tool) {
  const source = tool?.sourceInfo;
  if (!source) return false;
  if (metaTools.has(tool.name)) {
    return (
      source.origin === "package" &&
      ["user", "project", "temporary"].includes(source.scope) &&
      canonical(source.source) === canonical(root) &&
      entryPaths.has(canonical(source.path))
    );
  }
  if (source.path === "builtin:tool-search" && source.source === "builtin" && tool.name === "tool_search") return true;
  if (
    source.path !== "builtin:mcp" ||
    source.source !== "builtin" ||
    source.origin !== "top-level" ||
    source.scope !== "temporary"
  )
    return false;
  const namespace = tool.namespace;
  if (namespace?.name === "mcp__hirohiro" && namespace.aliases?.includes("hirohiro")) {
    return new Set([
      "mcp__hirohiro__read",
      "mcp__hirohiro__control",
      "mcp__hirohiro__interact",
      "mcp__hirohiro__trusted_interact",
    ]).has(tool.name);
  }
  return namespace?.name === "mcp__chrome_devtools" && namespace.aliases?.includes("chrome-devtools");
}
