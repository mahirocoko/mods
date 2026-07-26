/**
 * Mahiro Goal — structured workflow goal foundation for Mahiro's Letta mods.
 *
 * Surfaces: /mh-goal, mh_get_goal, mh_create_goal, mh_update_goal.
 * State: ~/.letta/mods/mahiro-goal.state.json.
 */

import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const SCHEMA_VERSION = 1;
const MAX_OBJECTIVE_CHARS = 4000;
const MAX_CRITERIA = 20;
const MAX_CRITERION_CHARS = 800;
const MAX_NON_GOALS = 20;
const MAX_TEXT_CHARS = 1200;
const MAX_EVIDENCE_PER_CRITERION = 30;
const MAX_BLOCKERS = 30;
const MAX_HISTORY = 80;

const STATE_PATH = resolve(
  process.env.MAHIRO_GOAL_STATE_PATH
    ?? join(homedir(), ".letta", "mods", "mahiro-goal.state.json"),
);
const LOCK_PATH = `${STATE_PATH}.lock`;

type GoalStatus = "active" | "paused" | "blocked" | "complete";
type CriterionOwner = "agent" | "human";
type CriterionStatus = "pending" | "claimed" | "verified" | "blocked";
type Actor = "agent" | "human" | "system";
type EvidenceKind = "file" | "command" | "test" | "browser" | "native" | "manual" | "user" | "other";

interface Scope {
  agentId: string;
  conversationId: string;
  key: string;
}

interface LockHandle {
  token: string;
  tokenPath: string;
}

interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  summary: string;
  reference: string | null;
  actor: Actor;
  createdAt: string;
}

interface Criterion {
  id: string;
  text: string;
  owner: CriterionOwner;
  required: boolean;
  status: CriterionStatus;
  evidence: EvidenceItem[];
  note: string | null;
  updatedAt: string;
}

