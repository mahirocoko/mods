/**
 * Mahiro Herdr Lifecycle — report one Letta pane plus its child-task rollup.
 */

import { createConnection, type Socket } from "node:net";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_SOURCE = "mahiro:letta";
const METADATA_SOURCE = "mahiro:letta-display";
const POLL_INTERVAL_MS = 500;
const PROCESS_SCAN_INTERVAL_MS = 1_000;
const PROCESS_DISCOVERY_GRACE_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const METADATA_TTL_MS = 30_000;
const SOCKET_TIMEOUT_MS = 1_500;
const MAX_RESPONSE_BYTES = 64 * 1024;
const PROCESS_STARTED_AT_MS = Math.round(Date.now() - process.uptime() * 1_000);
const DISABLE_PATH = join(homedir(), ".letta", "mods", "mahiro-herdr-lifecycle.disabled");

type HerdrState = "idle" | "working" | "blocked" | "unknown";

interface SubagentItem {
  id?: unknown;
  type?: unknown;
  status?: unknown;
  isBackground?: unknown;
}

interface LifecycleInput {
  conversationOpen: boolean;
  turnActive: boolean;
  llmActive: boolean;
  compactActive: boolean;
  activeTools: string[];
  blockedTools: string[];
  subagents: SubagentItem[];
  appVersion: string | null;
}

interface LifecycleSnapshot {
  state: HerdrState;
  summary: string;
  displayAgent: string;
  runningCount: number;
  endedCount: number;
  errorCount: number;
  activeTypes: string;
  appVersion: string;
}

const normalizeText = (value: unknown, maxLength = 80) => {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
};

const normalizeSocketPath = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, "").trim().slice(0, 1_024);
};

const normalizeConversationScope = (event: any, context: any) => {
  const agentId = normalizeText(event?.agentId ?? context?.agent?.id, 160);
  const eventConversationId = normalizeText(event?.conversationId, 240);
  const contextConversationId = normalizeText(context?.conversation?.id, 240);
  if (eventConversationId && eventConversationId !== "default") return eventConversationId;
  if (contextConversationId && contextConversationId !== "default") return contextConversationId;
  if (agentId) return `agent:${agentId}`;
  const cwd = normalizeText(context?.cwd ?? context?.workspace?.cwd, 512);
  if ((eventConversationId === "default" || contextConversationId === "default") && cwd) return `workspace:${cwd}`;
  return eventConversationId || contextConversationId;
};

const scopeFingerprint = (scope: string) =>
  scope ? createHash("sha256").update(scope).digest("hex").slice(0, 16) : "unknown";

const compactToolName = (value: unknown) => normalizeText(value, 40).replace(/^functions\./, "") || "tool";

const subagentStatus = (item: SubagentItem) => normalizeText(item.status, 20).toLowerCase();

const subagentLabel = (item: SubagentItem) => normalizeText(item.type, 28) || "subagent";

interface ProcessRow {
  pid: number;
  ppid: number;
  command: string;
}

interface ProcessScanInput {
  conversationOpen: boolean;
  runningSubagentCount: number;
  discoveryUntil: number;
  now: number;
}

const parseProcessRows = (value: string): ProcessRow[] => value
  .split("\n")
  .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/))
  .filter((match): match is RegExpMatchArray => Boolean(match))
  .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }))
  .filter((row) => Number.isInteger(row.pid) && Number.isInteger(row.ppid));

const processSubagentType = (command: string) => {
  const tags = command.match(/(?:^|\s)--tags\s+([^\s]+)/)?.[1] ?? "";
  const taggedType = tags.match(/(?:^|,)type:([^,]+)/)?.[1];
  const system = command.match(/(?:^|\s)--system\s+([^\s]+)/)?.[1];
  return normalizeText(taggedType ?? system, 28) || "subagent";
};

const parseSubagentProcesses = (value: string, rootPid: number): SubagentItem[] => {
  const rows = parseProcessRows(value);
  const children = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    const siblings = children.get(row.ppid) ?? [];
    siblings.push(row);
    children.set(row.ppid, siblings);
  }

  const descendants: ProcessRow[] = [];
  const queue = [rootPid];
  const visited = new Set<number>(queue);
  while (queue.length > 0) {
    const parent = queue.shift();
    if (parent === undefined) break;
    for (const child of children.get(parent) ?? []) {
      if (visited.has(child.pid)) continue;
      visited.add(child.pid);
      descendants.push(child);
      queue.push(child.pid);
    }
  }

  return descendants
    .filter((row) =>
      row.command.includes("--output-format stream-json") &&
      (row.command.includes("/letta") || row.command.includes("letta.js")))
    .map((row) => ({
      id: `pid:${row.pid}`,
      type: processSubagentType(row.command),
      status: "running",
      isBackground: true,
    }));
};

