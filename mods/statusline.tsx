import { execFile } from "node:child_process";
import { existsSync, constants, openSync, closeSync, readFileSync, writeFileSync, fstatSync, lstatSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const UPDATE_INTERVAL_MS = 10_000;
const SUBAGENT_PROCESS_SCAN_INTERVAL_MS = 1_000;
const SUBAGENT_PROCESS_DISCOVERY_MS = 10_000;
const DISABLE_PATH = process.env.MAHIRO_STATUSLINE_DISABLE_PATH
  ?? join(homedir(), ".letta", "mods", "mahiro-statusline.disabled");
const waitForRegistrationTurn = () => new Promise<void>((resolveWait) => setTimeout(resolveWait, 0));

const STATUS_COLORS = {
  folder: "#8C8CF9",
  git: "#64CF64",
  dirty: "#FEE19C",
  conversation: "#A5A8AB",
  modeStandard: "#A5A8AB",
  modeAcceptEdits: "#20B2AA",
  modeUnrestricted: "#FEE19C",
  rtk: "#FEE19C",
  context: "#BEBEEE",
  memClean: "#64CF64",
  memDirty: "#FEE19C",
  reflection: "#A5A8AB",
  activity: "#20B2AA",
  subagent: "#FEE19C",
  error: "#F1689F",
  agent: "#8C8CF9",
  model: "#A5A8AB",
  reasoning: "#FEE19C",
  backend: "#A5A8AB",
  separator: "#46484A",
} as const;

type StatusSegment = {
  text: string;
  color?: string;
  dim?: boolean;
};

type CachedStatus = {
  cwd: string | null;
  agentId: string | null;
  agentName: string | null;
  conversationId: string | null;
  permissionMode: string | null;
  modelName: string | null;
  reasoningEffort: string | null;
  backend: string | null;
  branch: string | null;
  git: GitStatus;
  memfsStatus: MemfsStatus | null;
  activityStatus: string | null;
  activityColor: string | null;
  rtkMode: string | null;
  contextWindow: number | null;
  contextUsedPercentage: number | null;
  compactStatus: string | null;
  reflectionStatus: string | null;
  processSubagents: ProcessSubagentStatus[];
  usage?: StatusSegment[];
};

type ProcessSubagentStatus = {
  id: string;
  type: string;
  elapsedMs: number;
};

type ProcessRow = {
  pid: number;
  ppid: number;
  command: string;
};

type GitStatus = {
  branch: string | null;
  dirtyCount: number;
  untrackedCount: number;
  modifiedCount: number;
  deletedCount: number;
  ahead: number;
  behind: number;
};

type MemfsStatus = {
  state: "clean" | "dirty" | "unknown";
  dirtyCount: number;
};

type LettaApi = {
  signal?: {
    aborted?: boolean;
  };
  commands?: { register: (command: { id: string; description: string; args: string; runWhenBusy?: boolean; showInTranscript?: boolean; run: (context: { args?: string }) => any }) => () => void };
  capabilities?: {
    commands?: boolean;
    ui?: {
      panels?: boolean;
    };
    events?: {
      lifecycle?: boolean;
      turns?: boolean;
      tools?: boolean;
      compact?: boolean;
      llm?: boolean;
    };
  };
  ui?: {
    openPanel?: (options: {
      id: string;
      order?: number;
      render: (context: any) => string | string[];
    }) => { close: () => void; update: (options?: { order?: number }) => void };
  };
  diagnostics?: {
    report?: (diagnostic: { message: string; severity?: "warning" | "error" }) => void;
  };
  events?: {
    on?: (eventName: string, handler: (event: any, context: any) => void) => () => void;
  };
};

export default async function activate(letta: LettaApi) {
  if (existsSync(DISABLE_PATH)) return;
  if (!letta.capabilities?.ui?.panels || !letta.ui?.openPanel) {
    letta.diagnostics?.report?.({
      message: "Custom statusline requires the panels UI capability.",
      severity: "warning",
    });
    return;
  }
  await waitForRegistrationTurn();
  if (letta.signal?.aborted) return;

  let disposed = false;
  const disposers: Array<() => void> = [];
  let status: CachedStatus = {
    cwd: process.cwd(),
    agentId: process.env.AGENT_ID || null,
    agentName: null,
    conversationId: process.env.CONVERSATION_ID || null,
    permissionMode: null,
    modelName: null,
    reasoningEffort: null,
    backend: null,
    branch: null,
    git: emptyGitStatus(),
    memfsStatus: getMemoryDir(process.env.AGENT_ID || null) ? { state: "unknown", dirtyCount: 0 } : null,
    activityStatus: null,
    activityColor: null,
    rtkMode: null,
    contextWindow: null,
    contextUsedPercentage: null,
    compactStatus: null,
    reflectionStatus: null,
    processSubagents: [],
  };

  const panel = letta.ui.openPanel({
    id: "statusline",
    order: 0,
    render: (context) => renderStatusline(context, status),
  });

  const usage = createUsageController((segments) => {
    if (disposed) return;
    status = { ...status, usage: segments };
    panel.update();
  });
  let usagePanel: { close: () => void } | null = null;
  let usagePanelTimer: ReturnType<typeof setTimeout> | null = null;
  const closeUsagePanel = (closePanel = true) => {
    if (usagePanelTimer) clearTimeout(usagePanelTimer);
    usagePanelTimer = null;
    if (closePanel) usagePanel?.close();
    usagePanel = null;
  };
  if (letta.capabilities.commands && letta.commands?.register) {
    disposers.push(letta.commands.register({
      id: "mh-usage",
      description: "Show cached provider quotas in a busy-safe panel and control quota display",
      args: "[status [page]|close|off|codex on/off|agy on/off|bar|compact]",
      runWhenBusy: true,
      showInTranscript: false,
      run: (context) => {
        if (disposed || letta.signal?.aborted) return { type: "handled" };
        try {
          closeUsagePanel();
          if ((context.args ?? "").trim().toLowerCase() === "close") return { type: "handled" };
          const raw = (context.args ?? "").trim();
          const pageMatch = raw.match(/^status(?:\s+([1-9]\d{0,3}))?$/i);
          const page = pageMatch?.[1] ? Number(pageMatch[1]) : 0;
          const result = /^status\s/i.test(raw) && !pageMatch
            ? { output: "Usage: /mh-usage status [page], with a positive page number." }
            : usage.command(pageMatch ? "status" : raw);
          // Snapshot only: rendering never reads state, fetches quota, or starts a turn.
          usagePanel = letta.ui!.openPanel!({
            id: "mahiro-usage-status",
            order: 120,
            render: (renderContext) => renderUsagePanel(result.output, renderContext?.chalk, page, renderContext?.width),
          });
          usagePanelTimer = setTimeout(closeUsagePanel, 10_000);
          usagePanelTimer.unref?.();
        } catch {
          letta.diagnostics?.report?.({ message: "Usage status panel unavailable.", severity: "warning" });
        }
        return { type: "handled" };
      },
    }));
  }
  void usage.update();
  const usageTimer = setInterval(() => void usage.update(), 15_000);

  const update = async () => {
    if (disposed) return;

    const cwd = status.cwd ?? process.cwd();
    const memoryDir = getMemoryDir(status.agentId);

    const [git, memfsStatus, reflectionStatus, rtkMode] = await Promise.all([
      getGitStatus(cwd),
      getMemfsStatus(memoryDir),
      getReflectionStatusFromSettings(status.agentId, cwd),
      getRtkMode(),
    ]);

    if (disposed) return;
    status = {
      ...status,
      cwd,
      branch: git.branch,
      git,
      memfsStatus,
      reflectionStatus,
      rtkMode,
    };
    panel.update();
  };

  void update();
  const timer = setInterval(update, UPDATE_INTERVAL_MS);

  const processSubagentStarts = new Map<string, number>();
  let processScanInFlight = false;
  let processDiscoveryUntil = Date.now() + SUBAGENT_PROCESS_DISCOVERY_MS;
  const requestProcessDiscovery = () => {
    processDiscoveryUntil = Date.now() + SUBAGENT_PROCESS_DISCOVERY_MS;
  };
  const updateProcessSubagents = async () => {
    if (disposed || processScanInFlight) return;
    if (status.processSubagents.length === 0 && Date.now() >= processDiscoveryUntil) return;
    processScanInFlight = true;
    try {
      const discovered = await getProcessSubagents(process.pid);
      if (disposed) return;
      const now = Date.now();
      const liveIds = new Set(discovered.map((item) => item.id));
      for (const id of processSubagentStarts.keys()) {
        if (!liveIds.has(id)) processSubagentStarts.delete(id);
      }
      const processSubagents = discovered.map((item) => {
        const startedAt = processSubagentStarts.get(item.id) ?? now;
        processSubagentStarts.set(item.id, startedAt);
        return { ...item, elapsedMs: Math.max(0, now - startedAt) };
      });
      status = { ...status, processSubagents };
      panel.update();
    } finally {
      processScanInFlight = false;
    }
  };

  const shouldScanSubagentProcesses = process.env.MAHIRO_STATUSLINE_TESTING !== "1";
  if (shouldScanSubagentProcesses) void updateProcessSubagents();
  const processScanTimer = shouldScanSubagentProcesses
    ? setInterval(updateProcessSubagents, SUBAGENT_PROCESS_SCAN_INTERVAL_MS)
    : null;

  const rememberContext = (event: any, context: any) => {
    status = {
      ...status,
      cwd: pick(
        context?.cwd,
        context?.workingDirectory,
        context?.workspace?.cwd,
        context?.workspace?.currentDir,
        context?.workspace?.projectDir,
        status.cwd,
      ),
      agentId: pick(event?.agentId, context?.agent?.id, status.agentId),
      agentName: pick(getAgentName(context), status.agentName),
      conversationId: pick(event?.conversationId, context?.conversation?.id, status.conversationId),
      permissionMode: pick(context?.permissionMode, status.permissionMode),
      modelName: pick(getModelName(context), status.modelName),
      reasoningEffort: pick(getReasoningEffort(context), status.reasoningEffort),
      backend: pick(getBackendLabel(context), status.backend),
    };
    if (!status.memfsStatus && getMemoryDir(status.agentId)) status.memfsStatus = { state: "unknown", dirtyCount: 0 };
  };

  let activityClearTimer: ReturnType<typeof setTimeout> | null = null;
  let compactClearTimer: ReturnType<typeof setTimeout> | null = null;

  const setActivity = (text: string, color = STATUS_COLORS.activity, ttlMs = 12_000) => {
    if (activityClearTimer) clearTimeout(activityClearTimer);
    status = { ...status, activityStatus: text, activityColor: color };
    panel.update();
    activityClearTimer = setTimeout(() => {
      if (disposed) return;
      status = { ...status, activityStatus: null, activityColor: null };
      panel.update();
    }, ttlMs);
  };

  const addEvent = (enabled: boolean | undefined, eventName: string, handler: (event: any, context: any) => void) => {
    if (!enabled || !letta.events?.on) return;
    disposers.push(letta.events.on(eventName, handler));
  };

  addEvent(letta.capabilities.events?.lifecycle, "conversation_open", (event, context) => {
    rememberContext(event, context);
    if (compactClearTimer) clearTimeout(compactClearTimer);
    status.compactStatus = null;
    void update();
    panel.update();
  });

  addEvent(letta.capabilities.events?.turns, "turn_start", (event, context) => {
    rememberContext(event, context);
    void update();
    panel.update();
  });

  addEvent(letta.capabilities.events?.llm, "llm_start", (event, context) => {
    rememberContext(event, context);
    const contextWindow = pickNumber(event?.contextWindow);
    status = {
      ...status,
      contextWindow,
      contextUsedPercentage: null,
    };
    setActivity("✦ thinking", STATUS_COLORS.activity, 30_000);
  });

  addEvent(letta.capabilities.events?.llm, "llm_end", (event, context) => {
    rememberContext(event, context);
    const promptTokens = pickNumber(event?.usage?.promptTokens);
    const stopReason = pick(event?.stopReason, event?.stop_reason, event?.reason);
    const errorText = shortErrorLabel(pick(event?.error?.message, event?.error, event?.message));
    status = {
      ...status,
      contextUsedPercentage:
        promptTokens != null && status.contextWindow != null && status.contextWindow > 0
          ? (promptTokens / status.contextWindow) * 100
          : status.contextUsedPercentage,
    };
    if (["llm_api_error", "error", "aborted", "cancelled"].includes(stopReason ?? "") || errorText) {
      setActivity(`⚠ ${errorText ?? "provider error"}`, STATUS_COLORS.error, 20_000);
    } else {
      setActivity("✓ response", STATUS_COLORS.activity, 6_000);
    }
  });

  addEvent(letta.capabilities.events?.tools, "tool_start", (event, context) => {
    rememberContext(event, context);
    const toolName = compactToolName(pick(event?.toolName, event?.tool_name, event?.name) ?? "tool");
    if (toolName.toLowerCase() === "agent" || toolName.toLowerCase() === "task") {
      requestProcessDiscovery();
      void updateProcessSubagents();
    }
    setActivity(`🔧 ${toolName}`, STATUS_COLORS.activity, 30_000);
  });

  addEvent(letta.capabilities.events?.tools, "tool_end", (event, context) => {
    rememberContext(event, context);
    const failed =
      event?.ok === false ||
      event?.success === false ||
      event?.status === "error" ||
      event?.status === "failed" ||
      Boolean(event?.error);
    const toolName = compactToolName(pick(event?.toolName, event?.tool_name, event?.name) ?? "tool");
    setActivity(`${failed ? "⚠" : "✓"} ${toolName}`, failed ? STATUS_COLORS.error : STATUS_COLORS.activity, failed ? 16_000 : 6_000);
  });

  addEvent(letta.capabilities.events?.compact, "compact_start", (event, context) => {
    rememberContext(event, context);
    if (compactClearTimer) clearTimeout(compactClearTimer);
    status.compactStatus = "🗜️ compacting";
    panel.update();
  });

  addEvent(letta.capabilities.events?.compact, "compact_end", (event, context) => {
    rememberContext(event, context);
    const before = pickNumber(event?.contextTokensBefore);
    const after = pickNumber(event?.contextTokensAfter);
    status = {
      ...status,
      compactStatus: before != null && after != null ? `🗜️ ${Math.round(after / 1000)}k` : "🗜️ compact",
      contextUsedPercentage:
        after != null && status.contextWindow != null && status.contextWindow > 0
          ? (after / status.contextWindow) * 100
          : status.contextUsedPercentage,
    };
    panel.update();
    compactClearTimer = setTimeout(() => {
      if (disposed) return;
      status = { ...status, compactStatus: null };
      panel.update();
    }, 10_000);
  });

  return () => {
    const aborted = Boolean(letta.signal?.aborted);
    disposed = true;
    clearInterval(timer);
    clearInterval(usageTimer);
    usage.dispose();
    closeUsagePanel(!aborted);
    if (processScanTimer) clearInterval(processScanTimer);
    if (activityClearTimer) clearTimeout(activityClearTimer);
    if (compactClearTimer) clearTimeout(compactClearTimer);
    if (!aborted) {
      for (const dispose of disposers.reverse()) dispose();
      panel.close();
    }
  };
}

function renderStatusline(context: any, status: CachedStatus): string | string[] {
  const width = pickNumber(context?.width) ?? 80;
  const row = typeof context?.row === "function" ? context.row : fallbackRow;
  const chalk = context?.chalk ?? null;

  const workspacePath = pick(
    context?.workspace?.projectDir,
    context?.workspace?.currentDir,
    context?.workspace?.cwd,
    context?.rawPayload?.workspace?.project_dir,
    context?.rawPayload?.workspace?.current_dir,
    context?.rawPayload?.cwd,
    status.cwd,
  );
  const folder = basename(workspacePath);

  const conversation = pick(
    context?.conversationSummary,
    context?.conversation?.summary,
    context?.rawPayload?.conversationSummary,
    context?.rawPayload?.conversation_summary,
    context?.rawPayload?.conversation?.summary,
    context?.conversation?.name,
    context?.conversation?.id,
    context?.rawPayload?.conversation?.name,
    context?.rawPayload?.conversation?.id,
    context?.rawPayload?.session_id,
    status.conversationId,
  );

  const usedPercentage = pickNumber(
    context?.contextWindow?.usedPercentage,
    context?.contextWindow?.used_percentage,
    context?.rawPayload?.context_window?.used_percentage,
    status.contextUsedPercentage,
  );

  const reflectionStatus = getReflectionStatus(context) ?? status.reflectionStatus;
  const mode = getModeLabel(context) ?? status.permissionMode;
  const agentName = pick(getAgentName(context), status.agentName);
  const modelName = compactModelName(
    pick(getModelName(context), status.modelName),
  );
  const reasoningEffort = formatReasoningEffort(
    pick(getReasoningEffort(context), status.reasoningEffort),
  );
  const backend = pick(getBackendLabel(context), status.backend);

  const leftCandidates: StatusSegment[] = [];
  if (folder) leftCandidates.push({ text: `📁 ${shortId(folder, 18)}`, color: STATUS_COLORS.folder });
  if (status.git.branch) {
    leftCandidates.push({
      text: formatGitStatus(status.git),
      color: status.git.dirtyCount > 0 ? STATUS_COLORS.dirty : STATUS_COLORS.git,
    });
  }
  const activeSubagents = formatActiveBackgroundSubagents(context)
    ?? formatProcessSubagents(status.processSubagents);
  if (activeSubagents) {
    leftCandidates.push({ text: activeSubagents, color: STATUS_COLORS.subagent });
  }
  if (conversation) leftCandidates.push({ text: `💬 ${shortConversation(conversation)}`, color: STATUS_COLORS.conversation });
  if (status.activityStatus) {
    leftCandidates.push({ text: status.activityStatus, color: status.activityColor ?? STATUS_COLORS.activity });
  }
  if (usedPercentage != null) {
    leftCandidates.push({ text: `ctx ${formatPercentage(usedPercentage)}%`, color: getContextColor(usedPercentage) });
  }
  if (status.memfsStatus) {
    leftCandidates.push({ text: compactMemfsStatus(status.memfsStatus), color: getMemfsColor(status.memfsStatus) });
  }
  if (status.compactStatus) leftCandidates.push({ text: status.compactStatus, color: STATUS_COLORS.reflection });
  else if (reflectionStatus) leftCandidates.push({ text: reflectionStatus, color: STATUS_COLORS.reflection });
  if (status.rtkMode) leftCandidates.push({ text: compactRtkMode(status.rtkMode), color: getRtkColor(status.rtkMode) });
  if (mode) leftCandidates.push({ text: compactModeLabel(mode), color: getModeColor(mode) });

  leftCandidates.push(...(status.usage ?? []));

  const rightCandidates: StatusSegment[] = [];
  if (agentName && width >= 70) rightCandidates.push({ text: shortId(agentName, 14), color: STATUS_COLORS.agent });
  if (modelName) {
    rightCandidates.push({
      text: reasoningEffort ? `[${modelName} r:${reasoningEffort}]` : `[${modelName}]`,
      color: reasoningEffort ? STATUS_COLORS.reasoning : STATUS_COLORS.model,
    });
  }
  if (backend && width >= 90) rightCandidates.push({ text: backend, color: STATUS_COLORS.backend });

  const rightOptions = [
    rightCandidates,
    rightCandidates.filter((part) => part.text.startsWith("[") || part.text === backend),
    rightCandidates.filter((part) => part.text.startsWith("[")),
    [],
  ];

  for (const rightParts of rightOptions) {
    const right = renderSegments(chalk, rightParts);
    if (visibleWidth(right) > width) continue;
    const availableLeftWidth = Math.max(0, width - visibleWidth(right) - (right ? 3 : 0));
    if (status.usage?.length) {
      const primaryStatus = leftCandidates.filter((part) => !status.usage?.includes(part));
      const left = renderSegments(chalk, fitSegmentPrefix(primaryStatus, availableLeftWidth, chalk).fitted);
      const first = row(left, right, width);
      const providerRows = ["Codex", "Agy"].flatMap((provider) => {
        const parts = status.usage!.filter((part) => part.text.startsWith(`${provider} `));
        return parts.length ? [providerUsageRow(parts, provider, width, chalk)] : [];
      });
      // The public row helper already clips/pads to its width contract. Do not
      // reject its padded identity row using an incompatible code-point count.
      return [first, ...providerRows];
    }
    let primary = fitSegmentPrefix(leftCandidates, availableLeftWidth, chalk);
    let overflow = fitSegmentPrefix(primary.remaining, width, chalk);
    const left = renderSegments(chalk, primary.fitted);
    const firstLine = row(left || (!right ? color(chalk, STATUS_COLORS.agent, agentName ?? "Letta") : ""), right, width);
    if (visibleWidth(firstLine) > width) continue;

    const secondLine = renderSegments(chalk, overflow.fitted);
    if (secondLine && visibleWidth(secondLine) <= width) return [firstLine, secondLine];
    return firstLine;
  }

  const left = renderSegments(chalk, fitSegmentPrefix(leftCandidates, width, chalk).fitted);
  return row(left || color(chalk, STATUS_COLORS.agent, agentName ?? "Letta"), "", width);
}

function formatActiveBackgroundSubagents(context: any): string | null {
  let items: any[];
  try {
    const list = context?.subagents?.list;
    if (typeof list !== "function") return null;
    const result = list();
    items = Array.isArray(result) ? result : [];
  } catch {
    return null;
  }

  const active: Array<{ elapsedMs: number; type: unknown }> = [];
  for (const item of items) {
    try {
      const state = typeof item?.status === "string" ? item.status.toLowerCase() : "";
      if (item?.isBackground !== true || (state !== "pending" && state !== "running")) continue;
      active.push({
        elapsedMs: pickNumber(item?.elapsedMs) ?? 0,
        type: item?.type,
      });
    } catch {
      // A malformed lifecycle item must not break the whole statusline.
    }
  }
  if (active.length === 0) return null;

  return formatSubagentItems(active, "bg");
}

function formatProcessSubagents(items: ProcessSubagentStatus[]): string | null {
  return items.length > 0 ? formatSubagentItems(items, "agent") : null;
}

function formatSubagentItems(
  active: Array<{ elapsedMs: number; type: unknown }>,
  label: "agent" | "bg",
): string {
  const longestRunning = active.reduce((selected, item) => {
    return item.elapsedMs > selected.elapsedMs ? item : selected;
  }, active[0]);
  const remainder = active.length - 1;
  return `⏳ ${label} ${formatSubagentType(longestRunning.type)}${formatSubagentRemainder(remainder)} ${formatElapsed(longestRunning.elapsedMs)}`;
}

function formatSubagentType(value: unknown): string {
  if (typeof value !== "string") return "subagent";
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized ? shortId(normalized, 14) : "subagent";
}

function formatSubagentRemainder(remainder: number): string {
  if (remainder <= 0) return "";
  return remainder > 99 ? " +99+" : ` +${remainder}`;
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m${String(totalSeconds % 60).padStart(2, "0")}s`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours >= 100) return "99h+";
  return `${totalHours}h${String(totalMinutes % 60).padStart(2, "0")}m`;
}

function parseProcessRows(value: string): ProcessRow[] {
  return value
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: match[3],
    }))
    .filter((row) => Number.isInteger(row.pid) && Number.isInteger(row.ppid));
}

function parseSubagentProcesses(value: string, rootPid: number): Array<{ id: string; type: string }> {
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
      row.command.includes("--output-format stream-json")
      && isLettaProcessCommand(row.command),
    )
    .flatMap((row) => {
      const tags = row.command.match(/(?:^|\s)--tags\s+([^\s]+)/)?.[1] ?? "";
      const taggedType = tags.match(/(?:^|,)type:([^,]+)/)?.[1];
      const system = row.command.match(/(?:^|\s)--system\s+([^\s]+)/)?.[1];
      if (!taggedType && !system) return [];
      return [{
        id: `pid:${row.pid}`,
        type: taggedType ?? system ?? "subagent",
      }];
    });
}

function isLettaProcessCommand(command: string): boolean {
  const tokens = command.trim().split(/\s+/);
  const executable = tokens[0]?.split("/").at(-1) ?? "";
  if (executable === "letta" || executable === "letta.js") return true;
  if (executable !== "bun" && executable !== "node") return false;
  const script = tokens[1]?.split("/").at(-1) ?? "";
  return script === "letta" || script === "letta.js";
}

async function getProcessSubagents(rootPid: number): Promise<Array<{ id: string; type: string }>> {
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 700,
    });
    return parseSubagentProcesses(stdout, rootPid);
  } catch {
    return [];
  }
}

export const __testing = process.env.MAHIRO_STATUSLINE_TESTING === "1"
  ? Object.freeze({ parseSubagentProcesses, parseQuota, quotaSegments, parseUsageSettings, createUsageController, herdrSidebarUsageConsumerActive, fetchQuota, renderStatusline, renderUsagePanel, paintQuotaText, visibleWidth, truncateAnsi, emptyGitStatus })
  : null;

function emptyGitStatus(): GitStatus {
  return {
    branch: null,
    dirtyCount: 0,
    untrackedCount: 0,
    modifiedCount: 0,
    deletedCount: 0,
    ahead: 0,
    behind: 0,
  };
}

async function getGitStatus(cwd: string | null): Promise<GitStatus> {
  if (!cwd) return emptyGitStatus();

  try {
    const lines = (await execFileAsync("git", ["status", "--porcelain=v2", "--branch"], {
      cwd,
      encoding: "utf8",
      timeout: 1_000,
    })).stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);

    const status = emptyGitStatus();

    for (const line of lines) {
      if (line.startsWith("# branch.head ")) {
        const branch = line.slice("# branch.head ".length).trim();
        status.branch = branch === "(detached)" ? null : branch;
        continue;
      }
      if (line.startsWith("# branch.ab ")) {
        const match = line.match(/\+(\d+)\s+-(\d+)/);
        if (match) {
          status.ahead = Number(match[1] ?? 0);
          status.behind = Number(match[2] ?? 0);
        }
        continue;
      }
      if (line.startsWith("? ")) {
        status.untrackedCount += 1;
        continue;
      }
      if (line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u ")) {
        const xy = line.split(/\s+/, 3)[1] ?? "";
        if (xy.includes("A")) status.untrackedCount += 1;
        else if (xy.includes("D")) status.deletedCount += 1;
        else status.modifiedCount += 1;
      }
    }

    if (!status.branch) {
      status.branch = (await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
        cwd,
        encoding: "utf8",
        timeout: 700,
      })).stdout.trim() || null;
    }

    status.dirtyCount = status.untrackedCount + status.modifiedCount + status.deletedCount;
    return status;
  } catch {
    return emptyGitStatus();
  }
}

async function getMemfsStatus(memoryDir: string | null): Promise<MemfsStatus | null> {
  if (!memoryDir) return null;

  try {
    const dirtyLines = (await execFileAsync("git", ["status", "--porcelain"], {
      cwd: memoryDir,
      encoding: "utf8",
      timeout: 1_000,
    })).stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .filter((line) => !line.startsWith("?? .letta/"));

    return dirtyLines.length > 0 ? { state: "dirty", dirtyCount: dirtyLines.length } : { state: "clean", dirtyCount: 0 };
  } catch {
    return { state: "unknown", dirtyCount: 0 };
  }
}
function getMemoryDir(agentId: string | null): string | null {
  if (process.env.MEMORY_DIR) return process.env.MEMORY_DIR;
  if (!agentId) return null;

  const localBackendPath = join(
    process.env.HOME ?? "",
    ".letta",
    "lc-local-backend",
    "memfs",
    agentId,
    "memory",
  );
  return existsSync(localBackendPath) ? localBackendPath : null;
}

function getReflectionStatus(context: any): string | null {
  const reflection = context?.reflection ?? context?.rawPayload?.reflection;
  const mode = reflection?.mode;

  if (mode === "off") return "💤 off";
  if (mode === "compaction-event") return "🗜️ compact";
  if (mode === "step-count") {
    const stepCount = pickNumber(reflection?.stepCount, reflection?.step_count);
    return stepCount && stepCount > 0 ? `😴 ${stepCount}` : "😴 step";
  }

  return null;
}

function getModeColor(mode: string): string {
  if (mode === "unrestricted") return STATUS_COLORS.modeUnrestricted;
  if (mode === "accept-edits" || mode === "acceptEdits") return STATUS_COLORS.modeAcceptEdits;
  return STATUS_COLORS.modeStandard;
}

function getRtkColor(mode: string): string {
  return mode === "rewrite-rtk" ? STATUS_COLORS.rtk : STATUS_COLORS.activity;
}

function getContextColor(usedPercentage: number): string {
  if (usedPercentage >= 85) return "#F1689F";
  if (usedPercentage >= 65) return STATUS_COLORS.dirty;
  return STATUS_COLORS.context;
}

function getMemfsColor(status: MemfsStatus): string {
  if (status.state === "dirty" || status.state === "unknown") return STATUS_COLORS.memDirty;
  return STATUS_COLORS.memClean;
}

function getModeLabel(context: any): string | null {
  const permissionMode = pick(context?.permissionMode, context?.rawPayload?.permission_mode);
  if (!permissionMode) return null;

  if (permissionMode === "acceptEdits") return "accept-edits";
  return permissionMode;
}

async function getRtkMode(): Promise<string | null> {
  const state = await readJson(join(process.env.HOME ?? "", ".letta", "mods", "rtk-control.state.json"));
  const mode = pick(state?.mode);
  return mode && mode !== "off" ? mode : null;
}

async function getReflectionStatusFromSettings(agentId: string | null, cwd: string | null): Promise<string | null> {
  const [globalSettings, localSettings] = await Promise.all([
    readJson(join(process.env.HOME ?? "", ".letta", "settings.json")),
    cwd ? readJson(join(cwd, ".letta", "settings.local.json")) : Promise.resolve(null),
  ]);

  const scoped = agentId
    ? localSettings?.reflectionSettingsByAgent?.[agentId] ?? globalSettings?.reflectionSettingsByAgent?.[agentId]
    : null;
  const trigger = pick(
    scoped?.trigger,
    localSettings?.reflectionTrigger,
    globalSettings?.reflectionTrigger,
    normalizeLegacyReflectionTrigger(localSettings?.memoryReminderInterval),
    normalizeLegacyReflectionTrigger(globalSettings?.memoryReminderInterval),
    "compaction-event",
  );
  const stepCount = pickNumber(scoped?.stepCount, localSettings?.reflectionStepCount, globalSettings?.reflectionStepCount, 25);

  if (trigger === "off") return "💤 off";
  if (trigger === "step-count") return stepCount ? `😴 ${stepCount}` : "😴 step";
  if (trigger === "compaction-event") return "🗜️ compact";
  return null;
}

async function readJson(path: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function normalizeLegacyReflectionTrigger(value: unknown): string | null {
  if (typeof value === "number") return "step-count";
  if (value === null) return "off";
  if (value === "compaction" || value === "auto-compaction") return "compaction-event";
  if (value === "off" || value === "step-count" || value === "compaction-event") return value;
  return null;
}

function getAgentName(context: any): string | null {
  return pick(context?.agent?.name, context?.rawPayload?.agent?.name);
}

function getModelName(context: any): string | null {
  return pick(
    context?.model?.displayName,
    context?.model?.display_name,
    context?.rawPayload?.model?.display_name,
    context?.rawPayload?.model?.displayName,
    context?.model?.id,
    context?.rawPayload?.model?.id,
  );
}

function getReasoningEffort(context: any): string | null {
  return pick(
    context?.model?.reasoningEffort,
    context?.model?.reasoning_effort,
    context?.model?.reasoning?.reasoning_effort,
    context?.rawPayload?.model?.reasoningEffort,
    context?.rawPayload?.model?.reasoning_effort,
    context?.rawPayload?.model?.reasoning?.reasoning_effort,
    context?.rawPayload?.model_settings?.reasoning_effort,
    context?.rawPayload?.model_settings?.reasoning?.reasoning_effort,
    context?.rawPayload?.llm_config?.reasoning_effort,
    context?.rawPayload?.reasoning_effort,
  );
}

function getBackendLabel(context: any): string | null {
  if (context?.ui?.isLocalBackend === true) return "local";

  const explicit = pick(
    context?.backend?.label,
    context?.backend?.name,
    context?.rawPayload?.backend?.label,
    context?.rawPayload?.backend?.name,
    context?.server?.label,
    context?.server?.name,
    context?.rawPayload?.server?.label,
    context?.rawPayload?.server?.name,
  );
  if (explicit) return explicit;

  const baseUrl = pick(
    context?.backend?.baseUrl,
    context?.backend?.base_url,
    context?.rawPayload?.backend?.baseUrl,
    context?.rawPayload?.backend?.base_url,
    context?.server?.baseUrl,
    context?.server?.base_url,
    context?.rawPayload?.server?.baseUrl,
    context?.rawPayload?.server?.base_url,
  );

  const agentId = pick(context?.agent?.id, context?.rawPayload?.agent?.id);
  if (!baseUrl && agentId?.startsWith("agent-local-")) return "local";
  if (!baseUrl) return null;
  if (baseUrl.startsWith("local:")) return "local";
  return baseUrl;
}

function renderSegments(chalk: any, segments: StatusSegment[]): string {
  return segments
    .map((segment, index) => {
      const prefix = index > 0 ? color(chalk, STATUS_COLORS.separator, " · ") : "";
      return `${prefix}${paintQuotaText(chalk, segment.color, segment.text, 8, segment.dim)}`;
    })
    .join("");
}

function fitSegmentPrefix(
  segments: StatusSegment[],
  maxWidth: number,
  chalk: any,
): { fitted: StatusSegment[]; remaining: StatusSegment[] } {
  if (maxWidth <= 0) return { fitted: [], remaining: segments };

  const fitted: StatusSegment[] = [];
  let index = 0;
  for (; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = [...fitted, segment];
    if (visibleWidth(renderSegments(chalk, next)) > maxWidth) break;
    fitted.push(segment);
  }

  return { fitted, remaining: segments.slice(index) };
}

function compactModelName(modelName: string | null): string | null {
  if (!modelName) return null;
  return shortId(modelName.replace(/\s*\([^)]*\)\s*/g, "").replace(/^openai\//, ""), 18);
}

function shortConversation(conversation: string): string {
  return shortId(conversation.replace(/^local-conv-/, "conv-"), 14);
}

function formatGitStatus(status: GitStatus): string {
  const parts = [`🌿 ${shortId(status.branch ?? "git", 18)}`];
  if (status.ahead > 0) parts.push(`↑${status.ahead}`);
  if (status.behind > 0) parts.push(`↓${status.behind}`);
  if (status.dirtyCount === 0) parts.push("✓");
  else {
    if (status.untrackedCount > 0) parts.push(`+${status.untrackedCount}`);
    if (status.modifiedCount > 0) parts.push(`~${status.modifiedCount}`);
    if (status.deletedCount > 0) parts.push(`-${status.deletedCount}`);
  }
  return parts.join(" ");
}

function compactMemfsStatus(status: MemfsStatus): string {
  if (status.state === "clean") return "🧠✓";
  if (status.state === "dirty") return `🧠+${status.dirtyCount}`;
  return "🧠?";
}

function compactToolName(name: string): string {
  return shortId(name.replace(/^functions\./, ""), 18);
}

function shortErrorLabel(message: string | null): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes("rate") && lower.includes("limit")) return "rate limit";
  if (lower.includes("credit") || lower.includes("quota")) return "quota";
  if (lower.includes("auth") || lower.includes("api key") || lower.includes("unauthorized")) return "auth";
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  return shortId(message.replace(/\s+/g, " "), 18);
}

function compactModeLabel(mode: string): string {
  if (mode === "unrestricted") return "🔓 unrestricted";
  if (mode === "accept-edits" || mode === "acceptEdits") return "✏️ accept-edits";
  if (mode === "standard") return "🛡️ standard";
  return `⚙️ ${mode}`;
}

function compactRtkMode(mode: string): string {
  if (mode === "rewrite-rtk") return "rtk:rewrite";
  if (mode === "rewrite-safe") return "rtk:safe";
  if (mode === "suggest") return "rtk:suggest";
  return `rtk:${shortId(mode, 10)}`;
}

function color(chalk: any, hex: string | undefined, text: string, dim = false): string {
  let output = text;

  try {
    if (hex && typeof chalk?.hex === "function") output = chalk.hex(hex)(output);
    else if (typeof chalk?.dim === "function") output = chalk.dim(output);
  } catch {
    output = text;
  }

  if (!dim) return output;

  try {
    return typeof chalk?.dim === "function" ? chalk.dim(output) : output;
  } catch {
    return output;
  }
}

function fallbackRow(left: string, right: string, width: number): string {
  if (!right) return left;
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  const gap = Math.max(1, width - leftWidth - rightWidth);
  return `${left}${" ".repeat(gap)}${right}`;
}

const widthSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemeWidth(segment: string): number {
  const point = segment.codePointAt(0) ?? 0;
  if (point <= 31 || (point >= 127 && point <= 159) || isZeroWidthCodePoint(point)
    || /^\p{Default_Ignorable_Code_Point}+$/u.test(segment)) return 0;
  if (/\p{Emoji_Presentation}/u.test(segment) || (/\p{Extended_Pictographic}/u.test(segment) && segment.includes("\uFE0F"))
    || /[#*0-9]\uFE0F?\u20E3/u.test(segment)) return 2;
  return isWideCodePoint(point) ? 2 : 1;
}

function visibleWidth(value: string): number {
  let width = 0;
  for (const { segment } of widthSegmenter.segment(stripAnsi(value))) width += graphemeWidth(segment);
  return width;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|$))/g, "");
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff))
  );
}

function isZeroWidthCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x200d ||
    codePoint === 0xfe0e ||
    codePoint === 0xfe0f ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

function truncateAnsi(value: string, maxWidth: number): string {
  const plain = stripAnsi(value);
  let width = 0;
  let output = "";
  for (const { segment } of widthSegmenter.segment(plain)) {
    const nextWidth = width + graphemeWidth(segment);
    if (nextWidth > maxWidth) break;
    output += segment;
    width = nextWidth;
  }
  return output;
}

function formatReasoningEffort(effort: string | null): string | null {
  if (!effort || effort === "none") return null;
  if (effort === "medium") return "med";
  if (effort === "extra_high" || effort === "extra-high") return "xhigh";
  return effort;
}

function pick(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function basename(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function shortId(value: string, max = 18): string {
  const parts = Array.from(widthSegmenter.segment(value), ({ segment }) => segment);
  if (parts.length <= max) return value;
  const keep = Math.max(4, max - 3);
  return `${parts.slice(0, keep).join("")}…`;
}

// Quota is provider-owned remaining capacity, never Letta token usage. Disk state
// contains only allowlisted settings/normalized windows, never auth or responses.
type UsageProvider = "codex" | "agy";
type UsageSettings = { codex: boolean; agy: boolean; style: "bar" | "compact" };
type UsageWindow = { label: string; remaining: number; reset: number | null };
type QuotaResult = UsageWindow[] & { credits?: number | null; resetCredits?: number | null };
type UsageSnapshot = { windows: UsageWindow[]; fetched: number; retry: number; failed: boolean; identity?: string; credits?: number | null; resetCredits?: number | null };
function usageIdentity(provider: UsageProvider): string {
  if (provider === "agy") return "local-ls";
  try {
    const stat = lstatSync(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"));
    return `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.size}`;
  } catch { return "missing"; }
}
const USAGE_DIR = process.env.MAHIRO_STATUSLINE_USAGE_DIR ?? join(homedir(), ".letta", "mods", "mahiro-usage");
const USAGE_TTL = 120_000;
const USAGE_STALE = 300_000;
const USAGE_METER_FILLED = "▰";
const USAGE_METER_EMPTY = "▱";
const usageDefaults = (): UsageSettings => ({ codex: false, agy: false, style: "bar" });

function herdrSidebarUsageConsumerActive(): boolean {
  if (process.env.HERDR_ENV !== "1") return false;
  const configRoot = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  const snapshotPath = process.env.MAHIRO_HERDR_SIDEBAR_SNAPSHOT
    ?? join(configRoot, "herdr", "plugins", "config", "mahiro-herdr-sidebar", "config-snapshots.json");
  try {
    const details = lstatSync(snapshotPath);
    return details.isFile() && !details.isSymbolicLink() && details.size > 0 && details.size <= 64 * 1024;
  } catch {
    return false;
  }
}

function usageRead(name: string): any {
  const path = join(USAGE_DIR, name);
  let fd: number | undefined;
  try {
    if (lstatSync(USAGE_DIR).isSymbolicLink()) throw new Error("unsafe directory");
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 32_768) throw new Error("unsafe state");
    return JSON.parse(readFileSync(fd, "utf8"));
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Usage state unavailable; repair local usage state before changing settings.");
  } finally { if (fd !== undefined) closeSync(fd); }
}

function usageWrite(name: string, value: unknown) {
  mkdirSync(USAGE_DIR, { recursive: true, mode: 0o700 });
  if (lstatSync(USAGE_DIR).isSymbolicLink()) throw new Error("unsafe directory");
  // Validate existing targets rather than replacing symlinks or corrupt settings.
  usageRead(name);
  const temporary = join(USAGE_DIR, `${name}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    renameSync(temporary, join(USAGE_DIR, name));
  } finally { try { unlinkSync(temporary); } catch {} }
}