interface Blocker {
  id: string;
  summary: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

interface HistoryItem {
  at: string;
  actor: Actor;
  action: string;
  summary: string;
  revision: number;
}

interface WorkflowGoal {
  id: string;
  revision: number;
  objective: string;
  status: GoalStatus;
  phase: string;
  nextAction: string | null;
  criteria: Criterion[];
  nonGoals: string[];
  blockers: Blocker[];
  workspace: string;
  agentId: string;
  conversationId: string;
  activeTimeSeconds: number;
  activeStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: HistoryItem[];
}

interface WorkflowState {
  schemaVersion: 1;
  goals: Record<string, WorkflowGoal>;
}

interface CriterionInput {
  text: string;
  owner?: CriterionOwner;
  required?: boolean;
}

interface GoalCreateInput {
  objective: string;
  criteria: CriterionInput[];
  nonGoals?: string[];
  nextAction?: string | null;
  replace?: boolean;
  expectedRevision?: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function compactText(value: unknown, max = MAX_TEXT_CHARS): string {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function scopeFrom(ctx: any = {}, event: any = {}): Scope {
  const agentId = compactText(ctx?.agent?.id ?? event?.agentId ?? event?.agent_id ?? process.env.AGENT_ID, 240);
  const conversationId = compactText(
    ctx?.conversation?.id ?? event?.conversationId ?? event?.conversation_id ?? process.env.CONVERSATION_ID,
    240,
  );
  if (!agentId || !conversationId) {
    throw new Error("Mahiro Goal requires concrete agent and conversation identity; refusing shared fallback scope.");
  }
  const defaultLaneWorkspace = conversationId === "default" ? workspaceFrom(ctx, event) : "";
  return {
    agentId,
    conversationId,
    key: JSON.stringify([agentId, conversationId, defaultLaneWorkspace]),
  };
}

function workspaceFrom(ctx: any = {}, event: any = {}): string {
  return resolve(String(ctx?.cwd ?? event?.cwd ?? event?.workingDirectory ?? process.cwd()));
}

function emptyState(): WorkflowState {
  return { schemaVersion: SCHEMA_VERSION, goals: {} };
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isBoundedString(value, 80)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasUniqueIds(items: unknown[]): boolean {
  if (!items.every((item) => isRecord(item) && typeof item.id === "string")) return false;
  const ids = items.map((item: any) => item.id);
  return ids.length === new Set(ids).size;
}

function normalizeStoredGoal(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized = structuredClone(value);
  delete normalized.tokenBudget;
  delete normalized.tokenBaseline;
  delete normalized.tokensUsed;
  if (normalized.status === "budget_limited") {
    normalized.status = "active";
    normalized.activeStartedAt = nowIso();
  }
  return normalized;
}

function validateStoredGoal(key: string, value: unknown): asserts value is WorkflowGoal {
  if (!isRecord(value)) throw new Error(`Mahiro Goal state entry ${key} must be an object.`);
  const stringLimits: Record<string, number> = {
    id: 160,
    objective: MAX_OBJECTIVE_CHARS,
    status: 32,
    phase: 120,
    workspace: 4096,
    agentId: 240,
    conversationId: 240,
    createdAt: 80,
    updatedAt: 80,
  };
  for (const [field, max] of Object.entries(stringLimits)) {
    if (!isBoundedString(value[field], max)) throw new Error(`Mahiro Goal state entry ${key} has invalid ${field}.`);
  }
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) {
    throw new Error(`Mahiro Goal state entry ${key} has invalid timestamps.`);
  }
  if (!["active", "paused", "blocked", "complete"].includes(value.status)) {
    throw new Error(`Mahiro Goal state entry ${key} has invalid status.`);
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new Error(`Mahiro Goal state entry ${key} has invalid revision.`);
  }
  if (!Number.isSafeInteger(value.activeTimeSeconds) || value.activeTimeSeconds < 0) {
    throw new Error(`Mahiro Goal state entry ${key} has invalid activeTimeSeconds.`);
  }
  if (value.nextAction !== null && !isBoundedString(value.nextAction, MAX_TEXT_CHARS)) {
    throw new Error(`Mahiro Goal state entry ${key} has invalid nextAction.`);
  }
  if (value.activeStartedAt !== null && !isIsoTimestamp(value.activeStartedAt)) {
    throw new Error(`Mahiro Goal state entry ${key} has invalid activeStartedAt.`);
  }
  if ((value.status === "active") !== (value.activeStartedAt !== null)) {
    throw new Error(`Mahiro Goal state entry ${key} has inconsistent active clock state.`);
  }
  if (!Array.isArray(value.criteria) || !Array.isArray(value.nonGoals) || !Array.isArray(value.blockers) || !Array.isArray(value.history)) {
    throw new Error(`Mahiro Goal state entry ${key} has invalid collection fields.`);
  }
  if (value.criteria.length === 0
    || value.criteria.length > MAX_CRITERIA
    || value.nonGoals.length > MAX_NON_GOALS
    || value.blockers.length > MAX_BLOCKERS
    || value.history.length === 0
    || value.history.length > MAX_HISTORY
    || value.nonGoals.some((item: unknown) => !isBoundedString(item, MAX_CRITERION_CHARS))) {
    throw new Error(`Mahiro Goal state entry ${key} exceeds collection limits or contains invalid non-goals.`);
  }
  if (!hasUniqueIds(value.criteria) || !hasUniqueIds(value.blockers)) {
    throw new Error(`Mahiro Goal state entry ${key} contains duplicate criterion or blocker IDs.`);
  }
  for (const criterion of value.criteria) {
    if (!isRecord(criterion)
      || !isBoundedString(criterion.id, 120)
      || !isBoundedString(criterion.text, MAX_CRITERION_CHARS)
      || !["agent", "human"].includes(criterion.owner)
      || !["pending", "claimed", "verified", "blocked"].includes(criterion.status)
      || typeof criterion.required !== "boolean"
      || (criterion.note !== null && !isBoundedString(criterion.note, MAX_TEXT_CHARS))
      || !isIsoTimestamp(criterion.updatedAt)
      || !Array.isArray(criterion.evidence)) {
      throw new Error(`Mahiro Goal state entry ${key} has an invalid criterion.`);
    }
    if (criterion.evidence.length > MAX_EVIDENCE_PER_CRITERION) {
      throw new Error(`Mahiro Goal state entry ${key} has too much criterion evidence.`);
    }
    if (!hasUniqueIds(criterion.evidence)) {
      throw new Error(`Mahiro Goal state entry ${key} has duplicate evidence IDs.`);
    }
    for (const evidence of criterion.evidence) {
      if (!isRecord(evidence)
        || !isBoundedString(evidence.id, 120)
        || !["file", "command", "test", "browser", "native", "manual", "user", "other"].includes(evidence.kind)
        || !isBoundedString(evidence.summary, MAX_TEXT_CHARS)
        || (evidence.reference !== null && !isBoundedString(evidence.reference, MAX_TEXT_CHARS))
        || !["agent", "human", "system"].includes(evidence.actor)
        || !isIsoTimestamp(evidence.createdAt)) {
        throw new Error(`Mahiro Goal state entry ${key} has invalid criterion evidence.`);
      }
    }
  }
  for (const blocker of value.blockers) {
    if (!isRecord(blocker)
      || !isBoundedString(blocker.id, 120)
      || !isBoundedString(blocker.summary, MAX_TEXT_CHARS)
      || !["open", "resolved"].includes(blocker.status)
      || !isIsoTimestamp(blocker.createdAt)
      || (blocker.resolvedAt !== null && !isIsoTimestamp(blocker.resolvedAt))
      || (blocker.status === "open" && blocker.resolvedAt !== null)
      || (blocker.status === "resolved" && blocker.resolvedAt === null)) {
      throw new Error(`Mahiro Goal state entry ${key} has an invalid blocker.`);
    }
  }
  for (const history of value.history) {
    if (!isRecord(history)
      || !isIsoTimestamp(history.at)
      || !["agent", "human", "system"].includes(history.actor)
      || !isBoundedString(history.action, 120)
      || !isBoundedString(history.summary, 500)
      || !Number.isSafeInteger(history.revision)
      || history.revision < 1
      || history.revision > value.revision) {
      throw new Error(`Mahiro Goal state entry ${key} has invalid history.`);
    }
  }
  const expectedKey = JSON.stringify([
    value.agentId,
    value.conversationId,
    value.conversationId === "default" ? resolve(value.workspace) : "",
  ]);
  if (key !== expectedKey) {
    throw new Error(`Mahiro Goal state entry ${key} does not match its scoped identity.`);
  }
}

function readState(): WorkflowState {
  if (!existsSync(STATE_PATH)) return emptyState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse Mahiro Goal state: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error("Mahiro Goal state must be a JSON object.");
  }
  const candidate = structuredClone(parsed) as Partial<WorkflowState>;
  if (candidate.schemaVersion !== SCHEMA_VERSION || !isRecord(candidate.goals)) {
    throw new Error(`Unsupported Mahiro Goal state schema. Expected ${SCHEMA_VERSION}.`);
  }
  for (const [key, goal] of Object.entries(candidate.goals)) {
    candidate.goals[key] = normalizeStoredGoal(goal) as WorkflowGoal;
    validateStoredGoal(key, candidate.goals[key]);
  }
  return candidate as WorkflowState;
}

function writeState(state: WorkflowState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const temporary = `${STATE_PATH}.tmp-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  let fd: number | null = null;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporary, STATE_PATH);
    const directoryFd = openSync(dirname(STATE_PATH), "r");
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  } finally {
    if (fd !== null) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

function acquireStateLock(): LockHandle {
  mkdirSync(dirname(LOCK_PATH), { recursive: true });
  const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const candidatePath = `${LOCK_PATH}.candidate-${token}`;
  const candidateTokenPath = join(candidatePath, token);
  let fd: number | null = null;
  try {
    mkdirSync(candidatePath, { mode: 0o700 });
    fd = openSync(candidateTokenPath, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify({ token, pid: process.pid, createdAt: nowIso() })}\n`, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    const candidateDirectoryFd = openSync(candidatePath, "r");
    try {
      fsyncSync(candidateDirectoryFd);
    } finally {
      closeSync(candidateDirectoryFd);
    }
    renameSync(candidatePath, LOCK_PATH);
    return { token, tokenPath: join(LOCK_PATH, token) };
  } catch (error: any) {
    if (fd !== null) closeSync(fd);
    rmSync(candidatePath, { recursive: true, force: true });
    if (["EEXIST", "ENOTEMPTY", "EISDIR", "ENOTDIR"].includes(error?.code)) {
      throw new Error("Mahiro Goal state is busy in another Letta process. Retry, or use /mh-goal unlock --force only after confirming the owner is gone.");
    }
    throw error;
  }
}

function releaseStateLock(lock: LockHandle): void {
  rmSync(lock.tokenPath, { force: true });
  try {
    rmdirSync(LOCK_PATH);
  } catch (error: any) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) throw error;
  }
}