const shouldScanSubagentProcesses = (input: ProcessScanInput) =>
  input.conversationOpen && (
    input.runningSubagentCount > 0 ||
    input.now < input.discoveryUntil
  );

const processDiscoveryDeadline = (now: number) => now + PROCESS_DISCOVERY_GRACE_MS;

const userInterruptedEvent = (event: any, acceptLlmAbort = false) => {
  const reason = normalizeText(event?.stopReason ?? event?.stop_reason ?? event?.reason, 40).toLowerCase();
  if (reason) return reason === "user_interrupt" || (acceptLlmAbort && reason === "aborted");
  const message = normalizeText(event?.error?.message ?? event?.message, 120);
  return message === "Interrupted by user";
};

const groupedActiveTypes = (items: SubagentItem[]) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const type = normalizeText(item.type, 24) || "subagent";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => count > 1 ? `${type} ×${count}` : type)
    .join(" · ")
    .slice(0, 80);
};

const deriveLifecycleSnapshot = (input: LifecycleInput): LifecycleSnapshot => {
  const activeSubagents = input.subagents.filter((item) => {
    const status = subagentStatus(item);
    return status === "pending" || status === "running";
  });
  const endedCount = input.subagents.filter((item) => ["completed", "ended"].includes(subagentStatus(item))).length;
  const errorCount = input.subagents.filter((item) => subagentStatus(item) === "error").length;
  const runningCount = activeSubagents.length;
  const activeTypes = groupedActiveTypes(activeSubagents);

  let state: HerdrState = "unknown";
  if (input.conversationOpen) {
    state = input.blockedTools.length > 0
      ? "blocked"
      : input.turnActive || input.llmActive || input.compactActive || input.activeTools.length > 0 || runningCount > 0
        ? "working"
        : "idle";
  }

  let summary = "Ready";
  if (state === "blocked") {
    summary = `Needs input · ${input.blockedTools[0] ?? "question"}`;
  } else if (runningCount > 0) {
    const labels = activeSubagents.slice(0, 2).map(subagentLabel);
    const remainder = Math.max(0, runningCount - labels.length);
    summary = `${labels.join(" · ")}${remainder > 0 ? ` · +${remainder}` : ""}`;
  } else if (input.activeTools.length > 0) {
    summary = `Using ${input.activeTools.at(-1)}`;
  } else if (input.compactActive) {
    summary = "Compacting context";
  } else if (input.llmActive) {
    summary = "Thinking";
  } else if (input.turnActive) {
    summary = "Working";
  } else if (errorCount > 0) {
    summary = `${errorCount} subagent error${errorCount === 1 ? "" : "s"}`;
  } else if (endedCount > 0) {
    summary = `${endedCount} subagent${endedCount === 1 ? "" : "s"} ended`;
  }

  return {
    state,
    summary: normalizeText(summary),
    displayAgent: runningCount > 0 ? `Letta · ${runningCount} subagent${runningCount === 1 ? "" : "s"}` : "Letta",
    runningCount,
    endedCount,
    errorCount,
    activeTypes,
    appVersion: normalizeText(input.appVersion, 24) || "unknown",
  };
};

const snapshotDigest = (snapshot: LifecycleSnapshot) => JSON.stringify(snapshot);

const isAskTool = (toolName: string) => {
  const normalized = toolName.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "askuserquestion" || normalized === "askquestion";
};