function parseUsageSettings(value: any): UsageSettings {
  if (value === null) return usageDefaults();
  if (!value || typeof value.codex !== "boolean" || typeof value.agy !== "boolean"
    || !["bar", "compact"].includes(value.style)) throw new Error("Invalid usage settings.");
  return { codex: value.codex, agy: value.agy, style: value.style };
}

function quotaNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageMeter(printed: number, cells: number): string {
  let filled = Math.round(Math.min(100, Math.max(0, printed)) / 100 * cells);
  if (printed > 0 && printed < 100 && cells > 1) filled = Math.min(cells - 1, Math.max(1, filled));
  return USAGE_METER_FILLED.repeat(filled) + USAGE_METER_EMPTY.repeat(cells - filled);
}

function providerUsageRow(segments: StatusSegment[], provider: string, width: number, chalk?: any): string {
  const representatives = provider === "Codex"
    ? [segments.find((part) => /^Codex P:/.test(part.text)) ?? segments[0]]
    : [segments.find((part) => part.text.startsWith("Agy Gemini:")) ?? segments[0], segments.find((part) => part.text.startsWith("Agy Claude-GPT:"))];
  const required = [...new Set(representatives.filter((part): part is StatusSegment => Boolean(part)))];
  const extras = segments.filter((part) => !required.includes(part));
  const concise = (part: StatusSegment, cells: number): StatusSegment => ({ ...part,
    text: part.text.slice(provider.length + 1).replace(/ ([▰▱]{8}) (?=(\d+)% left)/, (_meter, _cells, percent) => cells
      ? ` ${usageMeter(Number(percent), cells)} ` : " ")
      .replace(/% left/g, "%"),
  });
  const render = (parts: StatusSegment[]) => `${color(chalk, STATUS_COLORS.context, provider)} ${renderSegments(chalk, parts)}`;
  // Providers own separate rows and shrink independently. Keep actual primary
  // families before optional windows at narrow widths. When extras fit, restore
  // their normalized source order so each Agy family keeps its 5h/7d pair.
  for (const cells of [8, 6, 4, 2, 0]) {
    const selected = [...required];
    const rendered = () => render(segments.filter((part) => selected.includes(part)).map((part) => concise(part, cells)));
    if (visibleWidth(rendered()) > width) continue;
    for (const extra of extras) {
      selected.push(extra);
      if (visibleWidth(rendered()) > width) selected.pop();
    }
    return rendered();
  }
  const first = concise(required[0], 0);
  return visibleWidth(render([first])) <= width ? render([first]) : truncateAnsi(`${provider} …`, width);
}