function forceUnlock(): boolean {
  if (!existsSync(LOCK_PATH)) return false;
  const quarantine = `${LOCK_PATH}.abandoned-${Date.now()}-${randomUUID().slice(0, 8)}`;
  renameSync(LOCK_PATH, quarantine);
  rmSync(quarantine, { recursive: lstatSync(quarantine).isDirectory(), force: true });
  return true;
}

// Isolated repository smoke seam; normal packaged runtimes export null.
export const __testing = process.env.MAHIRO_GOAL_TESTING === "1"
  ? Object.freeze({ acquireStateLock, releaseStateLock, forceUnlock, lockPath: LOCK_PATH })
  : null;

function withLockedState<T>(mutate: (state: WorkflowState) => T): T {
  const lock = acquireStateLock();
  try {
    const state = readState();
    const result = mutate(state);
    writeState(state);
    return result;
  } finally {
    releaseStateLock(lock);
  }
}

function historyEntry(revision: number, actor: Actor, action: string, summary: string): HistoryItem {
  return {
    at: nowIso(),
    actor,
    action,
    summary: compactText(summary, 500),
    revision,
  };
}

function mutateGoal(
  scope: Scope,
  actor: Actor,
  action: string,
  summary: string,
  expectedRevision: number | null,
  mutate: (goal: WorkflowGoal) => WorkflowGoal,
): WorkflowGoal {
  return withLockedState((state) => {
    const current = state.goals[scope.key];
    if (!current) throw new Error("No Mahiro Goal exists for this conversation.");
    if (current.status === "complete") {
      throw new Error("Completed Mahiro Goals are immutable. Clear or explicitly replace the goal instead.");
    }
    if (expectedRevision !== null && current.revision !== expectedRevision) {
      throw new Error(`Stale Mahiro Goal revision: expected ${expectedRevision}, current ${current.revision}. Read the goal again before updating.`);
    }
    const revision = current.revision + 1;
    const next = mutate(structuredClone(current));
    next.revision = revision;
    next.updatedAt = nowIso();
    next.history = [
      ...(Array.isArray(next.history) ? next.history : []),
      historyEntry(revision, actor, action, summary),
    ].slice(-MAX_HISTORY);
    state.goals[scope.key] = next;
    return structuredClone(next);
  });
}

function clearGoal(scope: Scope): boolean {
  return withLockedState((state) => {
    if (!state.goals[scope.key]) return false;
    delete state.goals[scope.key];
    return true;
  });
}

function getGoal(scope: Scope): WorkflowGoal | null {
  const goal = readState().goals[scope.key];
  return goal ? structuredClone(goal) : null;
}

function goalProgress(goal: WorkflowGoal) {
  const required = goal.criteria.filter((item) => item.required);
  const satisfied = required.filter((item) =>
    item.owner === "human"
      ? item.status === "verified"
      : item.status === "claimed" && item.evidence.length > 0,
  );
  const humanPending = required.filter((item) => item.owner === "human" && item.status !== "verified");
  const agentPending = required.filter((item) => item.owner === "agent" && (item.status !== "claimed" || item.evidence.length === 0));
  return { required, satisfied, humanPending, agentPending };
}

function goalStateLabel(goal: WorkflowGoal): string {
  const progress = goalProgress(goal);
  const openBlockers = goal.blockers.filter((item) => item.status === "open");
  if (goal.status === "complete") return "Goal complete — all required DoD criteria passed the completion audit.";
  if (goal.status === "paused") return "Paused — wait for Mahiro to resume the goal.";
  if (goal.status === "blocked" || openBlockers.length) return "Blocked — resolve the recorded blocker before continuing.";
  if (progress.humanPending.length) return `Waiting for Mahiro — human gates: ${progress.humanPending.map((item) => item.id).join(", ")}.`;
  if (progress.agentPending.length) return `Agent work remaining — criteria: ${progress.agentPending.map((item) => item.id).join(", ")}.`;
  return "Checkpoint — agent criteria are claimed; the goal remains open until any required human gates pass.";
}

function formatGoalList(goals: WorkflowGoal[]): string {
  if (!goals.length) return "No Mahiro Goals are stored for this agent.";
  return [
    "Mahiro Goals · human-only inventory",
    ...goals
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((goal) => `${goal.id} · ${goal.status} · rev ${goal.revision} · ${goal.conversationId} · ${goal.updatedAt.slice(0, 10)} · ${compactText(goal.objective, 140)}`),
    "Use /mh-goal clear <goal-id> <revision> only after recording the disposition elsewhere when history matters.",
  ].join("\n");
}

