import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const UPDATE_INTERVAL_MS = 10_000;

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
  capabilities?: {
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

export default function activate(letta: LettaApi) {
  if (!letta.capabilities?.ui?.panels || !letta.ui?.openPanel) {
    letta.diagnostics?.report?.({
      message: "Custom statusline requires the panels UI capability.",
      severity: "warning",
    });
    return;
  }

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
  };

  const panel = letta.ui.openPanel({
    id: "statusline",
    order: 0,
    render: (context) => renderStatusline(context, status),
  });

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
    setActivity(`🔧 ${compactToolName(pick(event?.toolName, event?.tool_name, event?.name) ?? "tool")}`, STATUS_COLORS.activity, 30_000);
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
    disposed = true;
    clearInterval(timer);
    if (activityClearTimer) clearTimeout(activityClearTimer);
    if (compactClearTimer) clearTimeout(compactClearTimer);
    for (const dispose of disposers.reverse()) dispose();
    panel.close();
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
    const primary = fitSegmentPrefix(leftCandidates, availableLeftWidth, chalk);
    const overflow = fitSegmentPrefix(primary.remaining, width, chalk);
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
      return `${prefix}${color(chalk, segment.color, segment.text, segment.dim)}`;
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

function visibleWidth(value: string): number {
  const plain = stripAnsi(value);
  let width = 0;
  for (const char of plain) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isZeroWidthCodePoint(codePoint)) continue;
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
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
  for (const char of plain) {
    const codePoint = char.codePointAt(0) ?? 0;
    const charWidth = isZeroWidthCodePoint(codePoint) ? 0 : isWideCodePoint(codePoint) ? 2 : 1;
    const nextWidth = width + charWidth;
    if (nextWidth > maxWidth) break;
    output += char;
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
  if (value.length <= max) return value;
  const keep = Math.max(4, max - 3);
  return `${value.slice(0, keep)}…`;
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
