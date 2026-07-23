---
name: "@mahirocoko/letta-mods"
description: "Mahiro's private user timestamps, structured workflow goal, bounded code evidence, UX coordination, Code Map guidance, execution coordination, RTK control, compact statusline, and lazy MCP proxy bundle for Letta Code."
---

# Mahiro Letta Mods semantics

## Package boundary

This package activates nine independent mod entry points. Each entry capability-gates its own behavior and returns cleanup for registrations, timers, panels, and persistent MCP connections.

Installed package files are runtime copies. Edit this repository, validate it, reinstall/update the managed package, and run `/reload` rather than editing files below `~/.letta/mods/packages/`.

## Mahiro User Timestamps

`mods/mahiro-user-timestamps.ts` registers one `turn_start` transform before
Mahiro Goal. It adds structured local/IANA timestamp metadata plus one visible
`<user_timestamp>` block to real user messages while preserving approvals,
assistant/system items, existing metadata, multimodal non-text parts, and
existing timestamp blocks. Synthetic `<system-reminder>` user items are left
untouched.

The formatter uses the safe `dateStyle: "full"` and `timeStyle: "long"`
combination. Keep one timestamp owner active per user turn.

## Mahiro Code Evidence

`mods/mahiro-code-evidence.ts` registers `/mh-evidence` plus three namespaced
model tools. It runs fixed read-only Git commands through `execFile` and records
bounded repository metadata for staged, unstaged, untracked, and
base-to-HEAD lanes. It never executes an agent-supplied command, stores a full
diff/file body, or mutates Git/source state.

External command/test/browser/native/manual proof is recorded as bounded
summaries after existing tools perform the work. Every record is bound to the
current collection and HEAD; recollection makes old records visibly stale.
Multiline/raw-diff-shaped caller payloads are rejected rather than persisted.
The conservative verdicts are `needs_evidence`, `needs_work`, and
`evidence_ready`—never `verified`.

Code Evidence returns a criterion-ready handoff but never reads or writes
Mahiro Goal state. The agent must use `mh_update_goal` to attach selected proof;
Goal remains the only owner of revisioned criteria, human verification,
blockers, and completion.

## Mahiro UX Workflow

`mods/mahiro-ux-workflow.ts` registers `/mh-ux` and three namespaced model
tools. It is a runtime coordinator only: it never researches, browses, scans
files, runs commands, designs, implements product code, or reads/writes Mahiro
Goal or Code Evidence state.

The agent must invoke the canonical `frontend-design` skill and record its brief
object (`skill`, mode, reference, summary) before direction approval or handoff.
That brief record is caller attestation, not proof of skill execution or visual
quality; explicit human direction approval remains the authority boundary.
Stages are frame, discovery, design, direction approval, handoff,
implementation, review, and complete. Model updates are revision guarded and
cannot set human approvals. Direction and `Ready` review approval exist only on
explicit `/mh-ux approve ...` commands; reject/reopen paths remain human-only.
Review is capped at three iterations.

The handoff uses explicit readiness, brief, acceptance criteria, non-goals,
constraints, open questions, protected contracts, target matrix, suggested
checks, and Goal criterion references. Implementation fails closed without an
approved direction, a prototype/implementation-ready handoff, or while any
handoff question is blocking. Completion requires a human-approved `Ready`
review and no blockers, but never changes or completes Goal.

State lives at `~/.letta/mods/mahiro-ux-workflow.state.json`, isolated by
explicit agent/conversation scope and workspace for raw `default` lanes. It
uses mode-`0600` fsynced atomic writes, owner-token locking with explicit human
force-unlock, recursive fail-closed validation, bounded artifacts/history, and
revision-guarded clear/mutations. The agent must attach selected UX and Code
Evidence to Goal separately with `mh_update_goal`.

## Mahiro Goal

`mods/mahiro-goal.ts` is the Phase 1 workflow foundation. It registers:

- `/mh-goal` for explicit human status/lifecycle/evidence/verification actions
- `/mh-goal-status` for read-only transient status while the main agent is busy;
  it is `runWhenBusy`, transcript-silent, panel-gated, and never sends a prompt
- `mh_get_goal` for model-readable current state and completion issues
- `mh_create_goal` for explicitly approved structured goal creation/replacement
- `mh_update_goal` for revision-guarded phase, next action, evidence, claim,
  blocker, and completion mutations
- one compact `turn_start` reminder while the goal is active

A goal contains one objective, workflow phase, next action, non-goals, required
or optional DoD criteria, agent/human ownership, structured evidence, blockers,
workspace attribution, token/time budget, revision, and bounded history.

Agent-owned criteria require evidence before the agent may mark them `claimed`.
Human-owned criteria can only become `verified` through `/mh-goal verify`.
Completion fails closed while required criteria or open blockers remain; only
the explicit human `/mh-goal complete --force` command bypasses that audit.

State is isolated at `~/.letta/mods/mahiro-goal.state.json`, written atomically
with mode `0600`, and guarded by an ownership-checked cross-process mutation
lock. Scope keys combine agent and conversation identity, plus workspace for
raw `default` lanes. Corrupt or unsupported state fails closed rather than
being silently reset.

The lock is an owner-token directory removed only by its owner. It is never
auto-reclaimed by age. `/mh-goal unlock --force` atomically quarantines the
directory as the explicit human recovery path after confirming no live mutation
owns it; an old owner cannot remove a successor lock directory.
Completed goals are immutable; every replacement requires the current revision.
Token budgets count usage observed after goal creation rather than
the conversation's entire prior history.

Evidence/history are bounded but may contain private paths, commands, URLs, and
review notes. Keep credentials and secret values out of goal state and remember
that model-tool output may enter the conversation transcript.

Mahiro Goal owns only its namespaced commands, tools, and state. It never reads
or mutates another workflow mod's state.

## Mahiro Code Map

`mods/mahiro-code-map.ts` registers one stateless, parallel-safe model tool:
`mh_code_map`. It accepts a closed bounded schema and returns no more than 3,000
characters. Semantic intent points to `ccc`; exact intent points to exact
search; outline intent points to an existing external outline/symbol surface or
small targeted reads. The mod itself never reads, scans, parses, indexes, or
generates source structure. An optional target workspace is caller-supplied
metadata only; the mod never resolves or reads it.

Navigation entries and Goal/Code Evidence references are supplied by the caller
and remain metadata, not proof or trusted receipts. Normal reads stay narrowly
bounded; `large_read` must be supplied explicitly with a reason and limits. Its
result is guidance only—not permission enforcement or a security boundary.
Code Map has no persistent state and never mutates files, Git, indexes, Goal,
Code Evidence, or another mod.

## Mahiro Execution Run

`mods/mahiro-execution-run.ts` registers `/mh-run` plus three namespaced model
tools. It is an optional, executor-neutral coordination ledger for complex
main-agent, Letta-subagent, Direct-CLI, human, or other external work. Simple
single-agent edits do not need a run.

One current run is isolated by explicit agent/conversation scope, plus workspace
for raw `default` lanes. The guarded lifecycle is `plan → ready → active →
reported → handed_off`; blockers do not replace stage truth and `abandoned` is
terminal. Every model mutation requires both current run ID and revision.
Terminal replacement requires explicit replacement fields and starts a new
revision-1 run linked to its predecessor.

Goal references may be supplied at creation or repaired through the plan-only
`set_goal_refs` action. `ready` still requires at least one Goal reference;
after that transition the binding is immutable and the final handoff must use
the exact declared set.

Targets declare one writer and zero or more readers. Lexical collision checks
reject duplicate/overlapping writable targets inside the same declared
worktree, while read-only sharing remains allowed. These records are advisory
coordination contracts, not filesystem permissions or symlink/repository truth.

