---
name: "@mahirocoko/letta-mods"
description: "Mahiro's private user timestamps, model profiles, Herdr lifecycle, structured workflow goal, bounded code evidence, UX coordination, Code Map guidance, execution coordination, RTK control, compact statusline, lazy MCP proxy, secret-read and commit attribution guards, and bounded voice bundle for Letta Code."
---

# Mahiro Letta Mods semantics

The eleven switchable entries check their fixed local disable sentinels before reporting
diagnostics or registering commands, tools, permissions, events, or panels.
The three migrated hooks are automatic-only and have no per-entry switches.
`pnpm mods:entry status|disable|enable [entry]` owns those mode-`0600` sentinels
for the eleven switchable entry names. Toggling an entry never edits the managed
package registry or deletes its durable state; active sessions require
`/reload`.

## Package boundary

This package activates fourteen independent mod entry points. Each entry capability-gates its own behavior and returns cleanup for registrations, timers, panels, sockets, and persistent MCP connections.

Installed package files are runtime copies. Edit this repository, validate it, reinstall/update the managed package, and run `/reload` rather than editing files below `~/.letta/mods/packages/`.

## Commit attribution and voice boundaries

`mahiro-commit-attribution-guard` combines a public permission overlay with one bounded `tool_start` transform for Bash/Shell command/cmd inputs. When tool events are available, approval keeps the host's normal policy, then `tool_start` removes only the two exact Letta attribution strings when the string command begins directly with `git commit` and every occurrence is inside an unambiguous literal quoted `-m` / `--message` value (or the corresponding message argument in an argv-like `git`, `commit`, … array). Prefix chains such as `cd … &&` or `git add … &&`, unsupported/ambiguous message shapes, dynamic shell constructs, or another occurrence elsewhere in the shell chain are denied rather than rewritten. The execution-phase overlay inspects final arguments and denies if either string remains, so an absent, failed, or later-overwritten transform fails closed. The original shell tool still executes the complete command with its cwd, environment, suffix chain, Git hooks, signing, result, and existing approval policy; the mod never spawns Git or reports a hidden fallback commit. Without tool-event capability it retains deny-only behavior.

The package declares this entry before `rtk-control` so the attribution transform sees the raw direct commit before optional RTK `tool_start` rewriting. The final-argument matcher also recognizes RTK's exact `rtk git commit` wrapper and denies any forbidden string that survives or is reintroduced. Manifest order is therefore part of the security contract, not cosmetic packaging.

The lexical deny matcher intentionally retains the old gaps (`git -C`, leading whitespace at command start, aliases, external message files) while requiring `commit` to end as a real token. The narrower transform owns only direct `git commit` commands, tracks basic single/double-quoted message spans, and refuses quoted/commented/non-executed or cross-segment false positives. Shell comments, heredocs, `$(`, backticks, arithmetic `((`, and process substitutions are unsupported and remain deny-only because their dynamic data/code boundaries require a full shell parser. Non-commit commands and clean commits are unchanged. The transform preserves the original string/array shape and every argument except the exact forbidden substrings inside the owned literal message value; residual blank lines are harmless and are not normalized into a broader shell rewrite.

`mahiro-finish-voice` registers public `turn_end` and speaks only for `end_turn`. Source inspection confirms TUI, headless, and listener dispatch in newer hosts; the older installed event recipe does not document this event. Registration failure degrades with a warning, not a guessed `llm_end` fallback. Hosts that accept but never emit it remain silent. Installed CLI inspection shows event `ctx.signal` is the mod owner's generation signal, not an automatically aborted turn signal; audio already uses `letta.signal`. Silent injected-runner tests confirm playback survives callback return and a separate turn abort. The TUI emits after Stop hooks and skips the event when a Stop hook blocks; the actual Main/Desktop runtime still needs a public event probe after installation. No live no-sound root cause is yet proven. It is not a workflow-finished guarantee when another handler continues the turn.