function quotaColor(remaining: number): string {
  if (remaining <= 15) return STATUS_COLORS.error;
  if (remaining <= 35) return STATUS_COLORS.dirty;
  return STATUS_COLORS.memClean;
}

// Plain meter text is the layout/cache boundary; ANSI is applied only by public
// render-context chalk. Only the outlined remainder is dimmed, in the same hue.
function paintQuotaText(chalk: any, hue: string | undefined, text: string, cells = 8, dim = false): string {
  const match = text.match(/([▰▱]{2,16})(?= (\d+)%)/);
  if (!match || match.index === undefined) return color(chalk, hue, text, dim);
  const remaining = Number(match[2]);
  const targetCells = cells === 8 ? match[1].length : cells;
  const meter = usageMeter(remaining, targetCells);
  const filled = [...meter].filter((cell) => cell === USAGE_METER_FILLED).length;
  return color(chalk, hue, text.slice(0, match.index), dim)
    + color(chalk, hue, USAGE_METER_FILLED.repeat(filled), dim)
    + color(chalk, hue, USAGE_METER_EMPTY.repeat(targetCells - filled), true)
    + color(chalk, hue, text.slice(match.index + match[0].length), dim);
}

function renderUsagePanel(output: string, chalk?: any, page = 0, availableWidth = 80): string[] {
  const clean = (value: string) => value
    .replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|$))/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, 240);
  const width = Math.max(1, Math.min(240, Number.isFinite(availableWidth) ? Math.floor(availableWidth) : 80));
  const lines = output.split("\n").slice(0, 300).map((line) => clean(line).trim()).filter(Boolean);
  const states = lines.filter((line) => /^(codex|agy): (on|off)$/.test(line));
  const windows = lines.filter((line) => /^(Codex|Agy) .*\d+% left(?: stale)?$/.test(line));
  const codex = windows.find((line) => line.startsWith("Codex P:")) ?? windows.find((line) => line.startsWith("Codex "));
  const gemini = windows.find((line) => line.startsWith("Agy Gemini:")) ?? windows.find((line) => line.startsWith("Agy "));
  const claude = windows.find((line) => line.startsWith("Agy Claude-GPT:"));
  const representatives = [...new Set([codex, gemini, claude].filter((line): line is string => Boolean(line)))];
  const tone = (line: string) => {
    const remaining = line.match(/ (\d+)% left(?: stale)?$/);
    return /unavailable|stale|not changed/.test(line) ? STATUS_COLORS.dirty : remaining ? quotaColor(Number(remaining[1])) : STATUS_COLORS.model;
  };
  const wrap = (line: string): string[] => {
    const chunks: string[] = [];
    while (line) { const chunk = truncateAnsi(line, width); if (!chunk) break; chunks.push(chunk); line = line.slice(chunk.length); }
    return chunks;
  };
  let provider = "";
  const details = lines.filter((line) => !line.startsWith("Provider quota:") && !line.startsWith("Codex P/S =")).flatMap((line) => {
    if (/^(codex|agy):/.test(line)) provider = line.split(":")[0];
    const tagged = /^(Codex|Agy|codex|agy)[ :]/.test(line) ? line : `${provider ? `${provider}: ` : ""}${line}`;
    return wrap(paintQuotaText(null, undefined, tagged, 16)).map((chunk) => paintQuotaText(chalk, tone(line), chunk));
  });
  // Installed ModPanelRow caps ALL additive + product-status rows at eight.
  // Five local rows leave three for the provider-separated statusline; pages
  // hold three width-bounded detail rows plus title/navigation.
  const pages = Math.max(1, Math.ceil(details.length / 3));
  const heading = color(chalk, STATUS_COLORS.agent, truncateAnsi(page ? `Mahiro Usage · details ${page}/${pages}` : "Mahiro Usage · remaining", width));
  const footer = color(chalk, STATUS_COLORS.model, truncateAnsi(page
    ? `/mh-usage status ${page < pages ? page + 1 : 1} · summary: /mh-usage · closes 10s`
    : `/mh-usage status 1 · ${pages} detail pages · closes 10s`, width), true);
  if (page) return [heading, ...(page <= pages ? details.slice((page - 1) * 3, page * 3) : [color(chalk, STATUS_COLORS.dirty, truncateAnsi(`Page unavailable; choose 1-${pages}.`, width))]), footer];
  let cells = 16;
  for (const count of [16, 8, 4, 2, 0]) {
    cells = count;
    if (representatives.every((line) => visibleWidth(count ? paintQuotaText(null, undefined, line, count) : line.replace(/ [▰▱]{8}/g, "")) <= width)) break;
  }
  const summary = representatives.map((line) => {
    const text = cells ? paintQuotaText(chalk, tone(line), line, cells) : color(chalk, tone(line), line.replace(/ [▰▱]{8}/g, ""));
    return visibleWidth(text) <= width ? text : color(chalk, tone(line), truncateAnsi(text, width));
  });
  const notices = lines.filter((line) => /unavailable|not changed|^Usage:/.test(line) && !line.startsWith("fetched") && !line.startsWith("credits:") && !line.includes(" resets "));
  const state = summary.length < 3 ? states.map((line) => line.replace(": ", " · ").toUpperCase()).join(" · ") : "";
  return [heading, ...summary, ...(state ? [color(chalk, STATUS_COLORS.context, truncateAnsi(state, width))] : []),
    ...notices.slice(0, Math.max(0, 3 - summary.length - (state ? 1 : 0))).map((line) => color(chalk, STATUS_COLORS.dirty, truncateAnsi(line, width))),
    ...(!summary.length && !state && !notices.length ? lines.slice(0, 3).map((line) => color(chalk, tone(line), truncateAnsi(line, width))) : []), footer].slice(0, 5);
}