Lane sessions, worktrees, executor kinds, reports, changed paths, checks, Goal/
UX/navigation references, and handoff state are caller attestations. `reported`
means a bounded report was recorded; `handed_off` means the scope owner consumed
the report and can collect fresh Code Evidence. Neither means successful,
verified, accepted, merged, or complete.

The mod never spawns/controls executors, chooses models, submits prompts, reads
or mutates repositories or other workflow state, runs checks, stores raw logs/
prompts/transcripts/diffs, enforces permissions, or completes Goal/UX work.

State is stored at `~/.letta/mods/mahiro-execution-run.state.json` with a size
cap, recursive validation, mode-`0600` fsynced atomic writes, owner-token locks,
explicit human force-unlock, corruption preservation, and bounded history.

## RTK control

`mods/rtk-control.ts` registers `/rtk` and may inspect `tool_start` shell calls.

- Default mode is `off`.
- `suggest` records conservative rewrite opportunities without changing commands.
- `rewrite-safe` rewrites only a conservative read-only allowlist.
- `rewrite-rtk` follows the broader result returned by `rtk rewrite`.
- The mod never installs or changes global settings hooks.
- State is stored at `~/.letta/mods/rtk-control.state.json` and must remain outside source control.
- State retains at most 20 recent records with raw command input, rewritten output when available, and cwd. These may contain sensitive paths, URLs, or arguments; `/rtk log clear` removes the recent records without changing the active mode.

Use `/rtk doctor`, `/rtk log`, and `/rtk rewrite <command>` before enabling broader behavior.

## Compact statusline

`mods/statusline.tsx` owns an order-0 panel when `ui.panels` is available. It combines bounded workspace/Git/conversation/activity/context/MemFS/RTK/model information and refreshes local Git, memory, reflection, and RTK state every ten seconds.

The statusline remains one row when the available width is sufficient. When only the left-side segments overflow, it keeps the agent/model/backend group on the first row and moves a prefix-preserving set of complete left segments to one second row. It never wraps a segment internally and never grows beyond two rows; lower-priority remainder is omitted when both rows are full.

The panel subscribes only to event capabilities exposed by the current host and cleans up its interval, event registrations, timers, and panel on reload. Hosts without panel UI receive a warning diagnostic and no statusline registration.

## Lazy MCP proxy

`mods/mahiro-mcp-proxy.js` exposes:

- `/mcp-proxy` for explicit human operations
- `mcp_proxy` for bounded cached/read-only status, setup, list, tools, search, and describe operations
- `mcp_proxy_live` for reconnect, call, and disconnect operations
- a permission overlay that separates cached reads from live process/network actions

Global config is `~/.letta/mcp.json`; project overrides may use nearest `.mcp.json` or `.letta/mcp.json`. Cache and connection state live under `~/.letta/mcp-proxy/`.

Live actions ask for approval by default. Project config cannot silently trust itself: project `settings.liveApproval: "auto"` is honored only when the current cwd is inside a root listed by global `settings.trustedLiveApprovalRoots`. Global `settings.liveApproval: "auto"` remains an explicit user-level override, while project `liveApproval: "ask"` may tighten it. If the permissions capability is unavailable, the model-callable live tool is not registered. Bearer token values must not be printed or cached.

The proxy supports persistent stdio connections and SDK-backed Streamable HTTP/SSE transports. OAuth, MCP resources, and direct registration of every remote MCP tool remain out of scope.

Live tool arguments are sent to the selected configured process or remote service. Returned content becomes Letta tool output and may be recorded in the conversation transcript; never place credentials directly in tool arguments.

## Safety and recovery

- These mods are trusted local code and run with the user's permissions.
- Keep secrets, state, logs, caches, diagnostics, generated bundles, and backups outside Git.
- Do not import Letta Code internals or bypass capability guards.
- Preserve cleanup symmetry so `/reload` does not leak duplicate registrations or processes.
- Recover with `letta --no-mods` or `LETTA_DISABLE_MODS=1 letta`, then remove or repair the managed package.