Voice uses fixed historical Kanya/rate-300/volume-0.4 cues, one active job per entry, a 3-second cooldown, unique private temporary audio, 10-second subprocess timeouts and a 20-second job deadline. Disposal/abort kills playback and removes temporary audio; there is no persistent voice log. The known subagent process-role marker suppresses finish playback; no public event parent-role field or cross-process deduplication is available. The shared runtime does not relay to Agent Halo or invoke legacy scripts.

All three migrated hooks are automatic-only: no per-entry switches, disable environment overrides, or manual commands. `pnpm check:hooks` is fully silent and synthetic. Installation never removes these hooks automatically; retire only verified replacements and preserve Halo separately.

## Mahiro Secret-Read Guard

`mods/mahiro-secret-read-guard.js` owns one public `permissions.register`
overlay, `mahiro-secret-read-guard`, with no `isEnabled` predicate, model tool,
slash command, argument transform, or approval cache. It evaluates `event.args`
anew in both `approval` and `execution`, including post-transform arguments.
Allowed policy results return `undefined`, never blanket `allow`. Denials do
not include paths, raw commands, helper stderr, or input values.

The entry embeds the existing local Python hook policy to preserve Python
`shlex`, path-name, heredoc, and CCC contracts without a runtime dependency on
the old hook file. Read/ReadFile/read_file and Bash/ShellCommand/shell_command/
exec_command aliases (including dotted tool namespaces) are recognized. Other
tools retain the recursive direct-path fallback. Exact `.env.example`,
`.env.sample`, and `.env.template` files remain a case-normalized early
filename exception, including inside otherwise sensitive directories.
JSON/YAML/YML/TOML/XML/TXT are not blanket denied. Sensitive names include real
`.env` variants, `.npmrc`, `.pypirc`, auth/credentials files, SSH private-key
names and unknown SSH files, identity, key/PEM/P12/PFX suffixes, credentials./
secret./secrets. prefixes, and local-backend provider-directory paths. SSH
config, known_hosts variants, authorized_keys, and `.pub` retain their narrow
exceptions unless another sensitive-name rule applies.

Shell checks retain narrow `ls`/`stat`/`test`/`[`/`find` metadata exceptions,
read-like command detection, `find -exec` reads, environment-dump checks, safe
shell flags, `env` command wrappers, and heredoc-body stripping. The migration
also recognizes shell separators before stripping punctuation, including
unspaced separators, so a preceding metadata command cannot exempt a subsequent
read, and recognizes `[` before punctuation stripping to honor the hook's
explicit metadata allow-list intent. As in the hook, this is an accidental-read heuristic, **not a sandbox**:
symlink targets, arbitrary globs/variables, encoded/interpreter-generated paths,
alias expansion, heredoc substitutions, and arbitrary network/remote-tool reads
are not comprehensively resolved. Developer files can still contain secrets.
No filesystem contents are opened to classify a path.

CCC index/grep/MCP/refresh and recognized indirections keep the existing gate:
resolve the tool workdir/cwd inside Git, reject shell `cd` in gated commands,
require regular non-symlink helper/scanner files and safe optional policy and
allowlist controls, then run synchronized V2 settings `--check`, filename-only
preflight `--check-settings`, and strict receipt `check` with Gitleaks 8.30.1 and
SHA-256 `ba52fb1bfabbcde42f032afad3d6e0b19dff8ed105229a16e7caa338bbc0e84f`.
The existing home-local CCC helper/scanner paths remain authoritative. This mod
does not scan, refresh receipts, fix settings, or index on its own; helper checks
may read their policy/receipt and source-freshness inputs. Helpers suppress all
output; failure, drift, findings, stale receipt, missing scanner, or timeout
blocks. No CCC gate is silently replaced by a filename-only check.

