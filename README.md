# Mahiro Letta Mods

Private, inspectable Letta Code workflow and runtime mods that Mahiro uses across local projects.

This repository is the canonical source. Runtime state, logs, caches, diagnostics, and installed copies stay under `~/.letta/` and are never committed.

คู่มือใช้งานภาษาไทย: [`docs/usage-th.md`](docs/usage-th.md)

## Included mods

| Entry | Surface | Purpose |
| --- | --- | --- |
| `mods/mahiro-user-timestamps.ts` | `turn_start` | Adds safe local/IANA timestamp metadata and one visible block to each real user turn without timestamping synthetic workflow reminders. |
| `mods/mahiro-herdr-lifecycle.ts` | lifecycle/turn/tool events + bounded child-process observation | Reports one truthful Letta pane state plus bounded child-task counts/types to the owning Herdr pane over its local socket. |
| `mods/mahiro-goal.ts` | `/mh-goal`, busy-safe `/mh-goal-status`, `mh_get_goal`, `mh_create_goal`, `mh_update_goal`, `turn_start` | Structured conversation goal with DoD criteria, evidence, blockers, revision guards, and human verification gates. |
| `mods/mahiro-code-evidence.ts` | `/mh-evidence`, `mh_code_evidence` (`get` / `collect` / `record`) | Bounded read-only Git evidence with separate staged/unstaged/untracked/base lanes, stale-proof external records, conservative verdicts, and explicit Goal handoff. |
| `mods/mahiro-ux-workflow.ts` | `/mh-ux`, `mh_get_ux_workflow`, `mh_create_ux_workflow`, `mh_update_ux_workflow` | Revisioned UX coordination from frame through review, with a required `frontend-design` brief, human direction/review gates, bounded handoff/review evidence, and no Goal mutation. |
| `mods/mahiro-code-map.ts` | `mh_code_map` | Stateless bounded guidance that routes conceptual discovery to `ccc`, exact symbols/paths/strings to exact search, and outline requests to external bounded outline tooling without reading or indexing source. |
| `mods/mahiro-execution-run.ts` | `/mh-run`, `mh_execution_run` (`get`, `create`, `update`) | Optional executor-neutral coordination for complex main-agent, Letta-subagent, Direct-CLI, human, or other work, with declared target ownership, bounded reports, and a Code Evidence intake handoff. |
| `mods/rtk-control.ts` | `/rtk`, `tool_start` | Opt-in RTK status, savings, suggestions, and command rewriting. Default mode is Off. |
| `mods/statusline.tsx` | order-0 panel, lifecycle/turn/tool/LLM/compact events | Compact statusline for workspace, Git, conversation activity, context, MemFS, RTK, model, reasoning, and backend state; left-side overflow wraps by whole segment to one bounded second row, with the right group retained across sparse renders. |
| `mods/mahiro-mcp-proxy.js` | `/mcp-proxy`, `mcp_proxy`, `mcp_proxy_live`, permission overlay | Lazy cached MCP discovery plus separately gated live reconnect/call/disconnect operations. |

