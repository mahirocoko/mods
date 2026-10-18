import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSubagentsService, SUBAGENT_EVENTS } from "@gotgenes/pi-subagents";
import { getPermissionsService } from "@gotgenes/pi-permission-system";
import { createGuardHost } from "./host.mjs";
import { trustedMetaTool, trustedRecallTool } from "./provenance.mjs";
import { isAbsolute, relative, resolve, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const registryKey = Symbol.for("@mahirocoko/pi-guards:healthy-nodes");
const nodes = (globalThis[registryKey] ??= new Map());
// Shared across extension instances: session-created precedes child binding.
// Keep identities for the process lifetime so disposed children cannot become roots.
const nativeChildren = (nodes.nativeChildren ??= new Set());

// A scoped scalar permission: native unknown-surface maps do not match paths.
const learningPermission = (root) => {
  if (typeof root !== "string" || !isAbsolute(root) || root !== resolve(root))
    throw new Error("Continuity learning root must be canonical and absolute");
  return `continuity_learning_${createHash("sha256").update(root).digest("hex")}`;
};

// Load this exact local package root, alongside the exact local upstream roots.
// Child excludedExtensionPackages must contain the subagents package SOURCE,
// never this adapter or permission-system. Upstream's default exclusion is empty.
export default async function activate(pi) {
  let sdk;
  try {
    sdk = await import("@earendil-works/pi-coding-agent");
  } catch (cause) {
    throw new Error(
      "Pi guards inactive: public Pi SDK 1.3.0 peer unavailable; do not run unguarded",
      {
        cause,
      },
    );
  }
  const host = createGuardHost();
  let sessionId,
    sessionManager,
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
  const isPrimarySession = (ctx) => {
    if (
      !ownsContext(ctx) ||
      ctx.signal?.aborted ||
      ctx.sessionManager !== sessionManager ||
      nativeChildren.has(sessionId)
    )
      return false;
    const header = ctx.sessionManager.getHeader?.();
    return (
      header?.type === "session" && header.id === sessionId && header.parentSession === undefined
    );
  };
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
        if (name === "powershell")
          throw new Error("Pi guard: PowerShell classifier unsupported; execution blocked");
        const classifierName = { find: "find_files", ls: "list_dir" }[name] ?? name;
        const args = await host.finalArgs(classifierName, input, ctx);
        if (signal?.aborted || !ownsContext(ctx))
          throw new Error("Pi guard node unavailable; execution blocked");
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
        if (signal?.aborted || !ownsContext(ctx))
          throw new Error("Pi guard node unavailable; execution blocked");
        const result = await tool.run({ cwd: ctx.cwd, args, signal });
        if (result.status === "error")
          throw new Error(result.error || "Filtered configuration read failed.");
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      },
    });
  }
  const supported = new Set([...names, ...host.tools.keys(), "codemode"]);
  unsubscribes.push(
    pi.on("tool_call", (event) => {
      const tool = pi.getAllTools().find((tool) => tool.name === event.toolName);
      if (!supported.has(event.toolName) && !trustedMetaTool(tool) && !trustedRecallTool(tool)) {
        return {
          block: true,
          reason: "Pi guard: unsupported tool/alias dispatch blocked",
        };
      }
    }),
  );
  unsubscribes.push(
    pi.on("session_start", (_event, ctx) => {
      const id = ctx.sessionManager.getSessionId();
      if (sessionId && sessionId !== id)
        throw new Error("Pi guard session ownership changed; reload required");
      sessionId = id;
      sessionManager = ctx.sessionManager;
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
        continuity: {
          version: 1,
          generation,
          trustedTool: trustedRecallTool,
          isPrimarySession,
          learningPermission,
          authorizeLearning(ctx, root, target = root) {
            const expected =
              process.env.MAHIRO_CONTINUITY_ROOT ?? join(homedir(), ".pi/agent/continuity");
            if (
              !isPrimarySession(ctx) ||
              !isAbsolute(root) ||
              root !== resolve(root) ||
              !isAbsolute(expected) ||
              root !== resolve(expected) ||
              !isAbsolute(target) ||
              target !== resolve(target) ||
              (target !== root && !target.startsWith(`${root}/`)) ||
              !isAbsolute(ctx.cwd) ||
              ctx.cwd !== resolve(ctx.cwd) ||
              /(?:^|[^a-z0-9])one[-_ ]?deex?(?:$|[^a-z0-9])/i.test(ctx.cwd)
            )
              throw new Error("Continuity learning unavailable");
            const service = getPermissionsService(sessionId);
            const pathWrite = service?.checkPermission("path_write", target);
            const learning = service?.checkPermission(learningPermission(root));
            if (
              !service ||
              learning.state !== "allow" ||
              learning.source === "default" ||
              (pathWrite.matchedPattern !== undefined && pathWrite.state !== "allow")
            )
              throw new Error("Continuity learning requires existing permission");
          },
          async authorizeRead(tool, path, ctx, signal) {
            if (
              !ownsContext(ctx) ||
              !trustedRecallTool(tool) ||
              signal?.aborted ||
              !isAbsolute(path)
            )
              throw new Error("Continuity guard unavailable");
            const args = await host.finalArgs("read", { path }, ctx);
            if (
              args.path !== path ||
              Object.keys(args).some((key) => key !== "path") ||
              !ownsContext(ctx) ||
              signal?.aborted
            )
              throw new Error("Continuity read blocked");
            const service = getPermissionsService(sessionId);
            const outside = relative(ctx.cwd, path);
            const pathRead = service?.checkPermission("path_read", path);
            if (
              !service ||
              service.checkPermission(tool.name).state !== "allow" ||
              service.checkPermission("read", path).state !== "allow" ||
              // Native path gate skips only an unmatched universal fallback.
              (pathRead.matchedPattern !== undefined && pathRead.state !== "allow") ||
              ((outside === ".." || outside.startsWith("../") || isAbsolute(outside)) &&
                service.checkPermission("external_directory_read", path).state !== "allow")
            )
              throw new Error("Continuity read requires existing permission");
          },
          // Future orchestrators may only obtain this node's captured service while healthy.
          parentService: () =>
            ownsContext({ sessionManager: { getSessionId: () => id } }) ? parentService : undefined,
        },
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
    pi.events.on("subagents:child:session-created", (event) => {
      if (typeof event.sessionId === "string") nativeChildren.add(event.sessionId);
    }),
  );
  unsubscribes.push(
    pi.events.on("subagents:child:bound", (event) => {
      if (typeof event.sessionId === "string") nativeChildren.add(event.sessionId);
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