const socketRequest = (
  socketPath: string,
  request: Record<string, unknown>,
  sockets: Set<Socket>,
) => new Promise<Record<string, unknown>>((resolve, reject) => {
  let settled = false;
  let response = "";
  const socket = createConnection({ path: socketPath });
  sockets.add(socket);

  const finish = (error?: Error, value?: Record<string, unknown>) => {
    if (settled) return;
    settled = true;
    sockets.delete(socket);
    socket.destroy();
    if (error) reject(error);
    else resolve(value ?? {});
  };

  socket.setTimeout(SOCKET_TIMEOUT_MS, () => finish(new Error("Herdr socket request timed out")));
  socket.on("error", (error) => finish(error));
  socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
  socket.on("data", (chunk) => {
    response += chunk.toString("utf8");
    if (response.length > MAX_RESPONSE_BYTES) {
      finish(new Error("Herdr socket response exceeded the bounded limit"));
      return;
    }
    const newline = response.indexOf("\n");
    if (newline < 0) return;
    try {
      const parsed = JSON.parse(response.slice(0, newline));
      if (parsed?.error) {
        finish(new Error(normalizeText(parsed.error?.message, 160) || "Herdr rejected lifecycle state"));
      } else {
        finish(undefined, parsed);
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
});

export const __testing = process.env.MAHIRO_HERDR_TESTING === "1"
  ? Object.freeze({ deriveLifecycleSnapshot, normalizeText, normalizeSocketPath, isAskTool, parseSubagentProcesses, scopeFingerprint, shouldScanSubagentProcesses, processDiscoveryDeadline, userInterruptedEvent })
  : null;

export default function activate(letta: any) {
  if (process.env.HERDR_ENV !== "1") return;
  if (process.env.LETTA_CODE_AGENT_ROLE === "subagent") return;
  if (process.env.MAHIRO_HERDR_FORCE_ENABLE !== "1" && existsSync(DISABLE_PATH)) return;

  const socketPath = normalizeSocketPath(process.env.HERDR_SOCKET_PATH);
  const paneId = normalizeText(process.env.HERDR_PANE_ID, 80);
  if (!socketPath || !paneId) {
    letta.diagnostics?.report?.({
      severity: "warning",
      message: "Mahiro Herdr Lifecycle found HERDR_ENV without a socket path or pane ID.",
    });
    return;
  }

  if (!letta.capabilities?.events?.lifecycle || !letta.events?.on) {
    letta.diagnostics?.report?.({
      severity: "warning",
      message: "Mahiro Herdr Lifecycle requires lifecycle events on this host.",
    });
    return;
  }

  let disposed = false;
  let conversationOpen = false;
  let turnActive = false;
  let llmDepth = 0;
  let appVersion: string | null = null;
  let conversationScope = "";
  let processSubagents: SubagentItem[] = [];
  let processScanInFlight = false;
  let lastProcessScanAt = 0;
  let processDiscoveryUntil = 0;
  let interrupted = false;
  let conversationGeneration = 0;
  const recentlyCompletedProcesses = new Map<string, number>();
  let lastDigest = "";
  let lastReportAt = 0;
  let agentSequence = Date.now() * 1_000;
  let metadataSequence = agentSequence;
  let failureReported = false;
  let reportInFlight = false;
  let pendingReport: { snapshot: LifecycleSnapshot; scope: string } | null = null;
  let releaseRequested = false;
  const activeTools = new Map<string, string>();
  const blockedTools = new Map<string, string>();
  const sockets = new Set<Socket>();
  const disposers: Array<() => void> = [];

  const reportFailure = (error: unknown) => {
    if (disposed || failureReported) return;
    failureReported = true;
    letta.diagnostics?.report?.({
      severity: "warning",
      message: `Mahiro Herdr Lifecycle could not report state: ${normalizeText(error instanceof Error ? error.message : error, 120)}`,
    });
  };

  const sendRequest = async (method: string, params: Record<string, unknown>) => {
    const request = {
      id: `mahiro-letta-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      method,
      params,
    };
    try {
      await socketRequest(socketPath, request, sockets);
      failureReported = false;
    } catch (error) {
      reportFailure(error);
    }
  };

  const readSubagents = () => {
    const now = Date.now();
    for (const [id, completedAt] of recentlyCompletedProcesses) {
      if (now - completedAt > METADATA_TTL_MS) recentlyCompletedProcesses.delete(id);
    }
    const terminal = [...recentlyCompletedProcesses].map(([id]) => ({ id, type: "subagent", status: "ended" }));
    return [...processSubagents, ...terminal];
  };

  const currentSnapshot = () => deriveLifecycleSnapshot({
    conversationOpen,
    turnActive,
    llmActive: llmDepth > 0,
    compactActive: false,
    activeTools: [...activeTools.values()],
    blockedTools: [...blockedTools.values()],
    subagents: readSubagents(),
    appVersion,
  });

  const sendSnapshot = async (snapshot: LifecycleSnapshot, scope: string) => {
    agentSequence += 1;
    metadataSequence += 1;
    await sendRequest("pane.report_agent", {
      pane_id: paneId,
      source: AGENT_SOURCE,
      agent: "letta",
      state: snapshot.state,
      message: snapshot.summary,
      seq: agentSequence,
    });
    await sendRequest("pane.report_metadata", {
      pane_id: paneId,
      source: METADATA_SOURCE,
      agent: "letta",
      applies_to_source: AGENT_SOURCE,
      display_agent: snapshot.displayAgent,
      state_labels: {
        idle: "ready",
        working: snapshot.runningCount > 0 ? `${snapshot.runningCount} subagents` : "working",
        blocked: "needs input",
        done: "review ready",
        unknown: "unavailable",
      },
      tokens: {
        summary: snapshot.summary,
        subagents: String(snapshot.runningCount),
        subagents_running: String(snapshot.runningCount),
        subagents_ended: String(snapshot.endedCount),
        subagents_error: String(snapshot.errorCount),
        subagent_types: snapshot.activeTypes,
        letta_version: snapshot.appVersion,
        letta_pid: String(process.pid),
        letta_started_at: String(PROCESS_STARTED_AT_MS),
        letta_scope: scopeFingerprint(scope),
      },
      seq: metadataSequence,
      ttl_ms: METADATA_TTL_MS,
    });
  };

  const sendRelease = async () => {
    metadataSequence += 1;
    agentSequence += 1;
    await sendRequest("pane.report_metadata", {
      pane_id: paneId,
      source: METADATA_SOURCE,
      agent: "letta",
      applies_to_source: AGENT_SOURCE,
      clear_display_agent: true,
      clear_state_labels: true,
      tokens: {
        summary: null,
        subagents: null,
        subagents_running: null,
        subagents_ended: null,
        subagents_error: null,
        subagent_types: null,
        letta_version: null,
        letta_pid: null,
        letta_started_at: null,
        letta_scope: null,
      },
      seq: metadataSequence,
    });
    await sendRequest("pane.release_agent", {
      pane_id: paneId,
      source: AGENT_SOURCE,
      agent: "letta",
      seq: agentSequence,
    });
  };

  const pumpReports = () => {
    if (reportInFlight) return;
    if (!releaseRequested && !pendingReport) {
      if (disposed) {
        for (const socket of sockets) socket.destroy();
        sockets.clear();
      }
      return;
    }

    reportInFlight = true;
    const shouldRelease = releaseRequested;
    releaseRequested = false;
    const reportToSend = shouldRelease ? null : pendingReport;
    if (reportToSend) pendingReport = null;

    void (shouldRelease
      ? sendRelease()
      : reportToSend
        ? sendSnapshot(reportToSend.snapshot, reportToSend.scope)
        : Promise.resolve())
      .finally(() => {
        reportInFlight = false;
        pumpReports();
      });
  };

  const report = (force = false) => {
    if (disposed || !conversationOpen) return;
    const snapshot = currentSnapshot();
    const digest = snapshotDigest(snapshot);
    const now = Date.now();
    if (!force && digest === lastDigest && now - lastReportAt < HEARTBEAT_INTERVAL_MS) return;

    lastDigest = digest;
    lastReportAt = now;
    pendingReport = { snapshot, scope: conversationScope };
    pumpReports();
  };

  const releaseHerdrState = () => {
    pendingReport = null;
    releaseRequested = true;
    pumpReports();
  };

  const rememberContext = (event: any, context: any) => {
    appVersion = normalizeText(context?.app?.version, 24) || appVersion;
    conversationScope = normalizeConversationScope(event, context) || conversationScope;
  };

  const belongsToActiveConversation = (event: any, context: any) => {
    if (!conversationOpen) return false;
    const eventScope = normalizeConversationScope(event, context);
    return !conversationScope || eventScope === conversationScope;
  };

  const canOpenConversation = (event: any, context: any) => {
    const openingScope = normalizeConversationScope(event, context);
    return !conversationOpen || !conversationScope || openingScope === conversationScope;
  };

  const settleUserInterrupt = () => {
    interrupted = true;
    turnActive = false;
    llmDepth = 0;
    activeTools.clear();
    blockedTools.clear();
    processDiscoveryUntil = 0;
    report(false);
  };

  const scanSubagentProcesses = () => {
    const now = Date.now();
    if (disposed || processScanInFlight || !shouldScanSubagentProcesses({
      conversationOpen,
      runningSubagentCount: processSubagents.length,
      discoveryUntil: processDiscoveryUntil,
      now,
    })) return;
    if (process.platform !== "darwin" && process.platform !== "linux") return;
    if (now - lastProcessScanAt < PROCESS_SCAN_INTERVAL_MS) return;
    lastProcessScanAt = now;
    processScanInFlight = true;
    const scanGeneration = conversationGeneration;
    const scanScope = conversationScope;
    execFile(
      "ps",
      ["-axo", "pid=,ppid=,command="],
      { encoding: "utf8", timeout: SOCKET_TIMEOUT_MS, maxBuffer: 512 * 1024 },
      (error, stdout) => {
        processScanInFlight = false;
        if (disposed || scanGeneration !== conversationGeneration || scanScope !== conversationScope) return;
        if (error) {
          report(false);
          return;
        }
        const next = parseSubagentProcesses(stdout, process.pid);
        const nextIds = new Set(next.map((item) => normalizeText(item.id, 80)).filter(Boolean));
        for (const item of processSubagents) {
          const id = normalizeText(item.id, 80);
          if (id && !nextIds.has(id)) recentlyCompletedProcesses.set(id, Date.now());
        }
        processSubagents = next;
        report(false);
      },
    );
  };

  const addEvent = (enabled: boolean | undefined, name: string, handler: (event: any, context: any) => void) => {
    if (!enabled) return;
    disposers.push(letta.events.on(name, handler));
  };

  addEvent(letta.capabilities.events.lifecycle, "conversation_open", (event, context) => {
    if (!canOpenConversation(event, context)) return;
    conversationGeneration += 1;
    conversationOpen = true;
    interrupted = false;
    turnActive = false;
    llmDepth = 0;
    activeTools.clear();
    blockedTools.clear();
    processSubagents = [];
    recentlyCompletedProcesses.clear();
    processDiscoveryUntil = 0;
    rememberContext(event, context);
    lastDigest = "";
    report(false);
  });

  addEvent(letta.capabilities.events.lifecycle, "conversation_close", (event, context) => {
    if (!belongsToActiveConversation(event, context)) return;
    conversationGeneration += 1;
    rememberContext(event, context);
    conversationOpen = false;
    turnActive = false;
    llmDepth = 0;
    activeTools.clear();
    blockedTools.clear();
    processSubagents = [];
    recentlyCompletedProcesses.clear();
    processDiscoveryUntil = 0;
    releaseHerdrState();
  });

  addEvent(letta.capabilities.events?.turns, "turn_start", (event, context) => {
    if (!belongsToActiveConversation(event, context)) return;
    rememberContext(event, context);
    interrupted = false;
    turnActive = true;
    report(false);
  });
  addEvent(letta.capabilities.events?.turns, "turn_end", (event, context) => {
    if (!belongsToActiveConversation(event, context)) return;
    rememberContext(event, context);
    turnActive = false;
    llmDepth = 0;
    activeTools.clear();
    blockedTools.clear();
    report(false);
  });
  addEvent(!letta.capabilities.events?.turns && letta.capabilities.events?.llm, "llm_start", (event, context) => {
    if (!belongsToActiveConversation(event, context)) return;
    rememberContext(event, context);
    llmDepth += 1;
    report(false);
  });
  addEvent(letta.capabilities.events?.llm, "llm_end", (event, context) => {
    if (!belongsToActiveConversation(event, context)) return;
    rememberContext(event, context);
    if (userInterruptedEvent(event, true)) {
      settleUserInterrupt();
      return;
    }
    if (!letta.capabilities.events?.turns) {
      llmDepth = Math.max(0, llmDepth - 1);
      report(false);
    }
  });
  addEvent(letta.capabilities.events?.tools, "tool_start", (event, context) => {
    if (!belongsToActiveConversation(event, context) || interrupted) return;
    rememberContext(event, context);
    const toolCallId = normalizeText(event?.toolCallId, 120) || `tool-${Date.now()}`;
    const toolName = compactToolName(event?.toolName);
    activeTools.set(toolCallId, toolName);
    if (isAskTool(toolName)) blockedTools.set(toolCallId, toolName);
    processDiscoveryUntil = processDiscoveryDeadline(Date.now());
    report(false);
  });
  addEvent(letta.capabilities.events?.tools, "tool_end", (event, context) => {
    if (!belongsToActiveConversation(event, context)) return;
    rememberContext(event, context);
    const toolCallId = normalizeText(event?.toolCallId, 120);
    let matched = false;
    if (toolCallId) {
      matched = activeTools.delete(toolCallId);
      if (matched) blockedTools.delete(toolCallId);
    } else {
      const toolName = compactToolName(event?.toolName);
      const matching = [...activeTools.entries()].find(([, activeName]) => activeName === toolName)?.[0];
      if (matching) {
        activeTools.delete(matching);
        blockedTools.delete(matching);
        matched = true;
      }
    }
    if (userInterruptedEvent(event)) settleUserInterrupt();
    else if (!interrupted && matched) processDiscoveryUntil = processDiscoveryDeadline(Date.now());
    report(false);
  });

  const timer = setInterval(() => {
    scanSubagentProcesses();
    report(false);
  }, POLL_INTERVAL_MS);

  return () => {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    if (!letta.signal?.aborted) {
      for (const dispose of disposers.reverse()) dispose();
    }
    if (conversationOpen) {
      releaseHerdrState();
    }
    pumpReports();
  };
}