Agent Halo is not duplicated here. Its canonical mod remains in the separate [`agent-halo`](https://github.com/mahirocoko/agent-halo) repository and is installed by that project.

## Herdr lifecycle

When Letta Code runs inside a Herdr-managed pane, the lifecycle mod reads only
the inherited local `HERDR_SOCKET_PATH` and pane identity. It combines main
turn/tool/model activity with a bounded local child-process observation, then
reports one semantic `letta` state for Herdr rollups. Child output and
prompts and task descriptions are never forwarded, and headless child processes
never claim the parent pane's lifecycle authority. Presentation metadata is
limited to bounded running/ended counts and subagent types. A process exit is
reported only as `ended`, never fabricated as successful `done`. Outside Herdr
the mod is a no-op.

Herdr remains the owner of unseen `done` state and workspace/tab rollups. The
mod reports `blocked` only for an observed question tool, `working` while the
main turn or any child is active, and `idle` after work settles. Missing
capabilities or socket failures degrade without changing Letta execution.

## User timestamp ownership

Use one timestamp owner per user turn. The bundled handler runs before Mahiro
Goal, returns a composable input
transform, and timestamps the real user message without timestamping the
synthetic Goal reminder.

## Code Evidence

Phase 2 adds repository proof without turning the mod into a coding harness or
security overlay:

```text
/mh-evidence collect /path/to/repo
/mh-evidence status /path/to/repo
/mh-evidence report /path/to/repo
/mh-evidence clear <revision> /path/to/repo
/mh-evidence unlock --force
```

The agent normally uses `mh_code_evidence` with action `collect`, records
already-performed checks with action `record`, then explicitly attaches selected
proof to Goal criteria through `mh_update_goal`. Action `get` reads the latest
report. Collection runs only fixed read-only
Git commands and stores paths/status/counts—not full diffs or file contents.
Recollection invalidates earlier check records for verdict/handoff purposes.
`evidence_ready` is not human verification and never completes a Goal.
Caller-recorded proof is restricted to bounded single-line summaries,
references, and command labels; multiline/raw-diff-shaped payloads are refused.

Runtime state lives at:

```text
~/.letta/mods/mahiro-code-evidence.state.json
```

Do not record secrets or private raw logs in evidence summaries/references.

## UX Workflow

Phase 3 adds a runtime coordinator, not an autonomous design or implementation
engine. The agent must invoke the canonical `frontend-design` skill and record a
brief object with `skill: frontend-design`, mode, reference, and summary before
direction approval or handoff.

That recorded skill/brief reference is caller-supplied coordination metadata,
not proof that the skill executed or that the brief is visually adequate.
Human direction approval remains the authority boundary.

```text
/mh-ux status
/mh-ux approve direction <revision> <concept-id> [note]
/mh-ux approve review <revision> [note]
/mh-ux reject direction|review ...
/mh-ux reopen <revision> [note]
/mh-ux clear <revision>
/mh-ux unlock --force
```

The coordinator enforces `frame → discovery → design → direction_approval →
handoff → implementation → review → complete`, at most three review
iterations, and human-only direction/review approvals. Implementation requires
an approved direction plus a CruiseCode-compatible handoff with readiness,
brief, acceptance criteria, non-goals, constraints, open questions, protected
contracts, target matrix, suggested checks, and Goal criterion references.
Blocking open questions prevent implementation. Only a `Ready` review can be
human-approved, and completion still requires no open blockers.

The mod does not browse, research, run commands, scan files, design, implement
product code, or read/write Goal or Code Evidence state. The agent must attach
selected UX and Code Evidence separately through `mh_update_goal`; UX completion
never verifies, claims, completes, or changes Goal.

State is isolated per explicit agent/conversation identity, plus workspace for
raw `default` lanes, at `~/.letta/mods/mahiro-ux-workflow.state.json`. Writes are
atomic, fsynced, mode `0600`, owner-token locked, revision guarded, recursively
validated, and corruption preserving.

## Code Map

Phase 4 adds one stateless model tool, `mh_code_map`. The caller supplies an
intent (`semantic`, `exact`, or `outline`), a query, optional target-workspace
metadata, and optional path/language hints plus navigation entries already
found by another tool. Code Map never resolves or reads the supplied workspace.
It returns at most 3,000 characters of deterministic guidance:

- semantic/conceptual discovery routes to `ccc`
- exact symbol/path/string lookup routes to `rg` or another exact search
- outline requests route to an existing trusted outline/symbol surface outside
  the mod; Code Map does not generate outlines

Normal guidance stays targeted at two files and 6,000 characters per file.
Broader reading requires an explicit `large_read` object with a reason and
bounded 3–12 file / 6,000–20,000 character-per-file guidance. This is advisory,
not authorization, permission enforcement, or a security boundary.

Caller-supplied search/outline entries are navigation metadata—not verification
evidence. Goal criterion and Code Evidence references are caller-supplied
coordination metadata, not trusted receipts. The mod has no state and never
reads/scans source, indexes a repository, runs a subprocess, generates an
outline, or mutates source, Git, indexes, Goal, or Code Evidence.

## Execution Run

Phase 5 adds an optional coordination ledger for implementation that is too
complex for one short main-agent pass. It is useful for multiple writers,
external CLI/subagent lanes, several worktrees/targets, cross-turn work, or a
material handoff into Code Evidence. It is deliberately skipped for simple
edits.

```text
/mh-run status
/mh-run clear <revision>
/mh-run abandon <revision> [note]
/mh-run unlock --force
```

The model uses one `mh_execution_run` tool with `get`, `create`, and
revision/run-ID-guarded `update` operations. One current run is scoped to
explicit agent/conversation identity, with workspace isolation for raw
`default` lanes. The lifecycle is `plan → ready → active → reported →
handed_off`; blockers are orthogonal and `abandoned` is terminal.

Goal references may be declared when the run is created or corrected with the
plan-only `set_goal_refs` action before `ready`. This keeps a missing initial
binding recoverable without weakening the requirement that `ready` has at least
one explicit Goal reference. After `ready`, Goal references are immutable and
the final handoff must match them exactly.

Every writable target has one declared writer lane while read-only lanes may
share targets. Lanes use one contract across main agents, Letta subagents,
Direct CLI, humans, and other executors. Session/worktree references, paths,
checks, reports, changed paths, and cross-workflow references are caller-supplied
coordination metadata—not process truth, filesystem enforcement, or
verification evidence.

The final Code Evidence intake packet tells the agent which paths/checks/Goal
criteria were declared and explicitly requires fresh evidence collection.
`handed_off` means coordination delivery only; it never means verified,
accepted, merged, or complete.

Execution Run never spawns or controls an executor, chooses a model, creates or
submits prompts, inspects sessions/worktrees/repositories, reads or edits source,
runs Git/tests/browser/native work, stores raw transcripts/diffs/logs, enforces
permissions, or reads/writes another mod's state.

Runtime state lives at:

```text
~/.letta/mods/mahiro-execution-run.state.json
```

It uses bounded recursively validated state, mode-`0600` fsynced atomic writes,
owner-token locking, explicit human force-unlock, corruption preservation, and
run-ID plus revision stale-caller protection.

## Mahiro Goal ownership

`/mh-goal`, `/mh-goal-status`, and the `mh_*` Goal tools are the Goal surfaces
for this bundle. Goal state remains isolated by agent, conversation, and
workspace scope and is never shared with another workflow mod.

```text
/mh-goal status
/mh-goal-status  # transient TUI panel; works while the agent is busy
/mh-goal list  # human-only remaining-work inventory across stored scopes
/mh-goal pause
/mh-goal resume
/mh-goal verify criterion-02 Foreground behavior accepted
/mh-goal complete
/mh-goal revise 7 A revised objective
/mh-goal clear <goal-id> <revision>  # human-only cross-scope cleanup
/mh-goal unlock --force  # abandoned-lock recovery only
```

Agent-owned criteria must have concrete evidence before they can be `claimed`.
Human-owned criteria remain incomplete until Mahiro runs `/mh-goal verify`.
Normal completion fails while required criteria or blockers remain;
`/mh-goal complete --force` is an explicit human-only override.
An agent turn finishing, a checkpoint report, an Execution Run report, or a
Herdr activity label never means a Goal is complete. Active Goals may end a
turn at a checkpoint; the status surface names whether agent work remains or a
human gate is waiting.

`/mh-goal status` remains the detailed idle command. It groups mission, current
state, progress, DoD, plan, blockers, and metadata with host-rendered Markdown
color rather than embedded ANSI escapes. While the main agent is working,
`/mh-goal-status` is a separate read-only `runWhenBusy` command that returns
immediately, writes nothing to the transcript, and shows a compact 10-second
panel with theme-safe semantic color through the public panel render context.
It is registered only on hosts with panel UI, so desktop or headless listeners
do not advertise a command they cannot render.

State is stored at `~/.letta/mods/mahiro-goal.state.json` with atomic mode-0600
writes and an ownership-checked cross-process mutation lock. The state key
combines agent and conversation identity, plus workspace for raw `default`
lanes, so unrelated agents/projects do not merge.

The owner-token lock directory is never reclaimed merely because it is old:
another process may still own it. If a crashed process leaves a lock behind,
confirm no live mutation is running before `/mh-goal unlock --force` atomically
quarantines it. A completed current plan requires an explicit revision before
normal mutation. Every mission revision requires the latest revision shown by
`/mh-goal status`.

Mahiro Goal is a **living mission with a mutable plan**. A revision keeps the
same mission ID and history while it can update the objective, DoD, non-goals,
phase, or next action. `mh_update_goal` also owns bounded plan items
(`pending`, `in_progress`, `done`, `blocked`) so normal reprioritisation does
not require creating a replacement goal. Revising a completed current plan is
explicit and reopens it; completion is never mission destruction. Plan items are
mutable coordination, not hidden completion gates: the explicit DoD and open
blockers remain the completion audit.

`/mh-goal list` shows only missions that still need attention; completed current
plans stay available through their own conversation status/history but are
intentionally hidden from the inventory. Cross-scope cleanup requires the exact
known goal ID and current revision. The model may use the
revision-guarded `mh_clear_goal` only after Mahiro explicitly asked to clear the
current mission; the destructive call requires runtime approval and removes the
record rather than creating a synthetic completed goal. Record any disposition
that matters before clearing a mission.

Goal evidence/history may contain private paths, commands, URLs, or review
notes. They remain local runtime state but may enter tool output/transcripts;
never put credentials or secret values in evidence summaries or references.

Architecture and provenance:

- [`docs/workflow-ecosystem.md`](docs/workflow-ecosystem.md)
- [`docs/upstream-adaptations.md`](docs/upstream-adaptations.md)
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)