function safeQuotaLabel(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9 ._:/()-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64) : "";
}

function quotaBalance(value: unknown): number | null {
  const number = typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? Number(value) : quotaNumber(value);
  return number !== null && Number.isFinite(number) && number >= 0 ? number : null;
}

function parseQuota(provider: UsageProvider, data: any): QuotaResult {
  const windows: QuotaResult = [];
  if (provider === "codex") {
    windows.credits = quotaBalance(data?.credits?.balance);
    windows.resetCredits = quotaBalance(data?.rate_limit_reset_credits?.available_count);
    const limits = [{ label: "", rate_limit: data?.rate_limit },
      ...(Array.isArray(data?.additional_rate_limits) ? data.additional_rate_limits.map((limit: any, index: number) => ({ label: safeQuotaLabel(limit?.limit_name) || safeQuotaLabel(limit?.metered_feature) || `Additional ${index + 1}`, rate_limit: limit?.rate_limit })) : []),
      { label: "Code review", rate_limit: data?.code_review_rate_limit }];
    for (const limit of limits) for (const key of ["primary_window", "secondary_window"]) {
      const window = limit.rate_limit?.[key];
      const used = quotaNumber(window?.used_percent);
      const seconds = quotaNumber(window?.limit_window_seconds);
      if (used === null || used < 0 || used > 100 || seconds === null || seconds <= 0) continue;
      const duration = seconds % 86400 === 0 ? `${seconds / 86400}d` : seconds % 3600 === 0 ? `${seconds / 3600}h` : `${seconds}s`;
      const reset = quotaNumber(window?.reset_at);
      windows.push({ label: `${limit.label ? `${limit.label} ` : ""}${key === "primary_window" ? "P" : "S"}:${duration}`, remaining: 100 - used, reset: reset !== null && reset > 0 && reset < 8.64e12 ? reset * 1000 : null });
    }
  } else {
    const response = data?.response?.response ?? data?.response;
    // Known family mappings follow Agent Halo's quota-summary contract. Unknown
    // buckets retain their provider identity and explicit window metadata.
    const labels: Record<string, string> = { "gemini-5h": "Gemini:5h", "gemini-weekly": "Gemini:7d", "3p-5h": "Claude-GPT:5h", "3p-weekly": "Claude-GPT:7d" };
    const groups = Array.isArray(response?.groups) ? response.groups : [];
    const seen = new Set<string>();
    for (const group of groups) for (const bucket of Array.isArray(group?.buckets) ? group.buckets : []) {
      const id = bucket?.bucketId;
      const fraction = quotaNumber(bucket?.remainingFraction);
      if (!safeQuotaLabel(id) || seen.has(id) || fraction === null || fraction < 0 || fraction > 1) continue;
      seen.add(id);
      const reset = typeof bucket.resetTime === "string" ? Date.parse(bucket.resetTime) : NaN;
      const label = Object.hasOwn(labels, id) ? labels[id] : `${safeQuotaLabel(id)}:${safeQuotaLabel(bucket.window) || "window unavailable"}`;
      windows.push({ label, remaining: fraction * 100, reset: Number.isFinite(reset) ? reset : null });
    }
    const rank = (label: string) => { const index = Object.values(labels).indexOf(label); return index < 0 ? 4 : index; };
    windows.sort((a, b) => rank(a.label) - rank(b.label));
  }
  if (windows.length > 64) throw new Error("Quota window count exceeds safe detail bound");
  return windows;
}