The fixed policy runs via `/usr/bin/python3 -I -c` with tool input on stdin,
never an agent-provided shell command. Requires Python 3.9+. Inputs are capped
at 1 MiB, output at 4 KiB, and total time at 250 seconds (existing CCC stages
retain 5/30/30/180-second limits). Each phase repeats checks; no stale approval
can authorize a later execution. Host-specific permission deadlines may be
shorter and need real-host verification. Nonzero exit, malformed response,
missing interpreter, invalid phase/input/cwd, timeout, or abort returns a generic
deny. Cancellation and cleanup kill the dedicated checker process group,
including active CCC children. Normal cleanup unregisters; engine-aborted
cleanup skips the redundant registry publish. No persistent state is written.

This guard is automatic-only, without a per-entry switch or disable environment override.
Missing permission
capability reports an inactive-guard diagnostic rather than pretending to
protect unsupported hosts. Disabling mods globally, failed loading, or a
surface that never invokes overlays means there is no mod enforcement.

Keep the existing hook dispatched until separately authorized Main/subagent
fixture-runtime coverage and execution/reload checks pass; tests alone do not
prove any live surface coverage. The installer does not modify or disable the
hook. This migration is Letta Code only and intentionally adds no attribution,
RTK, voice, or external-agent policy.

## Mahiro User Timestamps

`mods/mahiro-user-timestamps.ts` registers one `turn_start` transform before
Mahiro Goal. It adds structured local/IANA timestamp metadata plus one visible
`<user_timestamp>` block to real user messages while preserving approvals,
assistant/system items, existing metadata, multimodal non-text parts, and
existing timestamp blocks. Synthetic `<system-reminder>` user items are left
untouched.

The formatter uses the safe `dateStyle: "full"` and `timeStyle: "long"`
combination. Keep one timestamp owner active per user turn.

## Mahiro Herdr Lifecycle

`mods/mahiro-herdr-lifecycle.ts` activates only inside a Herdr-managed pane. It
uses the inherited local socket and pane identity, public Letta event
capabilities, and a bounded local child-process observation. It reports one semantic root state plus bounded child
counts/type metadata to Herdr. Headless Letta subagent processes explicitly
no-op so they cannot replace the parent pane's authority. It never sends
prompts, task descriptions, tool output, or child result bodies.

The same metadata source publishes bounded `mahiro_sidebar_model`,
`mahiro_sidebar_context`, and `mahiro_sidebar_provider` tokens from public model
and context event data. Provider identity comes from an explicit provider field
or the exact provider prefix of the model ID; display text alone never enables
quota attribution. Letta's official `chatgpt-plus-pro` runtime alias and the
`openai-codex` handle/provider normalize to the single `openai-codex` sidebar
token. Letta event contexts may omit provider or effort while retaining the
same model identity; those partial same-model events preserve the last complete
public attribution. A changed model key or explicit provider replaces it, and
conversation reset/close clears it. The companion Mahiro Herdr Sidebar plugin may render these
tokens and use the provider token as a fail-closed Codex account-quota gate, but
this lifecycle mod does not read quota caches or own Herdr sidebar configuration.

`blocked` is reserved for observed question tools. Main or child activity maps
to `working`; a settled pane maps to `idle`, allowing Herdr to own unseen
`done`. Tool boundaries schedule a short bounded spawn-discovery window, and
the process tree remains scanned only during that window or while a known child
is active. This keeps interrupted root LLMs and stale tool events from
sustaining process polling even when the host cannot expose a terminal interrupt
event. An observed user interrupt signal also clears root activity and ends that
grace, but never forgets a known background child; transient process-list
failures retain known children until a successful scan proves they ended. On the
local LLM event path,
`stopReason: "aborted"` also settles root activity;
tool events remain strict so unrelated tool cancellation cannot be misreported
as user intent. Provider errors remain ordinary terminal events. Reports are
change-driven with a bounded heartbeat, monotonic sequence, metadata TTL, local
socket timeout/size limits, and one in-flight plus one latest coalesced report
batch so a slow socket cannot grow an unbounded queue.
Cleanup runs on conversation
close or `/reload`. When Letta aborts the mod generation during reload, cleanup
skips redundant per-handler unregister calls because the host immediately
clears that generation's event registry; this avoids a publish storm through
the host's React external store. Outside Herdr it is a no-op; missing
capabilities or socket failure never alter Letta execution.