function listGoals(): WorkflowGoal[] {
  return Object.values(readState().goals).map((goal) => structuredClone(goal));
}

function clearGoalById(goalId: string, revision: number): WorkflowGoal {
  return withLockedState((state) => {
    const matches = Object.entries(state.goals).filter(([, goal]) => goal.id === goalId);
    if (!matches.length) throw new Error(`No Mahiro Goal exists with id ${goalId}.`);
    if (matches.length > 1) throw new Error(`Mahiro Goal id ${goalId} is ambiguous; refusing to clear.`);
    const [key, current] = matches[0];
    if (!Number.isSafeInteger(revision) || revision !== current.revision) {
      throw new Error(`Clearing ${goalId} requires current revision ${current.revision}.`);
    }
    delete state.goals[key];
    return structuredClone(current);
  });
}

function validateObjective(value: unknown): string {
  const objective = String(value ?? "").trim();
  if (!objective) throw new Error("Goal objective must not be empty.");
  if (objective.length > MAX_OBJECTIVE_CHARS) {
    throw new Error(`Goal objective exceeds ${MAX_OBJECTIVE_CHARS} characters.`);
  }
  return objective;
}

function normalizeCriteria(input: CriterionInput[]): Criterion[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("At least one Definition of Done criterion is required.");
  }
  if (input.length > MAX_CRITERIA) throw new Error(`At most ${MAX_CRITERIA} criteria are allowed.`);
  const timestamp = nowIso();
  return input.map((item, index) => {
    const text = String(item?.text ?? "").trim();
    if (!text) throw new Error(`Criterion ${index + 1} must not be empty.`);
    if (text.length > MAX_CRITERION_CHARS) {
      throw new Error(`Criterion ${index + 1} exceeds ${MAX_CRITERION_CHARS} characters.`);
    }
    const owner = item.owner ?? "agent";
    if (owner !== "agent" && owner !== "human") {
      throw new Error(`Criterion ${index + 1} owner must be agent or human.`);
    }
    return {
      id: `criterion-${String(index + 1).padStart(2, "0")}`,
      text,
      owner,
      required: item.required !== false,
      status: "pending",
      evidence: [],
      note: null,
      updatedAt: timestamp,
    };
  });
}

function normalizeNonGoals(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error("non_goals must be an array of strings.");
  if (input.length > MAX_NON_GOALS) throw new Error(`At most ${MAX_NON_GOALS} non-goals are allowed.`);
  return input.map((item, index) => {
    const text = compactText(item, MAX_CRITERION_CHARS);
    if (!text) throw new Error(`Non-goal ${index + 1} must not be empty.`);
    return text;
  });
}