function quotaSegments(provider: UsageProvider, snapshot: UsageSnapshot | undefined, style: UsageSettings["style"], now = Date.now()): StatusSegment[] {
  const name = provider === "codex" ? "Codex" : "Agy";
  if (!snapshot?.windows.length) return [{ text: `${name} unavailable`, dim: true }];
  const stale = snapshot.failed || now - snapshot.fetched > USAGE_STALE;
  return snapshot.windows.map((window) => {
    const expired = stale || (window.reset !== null && window.reset <= now);
    const percent = Math.round(window.remaining);
    const bar = style === "bar" ? ` ${usageMeter(percent, 8)}` : "";
    return { text: `${name} ${window.label}${bar} ${percent}% left${expired ? " stale" : ""}`, color: expired ? STATUS_COLORS.model : quotaColor(window.remaining) };
  });
}

async function fetchQuota(provider: UsageProvider, signal: AbortSignal): Promise<QuotaResult> {
  const json = async (url: string, options: RequestInit) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(provider === "agy" ? 1500 : 6000)]), redirect: "error" });
    if (!response.ok) throw new Error("unavailable");
    // Stream cap also bounds malformed local services and remote error payloads.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("unavailable");
    let body = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        body += decoder.decode(chunk.value, { stream: true });
        if (body.length > 262_144) throw new Error("oversized");
      }
      return JSON.parse(body + decoder.decode());
    } finally { await reader.cancel().catch(() => {}); }
  };
  if (provider === "codex") {
    const auth = await readJson(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"));
    const token = auth?.tokens?.access_token;
    if (typeof token !== "string" || !token) throw new Error("unavailable");
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (typeof auth.tokens.account_id === "string") headers["ChatGPT-Account-Id"] = auth.tokens.account_id;
    return parseQuota(provider, await json("https://chatgpt.com/backend-api/wham/usage", { headers }));
  }
  // Inspect existing executables only; never launch Agy or refresh authentication.
  const ps = await execFileAsync("ps", ["-ax", "-o", "pid=,command="], { encoding: "utf8", timeout: 1500, maxBuffer: 2_000_000, signal });
  const candidates = ps.stdout.split("\n").map((line) => line.match(/^\s*(\d+)\s+(\S+)(.*)$/)).filter((match) => {
    if (!match) return false;
    const executable = match[2].toLowerCase();
    return /(?:^|\/)agy$/.test(executable) || (executable.includes("language_server") && executable.includes("antigravity"));
  }).slice(0, 2);
  for (const candidate of candidates) {
    if (!candidate) continue;
    const csrf = candidate[3].match(/--csrf_token(?:=|\s+)([^\s]+)/)?.[1]?.replace(/^"|"$/g, "") ?? "";
    let ports: string[] = [];
    try {
      const result = await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", candidate[1]], { encoding: "utf8", timeout: 1500, maxBuffer: 64_000, signal });
      ports = [...new Set([...result.stdout.matchAll(/:(\d+) \(LISTEN\)/g)].map((match) => match[1]))].slice(0, 4);
    } catch { continue; }
    for (const port of ports) {
      try {
        const data = await json(`http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, {
          method: "POST", headers: { "Content-Type": "application/json", "Connect-Protocol-Version": "1", "x-codeium-csrf-token": csrf },
          body: JSON.stringify({ metadata: { ideName: "antigravity", extensionName: "antigravity", ideVersion: "unknown", locale: "en" } }),
        });
        const windows = parseQuota(provider, data);
        if (windows.length) return windows;
      } catch { if (signal.aborted) break; }
    }
  }
  throw new Error("unavailable");
}

async function refreshHerdrSidebar(signal: AbortSignal): Promise<void> {
  await execFileAsync(process.env.HERDR_BIN_PATH ?? "herdr", [
    "plugin", "action", "invoke", "refresh", "--plugin", "mahiro-herdr-sidebar",
  ], {
    encoding: "utf8",
    timeout: 3_000,
    maxBuffer: 32_768,
    signal,
  });
}

function readUsageSnapshot(provider: UsageProvider): UsageSnapshot | undefined {
  const value = usageRead(`${provider}.json`);
  if (!value || value.identity !== usageIdentity(provider)) return undefined;
  if (!Array.isArray(value.windows) || value.windows.length > 64 || typeof value.failed !== "boolean"
    || ![value.fetched, value.retry].every((n) => quotaNumber(n) !== null && n >= 0 && n <= Date.now() + 900_000)) return undefined;
  const allowed = /^[a-zA-Z0-9 ._:/()-]+$/;
  if (!value.windows.every((w: any) => typeof w?.label === "string" && w.label.length <= 160 && allowed.test(w.label)
    && quotaNumber(w.remaining) !== null && w.remaining >= 0 && w.remaining <= 100
    && (w.reset === null || (quotaNumber(w.reset) !== null && Math.abs(w.reset) < 8.64e15)))) return undefined;
  return { windows: value.windows.map((w: UsageWindow) => ({ label: w.label, remaining: w.remaining, reset: w.reset })), fetched: value.fetched, retry: value.retry, failed: value.failed, credits: quotaBalance(value.credits), resetCredits: quotaBalance(value.resetCredits) };
}

function createUsageController(
  publish: (segments: StatusSegment[]) => void,
  load = fetchQuota,
  sidebarConsumer = herdrSidebarUsageConsumerActive,
  notifySidebar = refreshHerdrSidebar,
) {
  let settings = usageDefaults();
  let disposed = false;
  let busy = false;
  let generation = 0;
  const controllers = new Set<AbortController>();
  const snapshots: Partial<Record<UsageProvider, UsageSnapshot>> = {};
  const emit = () => { if (!disposed) publish((["codex", "agy"] as const).flatMap((p) => settings[p] ? quotaSegments(p, snapshots[p], settings.style) : [])); };
  const update = async () => {
    if (disposed || busy) return;
    busy = true;
    const current = generation;
    try {
      settings = parseUsageSettings(usageRead("settings.json"));
      const collectForSidebar = sidebarConsumer();
      let cacheWritten = false;
      for (const provider of ["codex", "agy"] as const) {
        if (disposed || current !== generation) break;
        if (!settings[provider] && !collectForSidebar) { delete snapshots[provider]; continue; }
        snapshots[provider] = readUsageSnapshot(provider);
        emit();
        if ((snapshots[provider]?.retry ?? 0) > Date.now()) continue;
        mkdirSync(USAGE_DIR, { recursive: true, mode: 0o700 });
        if (lstatSync(USAGE_DIR).isSymbolicLink()) throw new Error("unsafe directory");
        const lock = join(USAGE_DIR, `${provider}.lock`);
        let fd: number;
        try { fd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); }
        catch {
          // Crashed owners expire only beyond the complete fetch deadline. Do not
          // retry acquisition in this tick; a live successor owns its own inode.
          try { if (Date.now() - lstatSync(lock).mtimeMs > 30_000) unlinkSync(lock); } catch {}
          continue;
        }
        const inode = fstatSync(fd).ino;
        const controller = new AbortController();
        controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const cached = readUsageSnapshot(provider);
          if (cached && cached.retry > Date.now()) { snapshots[provider] = cached; continue; }
          const identity = usageIdentity(provider);
          let next: UsageSnapshot;
          try {
            const windows = await load(provider, controller.signal);
            if (!windows.length && windows.credits == null && windows.resetCredits == null) throw new Error("unavailable");
            next = { windows, fetched: Date.now(), retry: Date.now() + USAGE_TTL, failed: false, credits: windows.credits ?? null, resetCredits: windows.resetCredits ?? null };
          } catch {
            next = { windows: cached?.windows ?? [], fetched: cached?.fetched ?? 0, retry: Date.now() + 300_000, failed: true, credits: cached?.credits ?? null, resetCredits: cached?.resetCredits ?? null };
          }
          if (disposed || current !== generation) continue;
          if (identity !== usageIdentity(provider)) continue;
          next.identity = identity;
          usageWrite(`${provider}.json`, next);
          cacheWritten = true;
          snapshots[provider] = next;
        } finally {
          clearTimeout(timeout);
          controllers.delete(controller);
          closeSync(fd);
          try { if (lstatSync(lock).ino === inode) unlinkSync(lock); } catch {}
        }
      }
      if (cacheWritten && collectForSidebar && !disposed && current === generation) {
        const controller = new AbortController();
        controllers.add(controller);
        try { await notifySidebar(controller.signal); }
        catch { /* Cache remains valid; the next cache write or pane event retries projection. */ }
        finally { controllers.delete(controller); }
      }
    } catch { delete snapshots.codex; delete snapshots.agy; }
    finally { busy = false; emit(); }
  };
  return {
    update,
    command(raw: string) {
      if (disposed) return { type: "output", output: "Usage statusline is inactive." };
      try {
        const args = raw.trim().toLowerCase().split(/\s+/);
        settings = parseUsageSettings(usageRead("settings.json"));
        if (args[0] && args[0] !== "status") {
          if (args.length === 1 && args[0] === "off") settings = { ...settings, codex: false, agy: false };
          else if (args.length === 1 && ["bar", "compact"].includes(args[0])) settings.style = args[0] as UsageSettings["style"];
          else if (args.length === 2 && ["codex", "agy"].includes(args[0]) && ["on", "off"].includes(args[1])) settings[args[0] as UsageProvider] = args[1] === "on";
          else return { type: "output", output: "Usage: /mh-usage [status|off|codex on/off|agy on/off|bar|compact]" };
          usageWrite("settings.json", settings);
          generation += 1;
          for (const controller of controllers) controller.abort();
          emit();
          void update();
        }
        const lines = [`Provider quota: ${settings.style}; percentages are remaining.`, "Codex P/S = actual primary/secondary duration. Agy labels retain provider bucket identity. Windows are independent."];
        for (const provider of ["codex", "agy"] as const) {
          lines.push(`${provider}: ${settings[provider] ? "on" : "off"}`);
          if (!settings[provider]) continue;
          let snapshot = snapshots[provider];
          try { snapshot ??= readUsageSnapshot(provider); } catch {}
          lines.push(...quotaSegments(provider, snapshot, settings.style).map((s) => s.text));
          if (provider === "codex") {
            const stale = snapshot && (snapshot.failed || Date.now() - snapshot.fetched > USAGE_STALE) ? " (stale)" : "";
            lines.push(`  credits: ${snapshot?.credits ?? "unavailable"}${stale}; reset credits: ${snapshot?.resetCredits ?? "unavailable"}${stale}`);
          }
          for (const window of snapshot?.windows ?? []) lines.push(`  ${window.label} resets ${window.reset === null ? "unavailable" : new Date(window.reset).toISOString()}`);
          lines.push(`  fetched ${snapshot?.fetched ? new Date(snapshot.fetched).toISOString() : "never"}; absolute limits not supplied by these quota APIs.`);
        }
        return { type: "output", output: lines.join("\n") };
      } catch { return { type: "output", output: "Usage state unavailable; settings were not changed." }; }
    },
    dispose() { disposed = true; generation += 1; for (const controller of controllers) controller.abort(); },
  };
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