## Mahiro Code Evidence

`mods/mahiro-code-evidence.ts` registers `/mh-evidence` plus one namespaced
`mh_code_evidence` model tool with closed `get`, `collect`, and `record` actions.
It runs fixed read-only Git commands through `execFile` and records
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

The agent must record the selected human, repository contract, model, or
procedure as the design owner, together with mode, reference, and summary,
before direction approval or handoff. That brief record is caller attestation,
not proof that its owner/procedure ran or that its visual quality is adequate;
explicit human direction approval remains the authority boundary.
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
Evidence to Goal separately with `mh_update_goal`. Schema-v1
`frontend-design` briefs remain readable as legacy owner labels and are
persisted as schema v2 by the next locked mutation.

## Mahiro Goal

`mods/mahiro-goal.ts` is the Phase 1 workflow foundation. It registers:

- `/mh-goal` for explicit human status/lifecycle/evidence/verification actions
- `/mh-goal-status` for read-only transient status while the main agent is busy;
  it is `runWhenBusy`, transcript-silent, panel-gated, and never sends a prompt
- `mh_get_goal` for model-readable current state and completion issues
- `mh_create_goal` for explicitly approved structured mission creation and
  compatibility revisions
- `mh_update_goal` for revision-guarded mission, Goal Rule, plan, phase, next
  action, evidence, claim, blocker, atomic same-agent movement, and current-plan
  completion mutations
- `mh_clear_goal` for an explicitly requested, runtime-approval-gated,
  revision-guarded clear of the current conversation mission
- one compact `turn_start` reminder while the goal is active

A mission contains one objective, workflow phase, next action, up to eight
bounded stable-ID `must | prefer` operating Rules, a bounded mutable plan,
non-goals, required or optional DoD criteria, agent/human ownership, structured
evidence, blockers, workspace attribution, active-time tracking, revision, and
bounded history. Rules are mission context, not DoD: they are never claimed,
verified, or counted in progress, and `prefer` never blocks completion. Neither
level can override system, safety, permission, repository, or current-human
instructions.

Rules are created through the approved `mh_create_goal` packet or changed one at
a time through revision-guarded `add_rule`, `update_rule`, and `remove_rule`
actions (with equivalent human `/mh-goal rule ...` commands). Rule source is
derived from the mutation actor and cannot be caller-spoofed. Omitting `rules`
from `revise_mission` preserves existing IDs and order; explicit `rules: []`
clears them. Full mission replacement treats omitted Rules as none.

Agent-owned criteria require evidence before the agent may mark them `claimed`.
Human-owned criteria can only become `verified` through `/mh-goal verify`.
Completion of the current plan fails closed while required criteria or open
blockers remain; only the explicit human `/mh-goal complete --force` command
bypasses that audit.
Turn completion, checkpoint reports, Execution Run reports, and Herdr activity
labels are separate from Goal completion. An active Goal may correctly stop at a
checkpoint; Goal status names whether the next owner is the agent or Mahiro.

State is isolated at `~/.letta/mods/mahiro-goal.state.json`, written atomically
with mode `0600`, and guarded by an ownership-checked cross-process mutation
lock. Scope keys combine agent and the one currently owning conversation
identity, plus workspace for raw `default` lanes. `move_goal` and `/mh-goal move`
atomically re-key one Goal into the invoking empty conversation of the same
agent, preserve all mission state and origin workspace, append bounded movement
history, and detach the old conversation. Stale revisions, cross-agent
movement, occupied targets, and default-lane workspace mismatches fail closed.
A non-default destination in another cwd receives the existing workspace warning
instead of silently changing attribution. Corrupt or unsupported state fails
closed rather than being silently reset.