function createGoal(scope: Scope, workspace: string, input: GoalCreateInput, actor: Actor): WorkflowGoal {
  const objective = validateObjective(input.objective);
  const criteria = normalizeCriteria(input.criteria);
  const nonGoals = normalizeNonGoals(input.nonGoals);
  const nextAction = input.nextAction == null ? null : compactText(input.nextAction);
  if (input.nextAction != null && !nextAction) throw new Error("next_action must not be empty when provided.");
  const timestamp = nowIso();
  return withLockedState((state) => {
    const existing = state.goals[scope.key];
    if (existing && input.replace !== true) {
      throw new Error("A Mahiro Goal already exists. Clear it or explicitly replace it first.");
    }
    if (input.replace === true) {
      if (!existing) throw new Error("Cannot replace a Mahiro Goal that does not exist.");
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== existing.revision) {
        throw new Error(`Replacing a Mahiro Goal requires expected_revision ${existing.revision}.`);
      }
    }
    const goal: WorkflowGoal = {
      id: `mh-goal-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      revision: 1,
      objective,
      status: "active",
      phase: "execution",
      nextAction,
      criteria,
      nonGoals,
      blockers: [],
      workspace,
      agentId: scope.agentId,
      conversationId: scope.conversationId,
      activeTimeSeconds: 0,
      activeStartedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      history: [historyEntry(1, actor, input.replace ? "goal_replaced" : "goal_created", objective)],
    };
    state.goals[scope.key] = goal;
    return structuredClone(goal);
  });
}

function liveElapsedSeconds(goal: WorkflowGoal): number {
  if (goal.status !== "active" || !goal.activeStartedAt) return goal.activeTimeSeconds;
  const startedAt = Date.parse(goal.activeStartedAt);
  const live = Number.isNaN(startedAt) ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return goal.activeTimeSeconds + live;
}

function stopClock(goal: WorkflowGoal): WorkflowGoal {
  if (!goal.activeStartedAt) return goal;
  const startedAt = Date.parse(goal.activeStartedAt);
  const elapsed = Number.isNaN(startedAt) ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  goal.activeTimeSeconds += elapsed;
  goal.activeStartedAt = null;
  return goal;
}

function startClock(goal: WorkflowGoal): WorkflowGoal {
  goal.activeStartedAt ??= nowIso();
  return goal;
}

function criterionById(goal: WorkflowGoal, id: unknown): Criterion {
  const criterion = goal.criteria.find((item) => item.id === String(id ?? ""));
  if (!criterion) throw new Error(`Unknown criterion: ${String(id ?? "<missing>")}`);
  return criterion;
}

function blockerById(goal: WorkflowGoal, id: unknown): Blocker {
  const blocker = goal.blockers.find((item) => item.id === String(id ?? ""));
  if (!blocker) throw new Error(`Unknown blocker: ${String(id ?? "<missing>")}`);
  return blocker;
}

function completionIssues(goal: WorkflowGoal): string[] {
  const issues: string[] = [];
  const openBlockers = goal.blockers.filter((item) => item.status === "open");
  if (openBlockers.length) issues.push(`open blockers: ${openBlockers.map((item) => item.id).join(", ")}`);
  for (const criterion of goal.criteria.filter((item) => item.required)) {
    if (criterion.status === "blocked") {
      issues.push(`${criterion.id} is blocked`);
      continue;
    }
    if (criterion.owner === "human" && criterion.status !== "verified") {
      issues.push(`${criterion.id} requires human verification`);
      continue;
    }
    if (criterion.owner === "agent" && (criterion.status !== "claimed" || criterion.evidence.length === 0)) {
      issues.push(`${criterion.id} has not been claimed with evidence`);
    }
  }
  return issues;
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return `${minutes}m ${safe % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function criterionMark(status: CriterionStatus): string {
  if (status === "verified") return "✓";
  if (status === "claimed") return "◉";
  if (status === "blocked") return "!";
  return "–";
}

function formatGoal(goal: WorkflowGoal): string {
  const criteria = goal.criteria.map(
    (item) => `${criterionMark(item.status)} ${item.id} [${item.owner}${item.required ? ", required" : ""}] ${item.text}`,
  );
  const blockers = goal.blockers.filter((item) => item.status === "open");
  return [
    `Mahiro Goal · ${goal.status} · revision ${goal.revision}`,
    `Objective: ${goal.objective}`,
    `Phase: ${goal.phase}`,
    `Next: ${goal.nextAction ?? "not set"}`,
    `State: ${goalStateLabel(goal)}`,
    `Workspace: ${goal.workspace}`,
    `Active time: ${formatElapsed(liveElapsedSeconds(goal))}`,
    "DoD:",
    ...criteria,
    "Blockers:",
    ...(blockers.length ? blockers.map((item) => `! ${item.id}: ${item.summary}`) : ["– none"]),
  ].join("\n");
}

function compactStatusPanel(goal: WorkflowGoal | null): string[] {
  if (!goal) return ["Mahiro Goal · no goal for this conversation"];
  const progress = goalProgress(goal);
  const blockers = goal.blockers.filter((item) => item.status === "open").length;
  return [
    `Mahiro Goal · ${goal.status} · revision ${goal.revision}`,
    `Objective  ${compactText(goal.objective, 100)}`,
    `Progress   ${progress.satisfied.length}/${progress.required.length} required · ${blockers} blocker${blockers === 1 ? "" : "s"}`,
    `State      ${compactText(goalStateLabel(goal), 100)}`,
    `Next       ${compactText(goal.nextAction ?? "not set", 100)}`,
  ];
}

function buildReminder(goal: WorkflowGoal, currentWorkspace: string): string {
  const progress = goalProgress(goal);
  const workspaceWarning = currentWorkspace === goal.workspace
    ? ""
    : `\nWorkspace warning: goal was created for ${goal.workspace}, current cwd is ${currentWorkspace}. Do not silently move goal ownership.`;
  return `<system-reminder>
Mahiro Workflow Goal is ${goal.status} for this conversation.

Objective: ${goal.objective}
Phase: ${goal.phase}
Next action: ${goal.nextAction ?? "choose the smallest grounded next action"}
DoD progress: ${progress.satisfied.length}/${progress.required.length} required criteria satisfied
Human gates pending: ${progress.humanPending.length ? progress.humanPending.map((item) => item.id).join(", ") : "none"}
Open blockers: ${goal.blockers.filter((item) => item.status === "open").length}
Revision: ${goal.revision}${workspaceWarning}

Turn completion, a checkpoint report, an Execution Run report, and Herdr Done never mean this Goal is complete. Ending this turn with a checkpoint report while the Goal remains active is correct behavior. State the remaining criterion and next action; do not use final-project language unless the completion audit succeeds.

${progress.humanPending.length
  ? "A human gate is pending: report the checkpoint and wait for Mahiro's verification or direction."
  : progress.agentPending.length
    ? "Agent-owned work remains: if the next action is grounded and stays within scope, continue it in this turn; otherwise issue a checkpoint with the exact next action."
    : "All agent-owned criteria are claimed: issue a checkpoint and wait for any required human verification."}

Use mh_get_goal before mutating stale state. Add concrete evidence before claiming an agent-owned criterion. Never verify a human-owned criterion yourself. Complete the Goal only when all required agent criteria are claimed, all required human criteria are verified, and no blockers remain.
</system-reminder>`;
}

function addEvidence(goal: WorkflowGoal, args: any, actor: Actor): WorkflowGoal {
  const criterion = criterionById(goal, args.criterion_id);
  if (criterion.evidence.length >= MAX_EVIDENCE_PER_CRITERION) {
    throw new Error(`${criterion.id} already has the maximum evidence entries.`);
  }
  const summary = compactText(args.summary);
  if (!summary) throw new Error("Evidence summary must not be empty.");
  const allowedKinds = new Set<EvidenceKind>(["file", "command", "test", "browser", "native", "manual", "user", "other"]);
  const kind = String(args.kind ?? "other") as EvidenceKind;
  if (!allowedKinds.has(kind)) throw new Error(`Unsupported evidence kind: ${kind}`);
  const reference = args.reference == null ? null : compactText(args.reference);
  if (args.reference != null && !reference) throw new Error("Evidence reference must not be empty when provided.");
  criterion.evidence.push({
    id: `evidence-${randomUUID().slice(0, 8)}`,
    kind,
    summary,
    reference,
    actor,
    createdAt: nowIso(),
  });
  criterion.updatedAt = nowIso();
  return goal;
}

function updateGoalFromTool(scope: Scope, args: any): WorkflowGoal {
  const action = String(args.action ?? "");
  const expectedRevision = Number(args.expected_revision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("expected_revision must be the current positive goal revision.");
  }
  return mutateGoal(scope, "agent", action, args.summary ?? action, expectedRevision, (goal) => {
    if (action === "set_phase") {
      const phase = compactText(args.phase, 120);
      if (!phase) throw new Error("phase is required for set_phase.");
      goal.phase = phase;
      return goal;
    }
    if (action === "set_next") {
      const nextAction = compactText(args.next_action);
      if (!nextAction) throw new Error("next_action is required for set_next.");
      goal.nextAction = nextAction;
      return goal;
    }
    if (action === "add_evidence") return addEvidence(goal, args, "agent");
    if (action === "claim_criterion") {
      const criterion = criterionById(goal, args.criterion_id);
      if (criterion.owner !== "agent") throw new Error(`${criterion.id} is human-owned and cannot be claimed by the agent.`);
      if (criterion.evidence.length === 0) throw new Error(`${criterion.id} needs concrete evidence before it can be claimed.`);
      criterion.status = "claimed";
      if (args.summary != null) {
        const note = compactText(args.summary);
        if (!note) throw new Error("Claim summary must not be empty when provided.");
        criterion.note = note;
      }
      criterion.updatedAt = nowIso();
      return goal;
    }
    if (action === "block_criterion") {
      const criterion = criterionById(goal, args.criterion_id);
      criterion.status = "blocked";
      criterion.note = compactText(args.summary || "Blocked");
      criterion.updatedAt = nowIso();
      goal.status = "blocked";
      stopClock(goal);
      return goal;
    }
    if (action === "add_blocker" || action === "mark_blocked") {
      if (goal.blockers.length >= MAX_BLOCKERS) throw new Error("Goal already has the maximum blocker entries.");
      const summary = compactText(args.summary);
      if (!summary) throw new Error("summary is required when adding a blocker.");
      goal.blockers.push({
        id: `blocker-${randomUUID().slice(0, 8)}`,
        summary,
        status: "open",
        createdAt: nowIso(),
        resolvedAt: null,
      });
      if (action === "mark_blocked") {
        goal.status = "blocked";
        stopClock(goal);
      }
      return goal;
    }
    if (action === "resolve_blocker") {
      const blocker = blockerById(goal, args.blocker_id);
      blocker.status = "resolved";
      blocker.resolvedAt = nowIso();
      return goal;
    }
    if (action === "complete") {
      const issues = completionIssues(goal);
      if (issues.length) throw new Error(`Goal cannot complete: ${issues.join("; ")}.`);
      goal.status = "complete";
      goal.nextAction = null;
      stopClock(goal);
      return goal;
    }
    throw new Error(`Unsupported Mahiro Goal action: ${action}`);
  });
}

function commandOutput(output: string, success = true) {
  return { type: "output" as const, output, success };
}

function jsonResult(payload: unknown) {
  return { status: "success", output: JSON.stringify(payload, null, 2) };
}

function parseCreateArgs(input: string): { objective: string } {
  return { objective: input.trim().replace(/^["']|["']$/g, "").trim() };
}

function simpleCriterion(objective: string): CriterionInput {
  return {
    owner: "agent",
    required: true,
    text: `The objective is complete and audited against concrete repository/runtime evidence: ${compactText(objective, 500)}`,
  };
}

function helpText(): string {
  return [
    "Mahiro Goal — structured workflow goal",
    "",
    "Commands:",
    "  /mh-goal <objective>                     Create a simple goal",
    "  /mh-goal replace <revision> <objective>  Replace the current Mahiro Goal",
    "  /mh-goal status                          Show objective, DoD, evidence state, and blockers",
    "  /mh-goal list                            List bounded Goal records across this agent (human-only)",
    "  /mh-goal pause | resume                  Control active reminders/time",
    "  /mh-goal next <action>                   Set the immediate next action",
    "  /mh-goal phase <name>                    Set the current workflow phase",
    "  /mh-goal evidence <criterion-id> <text>  Add human-provided evidence",
    "  /mh-goal verify <criterion-id> [note]    Verify a criterion as the human owner",
    "  /mh-goal resolve <blocker-id>            Resolve a blocker",
    "  /mh-goal complete [--force]              Complete after DoD audit; --force is explicit human override",
    "  /mh-goal clear                           Remove this conversation's Mahiro Goal",
    "  /mh-goal clear <goal-id> <revision>      Revision-guarded cross-scope clear (human-only)",
    "  /mh-goal unlock --force                  Explicitly remove an abandoned mutation lock",
    "",
    "/mh-goal and mh_* tools are the Goal surfaces for this bundle.",
  ].join("\n");
}

function runCommand(ctx: any) {
  const input = String(ctx?.args ?? "").trim();
  const normalized = input.toLowerCase();

  try {
    const scope = scopeFrom(ctx);
    const workspace = workspaceFrom(ctx);
    if (!input || normalized === "status" || normalized === "show") {
      const goal = getGoal(scope);
      return commandOutput(goal ? formatGoal(goal) : "No Mahiro Goal is set for this conversation.");
    }
    if (["help", "-h", "--help"].includes(normalized)) return commandOutput(helpText());
    if (normalized === "unlock --force") {
      return commandOutput(forceUnlock() ? "Mahiro Goal mutation lock quarantined and removed by explicit human override." : "No Mahiro Goal mutation lock exists.");
    }
    if (normalized === "unlock") return commandOutput("Use /mh-goal unlock --force only after confirming no live mutation owns the lock.", false);
    if (normalized === "list") return commandOutput(formatGoalList(listGoals()));
    const crossScopeClear = input.match(/^clear\s+(\S+)\s+(\d+)$/i);
    if (crossScopeClear) {
      const cleared = clearGoalById(compactText(crossScopeClear[1], 160), Number(crossScopeClear[2]));
      return commandOutput(`Mahiro Goal cleared: ${cleared.id} · ${cleared.conversationId} · revision ${cleared.revision}.`);
    }
    if (normalized === "clear") {
      return commandOutput(clearGoal(scope) ? "Mahiro Goal cleared." : "No Mahiro Goal was set.");
    }
    if (normalized === "pause") {
      const goal = mutateGoal(scope, "human", "goal_paused", "Paused by Mahiro.", null, (current) => {
        stopClock(current);
        current.status = "paused";
        return current;
      });
      return commandOutput(formatGoal(goal));
    }
    if (normalized === "resume") {
      const goal = mutateGoal(scope, "human", "goal_resumed", "Resumed by Mahiro.", null, (current) => {
        const unresolved = current.blockers.filter((item) => item.status === "open");
        const blockedCriteria = current.criteria.filter((item) => item.status === "blocked");
        if (unresolved.length || blockedCriteria.length) {
          throw new Error("Resolve open blockers and blocked criteria before resuming the goal.");
        }
        current.status = "active";
        startClock(current);
        return current;
      });
      return commandOutput(formatGoal(goal));
    }
    if (normalized.startsWith("next ")) {
      const nextAction = compactText(input.slice(5));
      if (!nextAction) return commandOutput("Next action must not be empty.", false);
      const goal = mutateGoal(scope, "human", "next_set", nextAction, null, (current) => {
        current.nextAction = nextAction;
        return current;
      });
      return commandOutput(formatGoal(goal));
    }
    if (normalized.startsWith("phase ")) {
      const phase = compactText(input.slice(6), 120);
      if (!phase) return commandOutput("Phase must not be empty.", false);
      const goal = mutateGoal(scope, "human", "phase_set", phase, null, (current) => {
        current.phase = phase;
        return current;
      });
      return commandOutput(formatGoal(goal));
    }
    if (normalized.startsWith("evidence ")) {
      const match = input.match(/^evidence\s+(\S+)\s+([\s\S]+)$/i);
      if (!match) return commandOutput("Usage: /mh-goal evidence <criterion-id> <summary>", false);
      const goal = mutateGoal(scope, "human", "evidence_added", match[2], null, (current) =>
        addEvidence(current, { criterion_id: match[1], summary: match[2], kind: "user" }, "human"));
      return commandOutput(formatGoal(goal));
    }
    if (normalized.startsWith("verify ")) {
      const match = input.match(/^verify\s+(\S+)(?:\s+([\s\S]+))?$/i);
      if (!match) return commandOutput("Usage: /mh-goal verify <criterion-id> [note]", false);
      const goal = mutateGoal(scope, "human", "criterion_verified", match[1], null, (current) => {
        const criterion = criterionById(current, match[1]);
        if (criterion.owner !== "human") {
          throw new Error(`${criterion.id} is agent-owned; add evidence and use mh_update_goal claim_criterion instead.`);
        }
        criterion.status = "verified";
        criterion.note = match[2] ? compactText(match[2]) : criterion.note;
        criterion.updatedAt = nowIso();
        return current;
      });
      return commandOutput(formatGoal(goal));
    }
    if (normalized.startsWith("resolve ")) {
      const blockerId = input.slice(8).trim();
      const goal = mutateGoal(scope, "human", "blocker_resolved", blockerId, null, (current) => {
        const blocker = blockerById(current, blockerId);
        blocker.status = "resolved";
        blocker.resolvedAt = nowIso();
        return current;
      });
      return commandOutput(formatGoal(goal));
    }
    if (normalized === "complete" || normalized === "complete --force") {
      const force = normalized.endsWith("--force");
      const goal = mutateGoal(scope, "human", force ? "goal_force_completed" : "goal_completed", force ? "Forced complete by Mahiro." : "Completed after DoD audit.", null, (current) => {
        const issues = completionIssues(current);
        if (issues.length && !force) throw new Error(`Goal cannot complete: ${issues.join("; ")}. Use --force only as an explicit human override.`);
        current.status = "complete";
        current.nextAction = null;
        stopClock(current);
        return current;
      });
      return commandOutput(formatGoal(goal));
    }

    if (normalized === "replace") return commandOutput("Usage: /mh-goal replace <revision> <objective>", false);
    const replaceMatch = input.match(/^replace\s+(\d+)\s+([\s\S]+)$/i);
    if (normalized.startsWith("replace ") && !replaceMatch) {
      return commandOutput("Usage: /mh-goal replace <revision> <objective>", false);
    }
    const createText = replaceMatch?.[2] ?? input;
    const parsed = parseCreateArgs(createText);
    const goal = createGoal(scope, workspace, {
      objective: parsed.objective,
      criteria: [simpleCriterion(parsed.objective)],
      replace: Boolean(replaceMatch),
      expectedRevision: replaceMatch ? Number(replaceMatch[1]) : null,
      nextAction: null,
    }, "human");
    return {
      type: "prompt" as const,
      systemReminder: true,
      content: `${buildReminder(goal, workspace)}\n\nBegin with the smallest grounded next action. Refine the structured DoD through mh_create_goal when Mahiro explicitly requests replacement.`,
    };
  } catch (error) {
    return commandOutput(error instanceof Error ? error.message : String(error), false);
  }
}

const GET_PARAMETERS = { type: "object", properties: {}, additionalProperties: false };
const CREATE_PARAMETERS = {
  type: "object",
  properties: {
    objective: { type: "string", description: "One concrete human-owned objective." },
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: MAX_CRITERIA,
      description: "Definition of Done criteria. Human-owned criteria require Mahiro verification.",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          owner: { type: "string", enum: ["agent", "human"] },
          required: { type: "boolean" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
    non_goals: { type: "array", items: { type: "string" }, maxItems: MAX_NON_GOALS },
    next_action: { type: "string", description: "Immediate next action." },
    replace: { type: "boolean", description: "Must be true only after Mahiro explicitly approved replacement." },
    expected_revision: { type: "integer", minimum: 1, description: "Required with replace=true to guard against stale replacement." },
  },
  required: ["objective", "criteria"],
  additionalProperties: false,
};
const UPDATE_PARAMETERS = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "set_phase",
        "set_next",
        "add_evidence",
        "claim_criterion",
        "block_criterion",
        "add_blocker",
        "resolve_blocker",
        "mark_blocked",
        "complete",
      ],
    },
    expected_revision: { type: "integer", minimum: 1, description: "Current revision returned by mh_get_goal." },
    phase: { type: "string" },
    next_action: { type: "string" },
    criterion_id: { type: "string" },
    blocker_id: { type: "string" },
    summary: { type: "string" },
    kind: { type: "string", enum: ["file", "command", "test", "browser", "native", "manual", "user", "other"] },
    reference: { type: "string" },
  },
  required: ["action", "expected_revision"],
  additionalProperties: false,
};

export default function activate(letta: any) {
  const disposers: Array<() => void> = [];
  let busyStatusPanel: any = null;
  let busyStatusTimer: ReturnType<typeof setTimeout> | null = null;

  const closeBusyStatus = () => {
    if (busyStatusTimer) clearTimeout(busyStatusTimer);
    busyStatusTimer = null;
    busyStatusPanel?.close?.();
    busyStatusPanel = null;
  };

  if (letta.capabilities?.commands && letta.commands?.register) {
    disposers.push(letta.commands.register({
      id: "mh-goal",
      description: "Manage Mahiro's structured conversation goal, DoD, evidence, blockers, and human gates",
      args: "[status|list|pause|resume|next|phase|evidence|verify|resolve|complete|clear|replace|<objective>]",
      run: runCommand,
    }));
  }

  if (letta.capabilities?.commands
    && letta.commands?.register
    && letta.capabilities?.ui?.panels
    && letta.ui?.openPanel) {
    disposers.push(letta.commands.register({
      id: "mh-goal-status",
      description: "Show Mahiro Goal status in a transient panel while the agent may still be working",
      args: "",
      runWhenBusy: true,
      showInTranscript: false,
      run(ctx: any) {
        closeBusyStatus();
        let lines: string[];
        try {
          lines = compactStatusPanel(getGoal(scopeFrom(ctx)));
        } catch (error) {
          lines = [`Mahiro Goal status unavailable · ${error instanceof Error ? error.message : String(error)}`];
        }
        busyStatusPanel = letta.ui.openPanel({
          id: "mahiro-goal-status",
          order: 120,
          render: () => lines,
        });
        busyStatusTimer = setTimeout(closeBusyStatus, 10_000);
        busyStatusTimer.unref?.();
        return { type: "handled" as const };
      },
    }));
  }

  if (letta.capabilities?.tools && letta.tools?.register) {
    disposers.push(letta.tools.register({
      name: "mh_get_goal",
      description: "Read Mahiro's structured goal for the current conversation before planning or mutating goal state.",
      parameters: GET_PARAMETERS,
      requiresApproval: false,
      parallelSafe: true,
      run(ctx: any) {
        const goal = getGoal(scopeFrom(ctx));
        return jsonResult({ goal, completion_issues: goal ? completionIssues(goal) : [] });
      },
    }));
    disposers.push(letta.tools.register({
      name: "mh_create_goal",
      description: "Create or explicitly replace a structured Mahiro Goal only after Mahiro directly requested or approved it. Include concrete DoD criteria and mark visual/product acceptance criteria as human-owned.",
      parameters: CREATE_PARAMETERS,
      requiresApproval: false,
      parallelSafe: false,
      run(ctx: any) {
        const goal = createGoal(scopeFrom(ctx), workspaceFrom(ctx), {
          objective: ctx.args.objective,
          criteria: ctx.args.criteria,
          nonGoals: ctx.args.non_goals,
          nextAction: ctx.args.next_action,
          replace: ctx.args.replace,
          expectedRevision: ctx.args.expected_revision,
        }, "agent");
        return jsonResult({ goal, completion_issues: completionIssues(goal) });
      },
    }));
    disposers.push(letta.tools.register({
      name: "mh_update_goal",
      description: "Update the current structured Mahiro Goal using its latest revision. Add evidence before claiming agent criteria. Never verify human-owned criteria; Mahiro must use /mh-goal verify. Complete only when all required criteria and blockers satisfy the runtime audit.",
      parameters: UPDATE_PARAMETERS,
      requiresApproval: false,
      parallelSafe: false,
      run(ctx: any) {
        const goal = updateGoalFromTool(scopeFrom(ctx), ctx.args);
        return jsonResult({ goal, completion_issues: completionIssues(goal) });
      },
    }));
  }

  if (letta.capabilities?.events?.turns && letta.events?.on) {
    disposers.push(letta.events.on("turn_start", (event: any, ctx: any) => {
      try {
        const scope = scopeFrom(ctx, event);
        const goal = getGoal(scope);
        if (!goal || goal.status !== "active") return;
        return {
          input: [
            { role: "user", content: buildReminder(goal, workspaceFrom(ctx, event)) },
            ...(Array.isArray(event?.input) ? event.input : []),
          ],
        };
      } catch (error) {
        letta.diagnostics?.report?.({
          severity: "warning",
          message: `Mahiro Goal reminder skipped: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }
    }));
  }

  return () => {
    closeBusyStatus();
    for (const dispose of disposers.reverse()) dispose();
  };
}