## Requirements

- Letta Code `>=0.28.8`
- Node.js `>=22`
- pnpm `10.33.0` for repository development
- `rtk` for RTK rewriting and savings commands; the RTK mod remains useful for status/diagnostics when it is absent
- GitHub HTTPS credentials when installing this private repository from Git

## Local checkout

```bash
pnpm install
pnpm check
pnpm mods:status
pnpm mods:install
```

The installer validates source/runtime conflicts, backs up the files it migrates, installs this repository as one managed Letta package, installs production dependencies into the managed copy, and removes only the superseded direct/package copies it recognizes.

The highest-registration entries activate asynchronously across zero-delay
macrotask boundaries. Letta awaits async mod factories, so the final registry
and behavior stay the same while its legacy React host no longer receives the
entire private-bundle publish burst in one nested update chain. A generation
aborted during the yield registers nothing.

Let the command finish before running `/reload`, and do not run another Letta package install/update/remove concurrently. The manager serializes its own mutations and preserves unrelated registry entries during rollback, but the Letta CLI itself does not share that lock.

Run this in every active Letta Code session afterward:

```text
/reload
```

After changing a mod in this checkout, reinstall the managed copy with:

```bash
pnpm check
pnpm mods:update
```

### Enable or disable one bundled entry

The managed package stays installed and enabled while individual entries can
no-op before diagnostics or registrations:

```bash
pnpm mods:entry status
pnpm mods:entry disable goal
pnpm mods:entry enable goal
```

Available names are `timestamps`, `herdr`, `goal`, `evidence`, `ux`,
`code-map`, `execution`, `rtk`, `statusline`, and `mcp`. The manager writes only
fixed mode-`0600` sentinels under `~/.letta/mods/`, rejects symlinks and unknown
names, and is idempotent. Run `/reload` after each change. This is local runtime
control; it does not edit `packages.json`, package source, or durable state.
The old `mahiro-mcp-proxy.js.disabled` file is a retained legacy direct source,
not the packaged MCP switch; `mcp` uses `mahiro-mcp-proxy.disabled`.

## Install from Git

After the repository exists on GitHub:

```bash
letta install git:github.com/mahirocoko/mods
```

Then run `/reload`.

Update the Git-managed package with:

```bash
letta mods update git:github.com/mahirocoko/mods
```

The Git installer in Letta Code 0.28.8 installs declared runtime dependencies before copying the managed package.

Do not install the local and Git sources together. To switch this machine from the current checkout-managed package to Git management after the first push:

```bash
pnpm mods:uninstall
letta install git:github.com/mahirocoko/mods
```

Then run `/reload` and use `letta mods update git:github.com/mahirocoko/mods` for later updates.

## Inspect and remove

```bash
pnpm mods:status
pnpm mods:uninstall
```

Uninstall removes the managed bundle only. It deliberately preserves RTK state, MCP config/cache, and other runtime data. Run `/reload` afterward.

For a Git-managed installation, remove the exact source shown by `letta mods list`:

```bash
letta mods remove git:github.com/mahirocoko/mods
```

Then run `/reload`.

## Runtime data

These are examples of runtime-only paths and must not become source files:

- `~/.letta/mods/rtk-control.state.json`
- `~/.letta/mods/mahiro-goal.state.json`
- `~/.letta/mods/mahiro-goal.state.json.lock`
- `~/.letta/mods/mahiro-ux-workflow.state.json`
- `~/.letta/mods/mahiro-ux-workflow.state.json.lock`
- `~/.letta/mcp.json`
- `~/.letta/mcp-proxy/cache.json`
- `~/.letta/mods/diagnostics/`
- `~/.letta/mods/backups/`
- `~/.letta/mods/*.events.ndjson`

RTK state retains at most 20 recent rewrite records containing the raw shell command, rewritten output when present, and working directory. Commands can contain sensitive URLs, paths, or arguments; inspect with `/rtk log` and clear the retained records with `/rtk log clear` when needed.

MCP live calls forward the supplied tool arguments to the configured local process or remote service. Returned content becomes Letta tool output and may enter the conversation transcript. Review the selected server/tool and avoid passing credentials in tool arguments.

MCP configuration precedence remains:

1. `~/.letta/mcp.json`
2. nearest project `.mcp.json`
3. nearest project `.letta/mcp.json`

Later files override matching settings and servers. Do not commit project MCP config unless it is intentionally sanitized and reviewed.

Project-local `settings.liveApproval: "auto"` cannot grant itself trust. It is honored only when the current working directory is inside one of the global `settings.trustedLiveApprovalRoots` entries. A global `settings.liveApproval: "auto"` is a deliberate user-level override for all projects; otherwise live actions ask for approval. A project may explicitly set `liveApproval: "ask"` to tighten the policy.

## Recovery

If a mod prevents normal startup:

```bash
letta --no-mods
# or
LETTA_DISABLE_MODS=1 letta
```

Then inspect `letta mods list`, remove or repair the package, and restart or run `/reload`.

See [`MOD.md`](MOD.md) for agent-facing behavior, [`docs/inventory.md`](docs/inventory.md) for migration provenance, and [`docs/verification.md`](docs/verification.md) for install, rollback, security-policy, and two-reload runtime evidence.