The lock is an owner-token directory removed only by its owner. It is never
auto-reclaimed by age. `/mh-goal unlock --force` atomically quarantines the
directory as the explicit human recovery path after confirming no live mutation
owns it; an old owner cannot remove a successor lock directory.
Completed current plans require an explicit revision before normal mutation, but
the mission itself remains stable and editable in place. Every mission revision
requires the current revision and records history; legacy `replace` remains a
compatibility alias. Legacy token-budget fields are ignored on read; legacy
`budget_limited` goals resume as active goals without quota enforcement, and
pre-Rules Goal records normalize to `rules: []` without an eager state rewrite.

`/mh-goal list` and `/mh-run list` are bounded human-only **remaining-work**
inventories for cross-conversation hygiene. Completed current Goal plans and
terminal handed-off/abandoned Runs are intentionally hidden; their scoped status
and history remain readable. Run list rows show declared Goal refs as
coordination metadata, never live mission validation. Cross-conversation Goal
clear, Run abandon, and terminal Run clear require an exact known ID plus
current revision; Goal inventory and cross-conversation clear remain same-agent
only. These cleanup operations are intentionally not model tools. No stale record is cleared
automatically.

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

`mods/mahiro-execution-run.ts` registers `/mh-run` plus one
`mh_execution_run` model tool with `get`, `create`, and `update` operations. It
is an optional, executor-neutral coordination ledger for complex
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

For new `letta_subagent` lane writes, each session reference must encode both
launch identities as `letta:agent=<agent-id>;conversation=<conversation-id>`.
This prevents raw `default` conversation IDs from colliding across agents while
remaining caller metadata rather than a trusted execution or completion receipt.
Other executor kinds keep their owner-native session reference format; existing
stored records remain readable.

A Direct-CLI v0.1.89 controller may use a background wait to wake the same open
conversation before collecting a finished Herdr job. That terminal wake is
still only lifecycle metadata: the caller must collect and record a bounded
report separately, then gather fresh Code Evidence where required.

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

`mods/statusline.tsx` owns an order-0 panel when `ui.panels` is available. It combines bounded workspace/Git/active-background-subagent/conversation/activity/context/MemFS/RTK/model information and refreshes local Git, memory, reflection, and RTK state every ten seconds. Active background subagents prefer the public lifecycle context on each render. When that context misses a live child in the current CLI process, a discovery-gated one-second fallback observes only descendant Letta `stream-json` processes and derives type from their existing system/tags metadata; process polling stops after the discovery window when no child remains. The segment exposes only a sanitized bounded type, capped count, and capped elapsed time, never the task description or prompt.

The quota layout provides at most two rows: line one is the default status/identity row, and line two is Codex usage when enabled. Disabling Codex removes its row. With Codex disabled, the accepted default statusline still uses one row when it fits and at most one overflow row. Segments are not split internally; lower-priority status overflow is omitted when the Codex row is enabled. Agent/model/backend identity remains cached across sparse contexts. Width measurement and truncation share `Intl.Segmenter` grapheme boundaries, preserving Thai combining sequences and joined emoji rather than counting each code point. The already width-bounded public `row()` result is not rejected by a second incompatible code-point check.

The panel subscribes only to event capabilities exposed by the current host and cleans up its interval, event registrations, timers, and panel on reload. Hosts without panel UI receive a warning diagnostic and no statusline registration.

