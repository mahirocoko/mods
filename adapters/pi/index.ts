import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSubagentsService, SUBAGENT_EVENTS } from "@gotgenes/pi-subagents";
import { getPermissionsService } from "@gotgenes/pi-permission-system";
import { createGuardHost } from "./host.mjs";
import { trustedMetaTool } from "./provenance.mjs";

const registryKey = Symbol.for("@mahirocoko/pi-guards:healthy-nodes");
const nodes = (globalThis[registryKey] ??= new Map());

// Load this exact local package root, alongside the exact local upstream roots.
// Child excludedExtensionPackages must contain the subagents package SOURCE,
// never this adapter or permission-system. Upstream's default exclusion is empty.
export default async function activate(pi) {
  let sdk;
  try {
    sdk = await import("@earendil-works/pi-coding-agent");
  } catch (cause) {
    throw new Error("Pi guards inactive: public Pi SDK 1.3.0 peer unavailable; do not run unguarded", { cause });
  }
  const host = createGuardHost();
  let sessionId,
    parentService,
    latched = false;
  const generation = {};
  const children = new Set();
  const unsubscribes = [];
  let registered = false;
  const healthy = (id) => nodes.get(id)?.healthy?.() === true;
  const ownsContext = (ctx) =>
    sessionId &&
    ctx.sessionManager.getSessionId() === sessionId &&
    nodes.get(sessionId)?.generation === generation &&
    healthy(sessionId) &&
    !latched;
  const abortOwned = () => {
    latched = true;
    if (!parentService) return;
    // Conservative cancellation includes healthy siblings and queued work.
    for (const record of parentService.listAgents()) {
      if (["running", "queued"].includes(record.status)) parentService.abort(record.id);
    }
  };
  const names = ["read", "bash", "grep", "find", "ls", "write", "edit", "powershell"];
  for (const name of names) {
    const nativeName = name === "powershell" ? "PowerShell" : name[0].toUpperCase() + name.slice(1);
    const factory = sdk[`create${nativeName}ToolDefinition`];
    if (typeof factory !== "function") {
      host.dispose();
      throw new Error(`Pi guards inactive: missing public native ${name} factory`);
    }
    // Native definitions retain parameters, results, renderers and structured output.
    const native = factory(process.cwd());
    pi.registerTool({
      ...native,
      async execute(id, input, signal, update, ctx) {
        if (!ownsContext(ctx)) throw new Error("Pi guard node unhealthy; execution blocked");
        if (name === "powershell") throw new Error("Pi guard: PowerShell classifier unsupported; execution blocked");
        const classifierName = { find: "find_files", ls: "list_dir" }[name] ?? name;
        const args = await host.finalArgs(classifierName, input, ctx);
        if (signal?.aborted || !ownsContext(ctx)) throw new Error("Pi guard node unavailable; execution blocked");
        return native.execute(id, args, signal, update, ctx);
      },
    });
  }
  for (const tool of host.tools.values()) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      async execute(_id, input, signal, _update, ctx) {
        if (!ownsContext(ctx)) throw new Error("Pi guard node unhealthy; execution blocked");
        const args = await host.finalArgs(tool.name, input, ctx);
        if (signal?.aborted || !ownsContext(ctx)) throw new Error("Pi guard node unavailable; execution blocked");
        const result = await tool.run({ cwd: ctx.cwd, args, signal });
        if (result.status === "error") throw new Error(result.error || "Filtered configuration read failed.");
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      },
    });
  }
  const supported = new Set([...names, ...host.tools.keys(), "codemode"]);
  unsubscribes.push(
    pi.on("tool_call", (event) => {
      const tool = pi.getAllTools().find((tool) => tool.name === event.toolName);
      if (!supported.has(event.toolName) && !trustedMetaTool(tool)) {
        return { block: true, reason: "Pi guard: unsupported tool/alias dispatch blocked" };
      }
    }),
  );
  unsubscribes.push(
    pi.on("session_start", (_event, ctx) => {
      const id = ctx.sessionManager.getSessionId();
      if (sessionId && sessionId !== id) throw new Error("Pi guard session ownership changed; reload required");
      sessionId = id;
      // Capture once. A child's singleton publication must not replace this service.
      parentService ??= getSubagentsService();
      if (!registered) return;
      // Pi may reject a conflicting tool after its factory has returned while
      // retaining the extension's event handlers. Confirm actual public tool
      // ownership before publishing any health assurance.
      const owner = realpathSync(fileURLToPath(import.meta.url));
      const actualTools = pi.getAllTools();
      const complete = [...names, ...host.tools.keys()].every((name) => {
        const tool = actualTools.find((tool) => tool.name === name);
        // Child tool restrictions can make a registration unreachable. Only
        // publicly dispatchable names need an executable owner in this node.
        if (!tool) return true;
        try {
          return realpathSync(tool.sourceInfo.path) === owner;
        } catch {
          return false;
        }
      });
      if (!complete) {
        registered = false;
        host.dispose();
        return;
      }
      nodes.set(id, {
        generation,
        host,
        healthy: () =>
          registered &&
          nodes.get(id)?.generation === generation &&
          host.healthy &&
          !!getPermissionsService(id) &&
          !latched,
      });
    }),
  );
  unsubscribes.push(
    pi.events.on("subagents:child:bound", (event) => {
      if (event.parentSessionId !== sessionId) return;
      children.add(event.sessionId);
      if (!parentService || !healthy(event.sessionId) || latched) abortOwned();
    }),
  );
  unsubscribes.push(
    pi.events.on("subagents:child:disposed", (event) => {
      children.delete(event.sessionId);
    }),
  );
  unsubscribes.push(
    pi.events.on(SUBAGENT_EVENTS.RESUMING, (event) => {
      if (!parentService?.getRecord(event.id)) return;
      if ([...children].some((id) => !healthy(id))) latched = true;
      if (latched) abortOwned();
    }),
  );
  const dispose = () => {
    registered = false;
    if (nodes.get(sessionId)?.generation === generation) nodes.delete(sessionId);
    host.dispose();
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe?.();
  };
  unsubscribes.push(pi.on("session_shutdown", dispose));
  registered = true;
}