With both `commands` and `ui.panels`, `/mh-usage [status [page]|close|off|codex on/off|bar|compact]` controls optional quota segments inside this same statusline. The command is busy-safe (`runWhenBusy: true`, `showInTranscript: false`): every branch returns `handled`, never a prompt or transcript output. Passing `agy on` or `agy off` is rejected with syntax help because Mods no longer owns Agy quota collection or presentation. Status and command feedback appear in a separate transient `Mahiro Usage` panel with a Goal Status-style title, representative provider meters, compact state/navigation, sanitized text, and public chalk colors. Repeated invocations replace the panel; it closes after ten seconds or `/mh-usage close`. Status reads only cached state and rendering uses that captured snapshot, without fetching or starting an agent turn. Reload cleanup clears its timer and respects engine-owned aborted panel teardown. Codex defaults off. Safe settings persist under `~/.letta/mods/mahiro-usage/`; no credentials or raw responses are cached. Legacy settings files containing an old `agy` boolean remain safely readable and ignored; future writes persist only `codex` and `style`. Codex owns an independent row and prioritizes its actual primary window. Meters shorten from eight to six/four/two cells before percentage-only fallback; durations remain explicit and windows are never combined. At truly narrow widths, omitted quota content leaves a provider label. Quota segments may still be omitted at narrow widths; `status` shows a five-row maximum summary prioritizing actual Codex windows. `/mh-usage status 1` (then the next page shown in its footer) exposes every cached window, reset, credit field, and freshness detail in three content rows plus title/navigation. Lines are width-bounded before the host truncates them. This five-row budget leaves three rows for the persistent statusline within the installed host's shared eight-row panel cap; other higher-order additive panels can still consume that shared budget. Returning many lines is not evidence that they are visible. `bar` uses a bracketless remaining-capacity meter (`▰` filled, `▱` remainder), with eight cells in the statusline and sixteen in the details panel; `compact` keeps percentages only. Intermediate percentages always retain at least one filled and one empty cell, so 1–99% cannot look fully empty or full. Fresh quota hues are green above 35% remaining, yellow above 15% through 35%, and red at or below 15%. The remainder uses the same hue dimmed through public render-context chalk; no ANSI is stored in data or cache. Before omitting overflowing quota segments, the renderer tries compact quota text while preserving the two-row bound. Absolute token/request limits are not supplied by the supported quota schemas and are not invented.

Codex reads the existing `CODEX_HOME` (default `~/.codex`) login and calls the read-only WHAM usage endpoint. P/S labels use each actual primary/secondary duration, not an assumed 5h/week pair. Optional named `additional_rate_limits` and `code_review_rate_limit` windows are also retained independently. Details show credits and reset-credit counts only when present in the usage envelope, otherwise explicitly unavailable; no separate reset-credit endpoint or currency conversion is used. In v0.10.0, Mods ownership of Agy quota production and presentation was retired because Agy CLI 1.2.2+ no longer exposes the local CSRF contract (`RetrieveUserQuotaSummary` over loopback HTTP); Agy quota presentation now requires an external/Agy-native producer to publish to the public sidebar cache protocol (`~/.letta/mods/mahiro-usage/agy.json`). Mods no longer discovers Agy processes, parses Agy buckets, or writes `agy.json`. No authentication is refreshed and no credentials are touched.

Fetches happen outside render with an eight-second provider deadline, two-minute success cache, five-minute failure backoff, and a disk lock (`codex.lock`) shared across sessions. Failed, old, or reset-expired values are explicitly stale; absent values are unavailable. Codex auth-file metadata changes invalidate its cache. When `HERDR_ENV=1` and the regular bounded Mahiro Herdr Sidebar configuration snapshot exists, the controller keeps the normalized Codex cache warm even if its statusline row is off; presentation still follows the explicit statusline settings. After at least one cache write in that update cycle, it invokes the companion's public bounded refresh action once so honest short metadata TTLs do not disappear during idle panes or long turns. Failure leaves the valid cache intact for the next cache write or pane event. Settings changes propagate to other sessions on the fifteen-second tick. Disposal aborts in-flight work and suppresses late UI/cache writes. The exact bundle registration budget is now 50; this static check is not active-host reload or visual acceptance.

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
