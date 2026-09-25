# Verification

Evidence captured on 2026-07-15 with Letta Code 0.28.8 and pnpm 10.33.0.

> [!NOTE]
> **Historical Supporting Evidence**: This document records historical test evidence and earlier verification milestones. As of v0.10.0, Mods ownership of Agy quota production and presentation has been retired (superseded) because Agy CLI 1.2.2+ no longer exposes the local CSRF contract; active statusline quota production and display are scoped to Codex-only, while Agy quota display requires an external/Agy-native producer publishing to the public sidebar cache protocol (`~/.letta/mods/mahiro-usage/agy.json`). Historical entries below mentioning Agy quota verification remain preserved as historical records.

## Passed

- `pnpm check`
  - root manifest: 3 entries, 9 capabilities
  - all entries transpiled with esbuild
  - all entries exposed a default activation function
  - `/rtk` plus `tool_start` registration passed
  - order-0 statusline panel, all declared event registrations, render, and panel cleanup passed
  - MCP live tool remained unregistered when permissions were unavailable and appeared when the permission overlay was present
- `pnpm pack --dry-run`
  - package contents were limited to `package.json`, `README.md`, `MOD.md`, and the three mod entries
- Isolated local manager test through `LETTA_MODS_ROOT`
  - legacy direct RTK/statusline plus legacy MCP package migrated into one managed bundle
  - installed source hashes matched
  - MCP SDK dependency existed
  - uninstall removed only the bundle
  - real `~/.letta/mods/packages.json` remained unchanged
- Forced dependency-install failure
  - rollback restored recognized legacy paths and registry state
  - an unrelated concurrently-added registry entry was preserved
- Disabled divergent legacy MCP source
  - migration refused before mutation instead of deleting the changed source
- MCP approval-policy fixture
  - untrusted project `liveApproval: "auto"` requested approval
  - a globally trusted project root allowed auto approval
  - project `liveApproval: "ask"` tightened a global auto policy
- Actual local migration
  - `npm:@mahirocoko/letta-mods@0.1.0` is enabled
  - source hashes match the repository
  - MCP SDK is present
  - direct `rtk-control.ts`, direct `statusline.tsx`, and `npm:mahiro-mcp-proxy` are absent
  - Agent Halo source and runtime state were preserved
  - `pnpm mods:status` reports `Migration needed: no`
- Global MCP approval default was restored to `ask` with a timestamped backup, without printing server configuration.

## Foreground reload gate

Passed after two explicit `/reload` cycles:

- Letta generated transpile caches for all three managed entries using hashes that match repository source.
- `mcp_proxy` responded through the reloaded tool registration and reported `Live approval: ask` with all three configured servers.
- Source-level registration smoke confirmed `/rtk`, `tool_start`, the order-0 statusline panel, all declared statusline events, both MCP tools when permissions exist, and cleanup disposers.
- The second reload retained exactly one enabled `npm:@mahirocoko/letta-mods@0.1.0` package with no legacy direct/package entries.
- Mahiro visually confirmed that the custom statusline renders normally as one row after the second reload.
- `~/.letta/mods/diagnostics/latest.json` contained zero diagnostics after both reloads.

The initial local runtime migration is complete. Git commit, private remote creation, and push remain separate explicit actions.

## Mahiro Goal Phase 1 candidate

Global runtime installation is intentionally pending until the candidate passes
independent re-review. Current source/isolated evidence passes:

- manifest contains four exact entries with no capability expansion
- all four entries transpile through the repository esbuild smoke
- `/mh-goal`, panel-gated busy-safe `/mh-goal-status`, three namespaced tools,
  and one `turn_start` event register once
- `/mh-goal-status` uses `runWhenBusy: true`, `showInTranscript: false`, returns
  `handled`, renders the scoped goal in panel `mahiro-goal-status` at order 120,
  and closes its timer/panel during cleanup
- cleanup disposes two commands, three tools, and one event when panel UI exists
- structured creation produces revision-1 state outside the repository
- state files are mode `0600`; invalid JSON, null scoped goals, empty/oversized
  nested values, invalid active-time counters, duplicate IDs, and malformed nested records
  are preserved and reported rather than overwritten
- scope requires concrete identities, separates agents, and separates raw
  `default` lanes by workspace
- mutation locks use owner-token directories, are not auto-reclaimed by age,
  and cannot delete a successor owner after force-unlock quarantine; only
  explicit human unlock recovery removes an abandoned lock
- the focused race regression acquires an old owner, force-quarantines it,
  atomically acquires a tokenized successor, releases the old owner, and proves
  the successor token/directory remain until the successor releases
- stale model revisions and stale replacement revisions are rejected
- reminder injection preserves the original user input
- token budgets are absent from the model schema and human help; legacy persisted
  quota fields are ignored, `budget_limited` normalizes to active, and those
  historic fields can never pause a Goal or its active reminder
- evidence advances revision before an agent criterion can be claimed
- `/mh-goal verify` cannot verify an agent-owned criterion
- agent completion is rejected while a required human gate remains
- `/mh-goal verify` advances the human criterion
- completion succeeds only after agent evidence and human verification
- completed goals are immutable until cleared or explicitly replaced
- official `/goal` names and `goal-mode.state.json` remain untouched
- package dry-run contains `THIRD_PARTY_NOTICES.md` and the full
  `LICENSES/Apache-2.0.txt` text
- an isolated `LETTA_MODS_ROOT` install reported all four source hashes matching,
  `Migration needed: no`, and the expected four registry entries; isolated
  uninstall removed the bundle while preserving the manager's state boundary

Do not record `/reload`, live diagnostics, or foreground dogfood as passed until
those actions actually occur.

### Living Mission follow-up (2026-07-27)

The Phase 1 notes above are historical evidence. The active Goal contract now
supersedes its immutable-completed-goal assertion: one mission keeps its ID and
history while a revision can adjust objective/DoD/boundaries and its bounded
mutable plan. `complete` applies to the current plan only; a later explicit
revision reopens it. The source smoke suite additionally covers stable-ID
revision, plan add/update/remove, revision-guarded agent clear without a
synthetic completed record, legacy state normalization, and engine-aborted
reload cleanup.

### Managed install checkpoint

Global managed installation passed after the pre-install verifier returned
`PASS — VERIFIED WITH CAVEATS` and its final timestamp caveat was closed:

- `pnpm mods:update` installed `npm:@mahirocoko/letta-mods@0.2.0`
- backup: `~/.letta/mods/backups/2026-07-21T04-37-05-093Z-25008`
- `pnpm mods:status` reports all four source hashes matching and
  `Migration needed: no`
- installed `mods/mahiro-goal.ts` SHA-256 equals repository source:
  `7f3316a8373f97c402308961288e22feee0081643e41a365dd99bc9584faad2b`
- installed notice and full Apache-2.0 license files are present
- official `@letta-ai/goal-mode@0.1.0` remains enabled independently
- `mahiro-goal.state.json` and its lock are absent before first use, while the
  existing official `goal-mode.state.json` remains present

`/reload`, live command/tool registration, diagnostics, and foreground dogfood
remain pending and must not be inferred from the filesystem install alone.

### Busy-safe status follow-up

The read-only `/mh-goal-status` follow-up passed focused source and independent
verification, then was installed through `pnpm mods:update`:

- `runWhenBusy: true`, `showInTranscript: false`, handled-only return
- panel-gated registration; commands-only hosts still expose only `/mh-goal`
- repeat invocation closes the previous timer/panel; activation cleanup closes
  the remaining panel and disposes both command registrations
- backup: `~/.letta/mods/backups/2026-07-21T04-52-54-270Z-39049`
- installed/repository Goal source SHA-256:
  `36eb6a071a82a805c62be813349c1f93bce3fb6231694f7c9553a8ddee65c10e`
- all four managed entries match and `Migration needed: no`

A second `/reload` and one foreground invocation while the main agent is busy
remain the only acceptance gate for this follow-up.

## Mahiro User Timestamps candidate

Current failure evidence:

- enabled `npm:@letta-ai/user-timestamps@0.1.0` source hash is
  `21ba4eda9c7374e7f3cdd0b2c00d18e7033ab504174be5d5d72114e030558805`
- it contains `dateStyle`, `timeStyle`, and `timeZoneName` in one Intl options
  object and emits `TypeError: dateStyle and timeStyle may not be used with
  other DateTimeFormat options` on every observed `turn_start`
- canonical upstream commit `c28d70fc490c7e59123e33ae73b064f9c75ddd27`
  removes the incompatible option; its fixed source hash is
  `242a70d7a144ef6acd8a27dd3417bd23192be5981b078a32ec1dbf8b5245e70a`
- npm still exposes only the June 25 `0.1.0` artifact, so ordinary package
  update cannot obtain the July 1 canonical fix

Focused candidate checks cover:

- one capability-gated `turn_start` registration and cleanup disposer
- safe host-locale Intl formatting plus a non-empty IANA zone/fallback
- string and multimodal user content, including image-only input
- approval, assistant, synthetic reminder, null item, and invalid input
  preservation
- existing metadata preservation and duplicate timestamp-block prevention
- returned `{ input }` composition without mutating the incoming array
- timestamp-first plus Mahiro-Goal-second composition: the synthetic reminder
  remains untimestamped while the real user item retains its timestamp
- full Apache attribution/license continuity

Before reload, install the five-entry Mahiro bundle and disable—but do not
remove—the stale official package. Runtime acceptance requires exactly one
enabled timestamp owner, no timestamp diagnostic, one visible block on a normal
user turn, and preserved Mahiro Goal reminder composition.

### Timestamp ownership swap checkpoint

Pre-reload package ownership now passes:

- `pnpm check`: 5 mods, 9 capabilities; timestamp/content/composition smoke pass
- `pnpm mods:update` installed `npm:@mahirocoko/letta-mods@0.3.0`
- backup: `~/.letta/mods/backups/2026-07-21T05-10-24-913Z-52801`
- installed/repository timestamp source SHA-256:
  `0a89f827a81e5be311a54ed2c5af74a86d2cd1aa7f8621692487dc6c233accaf`
- all five managed entries match and `Migration needed: no`
- stale `npm:@letta-ai/user-timestamps@0.1.0` remains installed but is disabled
- `npm:@letta-ai/goal-mode@0.1.0` remains independently enabled

No `/reload` occurred between bundle installation and official-handler disable.
The next reload must generate the timestamp cache, remove the old Intl
diagnostic from new turns, and prove exactly one visible timestamp block.

### Real-turn and mixed-content correction

After the first ownership reload:

- reload diagnostics reported zero errors; the prior official Intl TypeError
  disappeared
- a real task-notification user turn visibly received exactly one timestamp
  block with `timezone: Asia/Bangkok`
- stored message evidence showed slash results and real user text can share one
  user item as separate text parts: `[<system-reminder>, real user text]`
- the first adapted filter skipped that whole mixed item, so source was corrected
  to preserve the reminder part and timestamp only the first real user text part
- focused tests reproduce that exact shape plus synthetic-only, image, duplicate,
  metadata, immutability, and Goal composition cases
- independent focused verifier returned `PASS`

The per-part correction was installed with backup
`~/.letta/mods/backups/2026-07-21T05-36-16-272Z-68539`; installed/repository
timestamp SHA-256 is
`367200f4e1916711e29065ddb33f5c6078c07a39a9860ad2f71920bb566da8e6`.
All five entries match, migration is clean, and the official handler remains
disabled. One final `/reload` plus a mixed slash-result/user-text turn remains.

Final timestamp runtime acceptance passed:

- reload generated `.letta-mod-mahiro-user-timestamps-367200f4e1916711.mjs`
- the real mixed turn rendered the slash `<system-reminder>` unchanged, followed
  by exactly one `<user_timestamp>` block, followed by `reload ละ`
- visible local time used `GMT+7` and `timezone: Asia/Bangkok`
- post-turn diagnostics report `errorCount: 0`; the only warning is the expected
  secondary Agent Halo process forwarding to the already-running primary bridge
- no official user-timestamps Intl error remains

The timestamp ownership swap and mixed-content correction are runtime-accepted.

## Phase 2 Code Evidence candidate

Source contract:

- primary adaptation: `@letta-ai/cruise-code@0.1.0-alpha.1`, commit
  `5acfc823849ab7e5b401ab74f1c6158fdb4da7c6`, source SHA-256
  `90dd87993de9529b02d5d33dcabc85e74f09ea92e7ccfb9fbb829186db52acd3`,
  Apache-2.0
- Plan Mode and Code Outline Enforce are pinned design references only
- explicit Keep / Adapt / Reject and complete license notice live in
  `docs/upstream-adaptations.md` and `THIRD_PARTY_NOTICES.md`

Focused source checks cover:

- one `/mh-evidence` command, three namespaced tools, exact capability gates,
  and symmetric cleanup
- an isolated real Git repository with committed, staged-only, unstaged,
  untracked, and explicit base-to-HEAD changes
- canonical real-path handling for symlinked macOS temporary paths
- control-character escaping for untrusted Git filenames before state or
  transcript exposure
- a hostile repository config proves its external diff helper is executable,
  then collection proves every diff lane suppresses external diff/textconv and
  never runs the helper
- identity-less contexts fail closed instead of sharing an `unknown/default`
  report scope
- current HEAD plus complete staged/unstaged/untracked lane digests are
  rechecked on read; a commit or working-lane change makes proof stale before
  recollection
- two consecutive bounded freshness samples plus pre/post record sampling
  reduce concurrent-repository races; unstable samples fail closed
- mode-`0600` state, no captured file/diff contents, bounded paths/lists/text,
  recursive state validation, and corrupt-state preservation
- ownership-token lock contention and explicit human force-unlock recovery
- conservative `needs_evidence` after Git-only collection
- revision-guarded external test recording and criterion-ready Goal handoff
  without Goal state mutation
- recollection increments revision, makes prior records visibly stale, excludes
  them from verdict/Goal handoff, and requires checks to be rerun
- failed current proof produces `needs_work`; passing current proof produces
  `evidence_ready`, never `verified`
- failed/blocked proof and repository-stale proof are excluded from Goal
  attachment candidates
- caller evidence rejects multiline/raw-diff-shaped content and a rejected
  payload does not advance revision
- lane total/omitted and current record-to-collection/HEAD invariants reject
  semantically corrupt state without overwrite
- base-to-HEAD digest participates in the persisted repository fingerprint
- untracked scopes beyond 512 paths remain explicitly incomplete,
  `needs_evidence`, and unable to accept external proof
- revision-guarded human clear and empty-state behavior

Runtime installation/reload remain pending. Do not record global install,
`/reload`, diagnostics, or live Goal composition as passed until they occur.

Pre-install Phase 2 closure:

- four adversarial verifier rounds found and closed identity fallback, stale
  HEAD/lane proof, failed Goal mappings, semantic state bindings, omitted
  untracked scope, caller raw payloads, record-time repository races, and Git
  textconv/external-diff execution
- final independent verdict: `PASS — VERIFIED`, no High/Medium findings
- `pnpm check`, `git diff --check`, and `pnpm pack --dry-run` pass
- final isolated six-entry install/status/uninstall passes with
  `Migration needed: no`
- candidate source SHA-256:
  `1ce70ebae370ef793d4b0ec30f07c154434931214bf329f62c8ed25105f9731b`

Global install and source-level gates passed; live collection details follow
below. Goal attachment and foreground acceptance remain pending.

### Phase 2 managed install checkpoint

- `pnpm mods:update` installed `npm:@mahirocoko/letta-mods@0.4.0`
- backup: `~/.letta/mods/backups/2026-07-21T07-01-20-326Z-68326`
- all six installed source hashes match and `Migration needed: no`
- stale official user timestamps remains installed but disabled
- official Goal Mode remains independently enabled

The first `/reload` registered the model tools, which exposed the host argument
contract correction documented below.

The first live model-tool call exposed a host-contract mismatch: tool arguments
arrive in `ctx.args`, not a second `run(ctx, args)` parameter. Source and the
focused harness now use one-context host invocation for all three tools. An
independent verifier returned `PASS`; check and pack pass. The corrected bundle
was reinstalled with backup
`~/.letta/mods/backups/2026-07-21T07-06-18-669Z-91876`, and all six hashes match.
Final live Phase 2 runtime evidence:

- reload generated `.letta-mod-mahiro-code-evidence-1ce70ebae370ef79.mjs`
  from the matching installed source hash
- `mh_collect_code_evidence` succeeded against this repository through the real
  model-tool host and returned upstream base/HEAD `ae41bf091311…`
- the truthful dirty split was `0 staged`, `9 unstaged`, `7 untracked`, and
  `0 base-to-HEAD`; no full diff/file body entered persisted state
- state exists at mode `0600`
- post-reload diagnostics report `errorCount: 0`; the only warning is the
  expected secondary Agent Halo bridge forwarding warning
- `mh_record_code_evidence` advanced revisions `1→4`, produced
  `evidence_ready`, and emitted criterion mappings without touching Goal state

This documentation edit intentionally makes that revision-4 repository
snapshot stale. The final dogfood gate is to observe `needs_evidence`, rerun
checks, recollect, record fresh proof, and attach only the fresh mappings to the
active Mahiro Goal.

## Phase 3 UX Workflow candidate

Source provenance:

- `@letta-ai/cruise-ux@0.2.0-alpha.1`
- adaptation-checkpoint source commit `57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`
- pinned source SHA-256
  `40c5964f616c19afa2c632433781086d40b4df1fcd8cbb0f26ca66915eebcac0`
- introduced at commit `5acfc823849ab7e5b401ab74f1c6158fdb4da7c6`
- Apache-2.0 with the complete license retained in `LICENSES/Apache-2.0.txt`

The focused checker proves:

- exact seven-entry package order with UX Workflow immediately after Code
  Evidence; package, validator, manager, and source checker agree
- one capability-gated `/mh-ux` command, exactly three namespaced tools,
  one-context `run(ctx)` / `ctx.args`, reverse cleanup, and fail-closed no-surface
  activation; no turn event or panel
- explicit agent/conversation scope, raw `default` workspace isolation,
  mode-`0600` atomic state, owner-token lock contention, successor-safe release,
  and explicit human `/mh-ux unlock --force`
- stale revisions, recursively malformed nested artifacts, oversized lists/text,
  and corrupt JSON fail closed without overwriting recovery material
- the required explicit design-owner brief bridge and output instructing the
  agent to use `mh_update_goal` separately
- the recorded owner reference is explicitly caller attestation rather than
  proof that its human/repository/model/procedure owner ran or that visual
  quality is adequate
- pre-approval handoff rejection, exact human direction approval, complete
  CruiseCode-compatible handoff fields, blocking-question implementation guard,
  and valid phase transitions
- review verdict validation, bounded findings/evidence/Code Evidence references,
  rejection/revision flow, a maximum of three iterations, `Ready`-only human
  approval, and completion only after approval with no blockers
- source/runtime isolation from Goal and Code Evidence: no internal imports and
  no mutation of either state marker during the full UX flow

Pre-reload Phase 3 closure:

- two adversarial review rounds found and closed the non-provable skill receipt
  claim plus future-artifact/review-counter state inconsistencies
- final independent verdict: `PASS (VERIFIED)`, no High/Medium findings
- `git diff --check`, `pnpm check`, and `pnpm pack --dry-run` pass
- final isolated seven-entry install/status/uninstall passes with
  `Migration needed: no`
- `pnpm mods:update` installed the matching `0.5.0` seven-entry bundle; backup:
  `~/.letta/mods/backups/2026-07-21T07-57-44-974Z-30972`
- UX source SHA-256:
  `628c07d16398a9a0ec6cae59476806ba501f0a08edc8c14714bcc15ce728d86a`

Final live Phase 3 runtime evidence:

- reload generated `.letta-mod-mahiro-ux-workflow-628c07d16398a9a0.mjs`
  from the matching installed source hash
- `mh-ux-mrud6c0z-83e47bd0` ran frame → discovery → three concepts → human
  direction approval → implementation-ready handoff → implementation → Ready
  review → human review approval → UX-only completion at revision 16
- the then-current `frontend-design` brief remained explicit caller attestation;
  Mahiro's direction/review commands remained the authority gates. This is
  historical Phase 3 evidence; schema v2 now records a generic design owner and
  preserves this legacy identifier only through migration.
- Code Evidence reached fresh `evidence_ready` revision 13 and the agent
  attached selected UX/Code Evidence to Mahiro Goal separately
- UX state exists at mode `0600`; diagnostics report `errorCount: 0`, with only
  the expected secondary Agent Halo bridge forwarding warning
- Mahiro accepted the Phase 3 workflow and human-gate boundary through the
  dedicated Goal criterion

Commit, push, release, and Phase 4 remain separate operations.

## Phase 4 Code Map candidate

Source contract:

- `mods/mahiro-code-map.ts` registers one stateless `mh_code_map` model tool
  and no command, event, panel, permission overlay, state file, or subprocess
- semantic intent routes to `ccc`; exact intent routes to exact search; outline
  intent returns bounded external outline guidance and never generates an
  outline inside the mod
- normal read guidance is two files × 6,000 characters; broader guidance
  requires an explicit reason and bounded `large_read` limits
- caller navigation entries are metadata rather than verification evidence;
  Goal/Code Evidence references are caller-supplied metadata rather than trusted
  receipts
- optional target workspace is caller-supplied metadata, allowing cross-repo
  guidance without resolving/reading the path or mislabelling the host cwd
- output is capped at 40 caller entries and 3,000 returned characters
- provenance is pinned to `@letta-ai/code-outline-enforce@0.2.0`, commit
  `492c6c6ea5102dc29e2c8ac24ace62067891b93c`, while its source-reading,
  AST/Ctags/regex, subprocess, permission, and enforcement behavior is rejected

Focused source checks currently prove the exact eight-entry `0.6.0` package
order, tools-only capability gate, one-context `ctx.args` host contract,
parallel-safe stateless registration, cleanup, closed schema, route behavior,
opt-in large-read boundary, caller-metadata disclaimers, worst-case bounded
output, invalid-input refusal, and absence of file/process/permission/event/
command surfaces.

Pre-install source/package evidence:

- `pnpm check` passes with `8 mods, 9 capabilities`
- `git diff --check` and `pnpm pack --dry-run` pass; the allowlisted tarball
  contains all eight mods, package docs/notices, and the complete Apache license
- an isolated `LETTA_MODS_ROOT` install/status/uninstall passes with the MCP SDK
  present, all eight hashes matching, `Migration needed: no`, and runtime-state
  preservation on uninstall
- candidate `mods/mahiro-code-map.ts` SHA-256:
  `007fbb0ec9988a3276b54fc5926576298c48a1f7221bf06fea5a8c84c0df8bd7`

The first independent adversarial review verified the architecture, routing,
side-effect boundaries, package synchronization, output cap, and trust model,
but found that C1 controls plus Unicode line/paragraph separators still passed
the original single-line validator. The corrected validator now rejects C0/C1,
Unicode line/paragraph separators, and bidi override/isolate characters across
queries, target workspace metadata, paths, summaries, hints, reasons, and
references; focused regression cases cover each hostile family, including the
later-added cross-repository workspace field.

The first corrected independent re-review returned `PASS` with no
High/Medium/Low findings.
It re-exercised 32 hostile control-field cases, the 40-entry output bound, the
current source hash, all intent/trust/side-effect boundaries, and the exact
eight-entry package/docs/provenance synchronization.

The first real-host dogfood after reload exercised semantic, exact, outline,
and explicit large-read routes successfully, but caught one cross-repository
attribution flaw before acceptance: the output used the host conversation cwd
even when navigation entries targeted the mods repository. The candidate now
accepts an optional metadata-only `workspace`, labels whether it came from the
host or caller, and still never resolves or reads that path. A follow-up verifier
then found the shared validator was correct but requested direct hostile tests
for the newly added field; explicit C0, C1, Unicode separator, and bidi workspace
regressions were added. The final source-level verifier returned `PASS` with no
remaining findings.

Final managed/runtime evidence:

- `pnpm mods:update` installed the workspace-aware `0.6.0` eight-entry bundle;
  backup: `~/.letta/mods/backups/2026-07-21T09-16-57-825Z-73010`
- post-install `pnpm mods:status` reports the MCP SDK present, all eight entries
  matching, and `Migration needed: no`
- installed package version/entry count is `0.6.0 / 8`; installed and repository
  Code Map hashes both equal
  `007fbb0ec9988a3276b54fc5926576298c48a1f7221bf06fea5a8c84c0df8bd7`
- Mahiro reloaded the active session; the real host exposed the new optional
  `workspace` schema and `mh_code_map` remained agent-callable
- final live calls passed semantic → `ccc`, exact → exact search, and outline →
  bounded external guidance, including targeted-default and explicit 6-file ×
  12,000-character advisory large-read branches
- every final output labelled the mods target as caller-supplied metadata,
  preserved navigation-not-verification and caller-reference boundaries, and
  stated zero reads/scans/indexing/subprocess/outline/mutation side effects
- post-reload diagnostics report `errorCount: 0`; the only warning is the
  expected secondary Agent Halo process forwarding to the primary bridge

Mahiro explicitly accepted the Phase 4 behavior through the human-owned Goal
criterion after the final workspace-aware live dogfood. All implementation,
package, runtime, and human acceptance gates are closed. No commit, push,
release, or Phase 5 is implied.

## Phase 5 Execution Run candidate

Source pattern provenance:

- `@letta-ai/threadkeeper@0.1.0`, commit
  `35461e785330115869de1bc7a777b568f957c8e3`, source SHA-256
  `3b5886629be4c9d204b8d95efd058e15f456268abcc21d39dcff34bc3d739617`
- `@letta-ai/environment-compass@0.1.0`, commit
  `01a3bf35c86c947abc1a374b1c24c89abc28547b`, source SHA-256
  `3ed5504d780b23126741741d7430e3f5fb1ee18cb68537804f91458cbb161077`
- `@letta-ai/tool-guard-inspector@0.1.0`, commit
  `4f580ee3297e9c311b81ff64c39f9aae7ddf8b7a`, source SHA-256
  `7dd30efb6bf7830967e59ff8a896f3d9362699b0c7308f990bdb6db7e4e9c2ce`
- all three are Apache-2.0 and were unchanged at the last retained
  pre-retirement snapshot `57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`;
  upstream later retired and removed their source trees in
  `c9047cf0e5655f7e44dc142f9c898cd8150224dc`

Candidate contract:

- optional coordination only; ordinary simple edits do not require a run
- one revisioned run per explicit agent/conversation scope, plus workspace
  isolation for raw `default` lanes
- executor-neutral lanes for main agents, Letta subagents, Direct CLI, humans,
  and other external executors
- guarded `plan → ready → active → reported → handed_off` flow with blockers
  orthogonal and `abandoned` terminal
- one declared writer and multiple readers per target, with lexical write-path
  collision checks that are coordination metadata rather than enforcement
- bounded session/worktree references, reports, changed paths, checks, and
  cross-workflow refs remain caller attestations, never verification evidence
- Direct-CLI same-conversation wake/session/job references remain lifecycle
  metadata; terminal watcher status cannot advance a lane to reported or stand
  in for a collected bounded report
- final handoff emits a Code Evidence intake packet requiring fresh collection
- no executor control, model selection, prompt submission, source/Git/check
  execution, repository inspection, permission overlay, raw transcript/diff/log
  retention, cross-mod mutation, Goal/UX completion, commit, push, or release

Implemented source/package evidence:

- `mods/mahiro-execution-run.ts` registers `/mh-run` and three namespaced tools
  only; commands-only/tools-only/full hosts and reverse cleanup pass
- the closed schema and runtime gates cover optional main-agent, Letta-subagent,
  and Direct-CLI lanes; required writer ownership, reader overlap, explicit
  cross-repo workspace, blockers, reports, handoff, replacement, and failure
  paths all have focused checks
- state checks cover raw-`default` workspace isolation, mode `0600`, size/type/
  symlink/corruption refusal in place, fsynced atomic writes, owner-token locks,
  successor-safe release, explicit force-unlock, run-ID plus revision guards,
  bounded history/output, no-op refusal, and hostile metadata rejection
- pre-dogfood candidate source SHA-256:
  `03377f00a5e69992e24a8b89f45ecb7b5a27eb58726da4d294b15e04e08d1d47`
- `pnpm check` passes with `9 mods, 9 capabilities`; `git diff --check` and
  `pnpm pack --dry-run` pass, and the allowlisted tarball contains all nine mods,
  package docs/notices, and the complete Apache license
- final isolated install/status/uninstall passes with the MCP SDK present, all
  nine hashes matching, `Migration needed: no`, and unrelated runtime-state
  sentinel preservation

The first independent verifier refuted the candidate on four points: dot-path
aliases bypassed writable collision checks, direct terminal lane-status updates
could dead-end before a matching report, final Goal refs were not bound to the
run declaration, and two docs overstated workspace scoping. The correction
normalizes dot components before collision/coverage checks, requires terminal
outcomes through atomic reports, binds handoff/intake Goal refs exactly, and
states agent/conversation scope plus raw-`default` workspace isolation. Focused
regressions include parent/dot-alias collisions, optional/non-implement/
wrong-worktree writers, read/write overlap, failed/cancelled handoff, and
explicit workspace mismatch. Final independent re-review returned `PASS` with
no High/Medium/Low findings.

The first real-host create call then caught one over-broad privacy guard: it
classified the legitimate suggested check `git diff --check` as raw diff/log
content. The corrected guard permits bounded command names while still
rejecting actual `diff --git` headers, hunks, controls, bidi, reminders, and raw
stdout/stderr/error-shaped payloads; focused regression coverage keeps both
halves of that boundary explicit.

A later continuation dogfood exposed a second recoverability gap before final
acceptance: a caller could omit optional `goal_refs` at creation, but `ready`
required a non-empty binding and the model tool had no plan-stage repair action.
The candidate now exposes revision-guarded `set_goal_refs` only during `plan`.
Focused checks prove the missing binding blocks `ready`, a non-empty repair then
allows `ready`, and any post-`ready` rebinding fails closed. The final handoff
still requires an exact match with the declared Goal references.

The first final independent verifier then found one corrupt-state mismatch not
covered by ordinary mutation paths: top-level handoff Goal refs were bound
exactly, but a syntactically valid persisted `code_evidence_intake.goal_refs`
could differ and still pass state validation. `validateHandoff` now binds both
the handoff and nested intake refs exactly to the run declaration. A direct
persisted-state regression proves the mismatch is rejected in place without
rewriting the recovery material.

Final managed/runtime evidence before Mahiro's human acceptance:

- main-agent run `mh-run-mrurpuoj-f8269d60` reached `handed_off` at revision 10
  with one required `main_agent` writer, a 13-path report, and a bounded Code
  Evidence intake. Its report retained the pre-dogfood source hash and verifier,
  package, isolated-install, and managed-install references as caller metadata,
  not proof.
- Letta-subagent run `mh-run-mrurrwnp-7f7d9382` reached `handed_off` at revision
  10 with one required read-only `letta_subagent` reviewer, no changed paths,
  and a fresh-evidence handoff. The reviewer found no functional blocker and
  explicitly preserved the metadata-not-proof boundary.
- the interrupted earlier Direct CLI scope remained isolated under its original
  conversation rather than merging into another run. The replacement live run
  `mh-run-mrusgtjy-9cf61f98` used Codex CLI `gpt-5.6-luna` at medium reasoning,
  inspected only `docs/workflow-ecosystem.md` and
  `mods/mahiro-execution-run.ts`, reported no changed paths, and returned
  `RESULT: PASS` for optional use, common executor trust/transitions, and no
  executor launch/control.
- the replacement Direct CLI run exercised the new `set_goal_refs` recovery
  action against the reloaded real host, then reached `handed_off` at revision
  11 with a bounded Code Evidence intake and no open blockers.
- the pane was closed after capture and no matching Direct CLI tmux session or
  process remained.
- `pnpm mods:update` installed the final `0.7.0` nine-entry bundle after the
  verifier correction; backup:
  `~/.letta/mods/backups/2026-07-21T15-38-32-130Z-36413`
- post-reload `pnpm mods:status` reports all nine source hashes matching, the
  MCP SDK present, and `Migration needed: no`; final repository and installed
  Execution Run SHA-256 both equal
  `cc3b9dd4781def5554479f8bcf14d3a3ff4e464e61206fb453be1e2aa05b1493`
- current reload diagnostics report `errorCount: 0` and two bounded host/process
  warnings: no-panel statusline registration in a listener and secondary Agent
  Halo bridge forwarding.

The final independent re-verifier returned `PASS` with no High, Medium, or Low
implementation findings after directly re-running package/check/hash/status
evidence against source SHA-256
`cc3b9dd4781def5554479f8bcf14d3a3ff4e464e61206fb453be1e2aa05b1493`.
It separately preserved the caveat that historical lane reports are coordination
metadata rather than proof and that a foreground reload/human acceptance remain
separate runtime gates.

Fresh repository attribution and Goal attachments are collected separately
after the final source correction. Mahiro's human acceptance remains the only
human-owned Goal gate. No commit, push, tag, or release is implied.

### Final duplicate-package cleanup and reload-pressure correction

The final foreground reload exposed a host-level React warning rather than an
Execution Run state failure: `Maximum update depth exceeded`. Source inspection
showed that Letta Code 0.28.13 publishes external-store snapshots while
disposing every registered mod capability, plus the surrounding reload
snapshots. The active v0.7.0 set had 48 registrations; Phase 5 contributed one
command and three tools, pushing the observed reload path to roughly 52 updates
where React begins warning. Execution Run itself registers no panel, event,
timer, or React hook.

Mahiro approved removing the now-redundant official Goal Mode package. He then
explicitly removed both `npm:@letta-ai/goal-mode@0.1.0` and the stale disabled
`npm:@letta-ai/user-timestamps@0.1.0`. The Mahiro bundle, MemFS Search, and Agent
Halo remain installed. After two transition reloads and the final cleanup
reload:

- both official packages are absent from `~/.letta/mods/packages.json` and their
  managed package directories are removed
- `npm:@mahirocoko/letta-mods@0.7.0` remains enabled with all nine hashes
  matching and `Migration needed: no`
- the foreground reduced-set reload completed without the React warning. The
  latest aggregate diagnostics after managed-doc synchronization report
  `errorCount: 0` and two expected listener/process warnings: no-panel
  statusline registration and secondary Agent Halo bridge forwarding
- the reduced-set reload commands completed without another warning being
  reported in this conversation; explicit foreground confirmation remains
  Mahiro-owned, and the first transition reload was allowed to dispose the old
  registry

This is a reversible runtime-ownership cleanup, not removal of upstream
provenance. `THIRD_PARTY_NOTICES.md`, pinned commits, hashes, and adaptation
boundaries remain canonical.

## Adaptive left-wrap statusline — 2026-07-23

The order-0 statusline now returns one row at normal widths and at most two rows
when left-side segments overflow. The right-side agent/model/backend group stays
on the first row; the second row contains only complete left segments in their
original priority order. A segment is never split internally, and any remainder
after the bounded second row is omitted.

Source verification passed through `pnpm check`:

- width 220 renders one string row
- width 64 renders exactly two rows
- the model/reasoning group remains on row one
- row two contains only ordered whole left segments
- order-0 ownership, all event registrations, panel cleanup, and the other eight
  bundle entries continue to pass

The local managed package was updated with backup
`~/.letta/mods/backups/2026-07-23T09-51-50-833Z-69723`. Repository and installed
statusline SHA-256 both equal
`76554433f270c4b8ae3cb6717983993fffdb8b3bb02ae396b913783d969613cd`, and
`pnpm mods:status` reports `Migration needed: no`.

The foreground `/reload` loaded cache
`.letta-mod-statusline-76554433f270c4b8.mjs`; post-reload diagnostics contained
zero records, and all nine managed hashes still matched with
`Migration needed: no`. Mahiro then requested the retrospective and commit.
An explicit narrow-terminal screenshot/visual confirmation was not reported, so
that presentation check remains a follow-up rather than claimed evidence.

## Herdr root lifecycle adapter — 2026-07-24

The tenth managed entry adds no-upstream Letta-to-Herdr observability. It owns
one root pane authority, maps main turn/tool state, observes only descendant
stream-json Letta child processes, and sends bounded count/type metadata plus
PID/start/conversation identity tokens. Headless child processes no-op, task
descriptions/results are never forwarded, process exits are labelled `ended`
rather than fabricated as successful, and close/reload clears metadata before
releasing authority.

Foreground isolation found a real reload regression: normal per-handler cleanup
caused a publish storm through Letta's React external mod store and emitted
`Maximum update depth exceeded`. Cursor Fable 5 High traced the engine-aborted
generation contract; cleanup now skips redundant event unregistrations only
after `letta.signal.aborted`, while normal disposal still reverses all six
registrations. Mahiro confirmed the warning disappeared across the final reload.

Final evidence:

- `pnpm check` passes with 10 entries and a slow-socket smoke proving at most one
  in-flight plus one latest coalesced report batch
- `pnpm mods:status` reports every installed hash matching and no migration
- live Herdr showed `Letta · 1 subagent`, `subagent_types=repo-scout`, then
  `subagents_ended=1` after the child process exited
- final reload diagnostics were `errorCount: 0`, `warningCount: 0`
- the disable sentinel remains available as a reversible isolation switch but
  is absent in the enabled final runtime

This evidence is the release basis for v0.8.0. Final HEAD/origin/tag/GitHub
release alignment must still be checked after publishing.

## Registration-pressure regression — 2026-07-28

Foreground isolation disabled only `npm:@mahirocoko/letta-mods@0.8.4` while
leaving Agent Halo, MemFS Search, and Raindrop enabled. Two reloads emitted no
new captured `Maximum update depth exceeded` warning, proving the active private
bundle—not Agent Halo—was the threshold owner. The bundle had grown from 41
registrations at v0.8.0 to 43 at current HEAD: one bounded Herdr `llm_end`
interrupt observer and one approval-gated `mh_clear_goal` tool. Both features
remain necessary.

Code Evidence therefore preserves every operation while consolidating its
three model tools into one `mh_code_evidence` action tool (`get`, `collect`,
`record`). This first reduction returned the package to 41 registrations
without deleting the human `/mh-evidence` command or weakening Goal/Herdr
contracts, but foreground reloads still crossed the full-ecosystem boundary.
Earlier Phase 2 evidence in this document keeps the three original tool names
as historical runtime provenance; those names are superseded by the unified
action tool for current installs.

The follow-up isolation control adds a repo-local `pnpm mods:entry` manager for
all ten entries. Each source checks its own fixed mode-`0600` sentinel before
diagnostics or registrations; package registry metadata and durable state stay
untouched. The manager is idempotent, rejects unknown names and symlink
sentinels, and requires `/reload`. Source smoke now proves every disabled entry
produces zero registrations before enforcing the current enabled
39-registration budget. Foreground acceptance remains a separate gate.

Foreground isolation then established a warning-free baseline only after
Herdr Lifecycle, Execution Run, and Statusline were disabled together. This is
registration-pressure evidence, not proof that any one entry contains a React
loop: the fully enabled private bundle had 41 registrations and the active
Agent Halo/Raindrop/MemFS set added 12, for 53 total, while the historical
warning boundary appeared at 52. Execution Run therefore preserves `/mh-run`
and every get/create/update operation while consolidating its three model tools
into one `mh_execution_run` operation tool. The executable package budget is
now 39 and the same active ecosystem totals 51. Full-entry foreground reload
acceptance remains required before removing the temporary tracer.

The first full-entry foreground check at 39 still produced two fresh warnings,
refuting a final-cardinality-only fix. Exact runtime stacks showed a finite
`onChange → publish → useSyncExternalStore → forceStoreRerender` burst in Ink's
legacy React mode. Letta awaits async mod factories, so Herdr, Goal, UX
Workflow, and Statusline now defer their registration groups across zero-delay
macrotask boundaries and recheck the generation abort signal before registering.
Source smoke proves those entries register nothing synchronously, cross an
actual macrotask (not only a microtask), and register nothing when aborted
during the wait. This cadence mitigation still requires foreground repeated
reload acceptance before the tracer can be removed.

Foreground acceptance passed on the active NVM Letta Code `0.29.8` runtime:

- installed backup: `~/.letta/mods/backups/2026-07-28T06-17-59-906Z-78600`
- all ten private-bundle entries reported enabled
- every installed entry hash matched repository source
- three consecutive `/reload` commands completed successfully
- the fresh `/tmp/letta-mod-reload-depth.log` remained exactly zero bytes and
  zero records across all three reloads
- Mahiro confirmed the visible warning was gone

The temporary `00-reload-depth-trace.mjs` diagnostic was removed only after
that foreground confirmation. Agent Halo remained on its original source and
installed hash; no upstream Letta or Agent Halo patch is part of this fix.

This accepted state is the release basis for v0.8.5. Final local HEAD,
`origin/main`, annotated tag, and GitHub release alignment must be checked after
publishing.

## Theme-aware grouped Mahiro Goal status — 2026-08-01

Mahiro Goal keeps its existing state, lifecycle, revision, evidence, blocker,
human-gate, and command/tool contracts while making both human status surfaces
easier to scan. `/mh-goal status` now groups Mission, Current, Progress,
Definition of Done, Plan, Blockers, and Details. It uses Letta's host-rendered
Markdown headings and emphasis rather than embedding ANSI escape sequences in
command output. The busy-safe `/mh-goal-status` panel uses only the public
`render(ctx).chalk` surface for semantic color: purple sections, teal active,
amber waiting/paused, pink-red blocked, and green complete/no-open-blocker states.
Rendering still falls back to readable uncolored text when `chalk` is absent.
Every free-text and identifier state value rendered by the status surfaces is
flattened before Markdown composition through Node's VT-control stripping plus
a complete C0/C1 filter, including stored tabs and line breaks. Schema-bound
enums and numeric values are rendered through the same display boundary.
Formatter-owned Markdown newlines remain intact, while old or supplied text
cannot inject terminal controls or new Markdown blocks into either status
surface.

Focused smoke coverage proves grouped detailed output, the empty-goal themed
heading, compact panel groups, semantic color selection, stripping of stored
ANSI/control payloads, panel gating, cleanup, and the prior Goal
state/human-gate contracts.
Final release evidence:

- Letta Code 0.30.0 public Markdown and panel render contracts were inspected
- `pnpm check` passed for all ten entries
- `pnpm pack --dry-run` passed with the expected package allowlist
- repository and installed `mahiro-goal.ts` SHA-256 matched
- `pnpm mods:status` reported every installed entry matching and
  `Migration needed: no`
- Mahiro explicitly approved publishing this presentation update

This is the release basis for v0.8.6. A `/reload` remains required in every
already-running Letta Code session after installation. Final local HEAD,
`origin/main`, annotated tag, GitHub release, and installed version alignment
must be checked after publishing.

## Semantic Mahiro Goal status tokens — 2026-08-03

The detailed `/mh-goal status` output now separates scan roles without
reintroducing raw ANSI. Stable labels and identifiers use Letta's inline
Markdown accent; status and progress keep explicit text plus redundant semantic
markers. Criterion rows distinguish Agent/Human ownership, Required/Optional
gates, lifecycle status, and evidence counts with separate markers rather than
coloring the whole metadata row as one undifferentiated accent span.

Long free-text values such as Next, criterion descriptions, plan text, notes,
and blocker summaries remain plain. This fixes the foreground-reported terminal
artifact where a long inline-code Next value wrapped with an apparent color
break and poor continuation hierarchy. Required blocked criteria now make the
DoD summary red consistently with the blocked State and criterion row. Color is
never the only signal: explicit labels, status copy, symbols, and indentation
remain present.

Focused smoke coverage proves Current and Progress token output, pending/empty
states, claimed and human-verified criteria, completed plans, and consistent
blocked State/DoD/criterion markers. Existing hostile-state ANSI/C0/C1
flattening and no-raw-ANSI assertions remain active; a stored backtick fixture
also proves accented identifiers cannot break their Markdown span. Final
release evidence:

- Mahiro inspected the foreground Letta CLI output, identified the color and
  wrap issues, and explicitly approved publishing the corrected direction
- a foreground Agy lane visibly confirmed Gemini 3.6 Flash (High), reviewed the
  current diff read-only, and endorsed accenting only stable labels/IDs while
  keeping long values plain
- `pnpm check` passed for all ten entries
- `pnpm pack --dry-run` passed with the expected package allowlist
- repository and installed `mahiro-goal.ts` SHA-256 matched
- `pnpm mods:status` reported every installed entry matching and
  `Migration needed: no`

This is the release basis for v0.8.7. A `/reload` remains required in every
already-running Letta Code session after installation. Final local HEAD,
`origin/main`, annotated tag, GitHub release, and installed version alignment
must be checked after publishing.

## Goal Rules and cross-conversation Move/Resume — 2026-08-09

Mahiro approved one combined Goal change: bounded temporary operating Rules plus
single-owner continuation into another conversation. Each Goal stores at most
eight stable-ID Rules of at most 500 characters. `must` is active mission
context and `prefer` is a non-blocking default; neither level overrides
higher-priority instructions or participates in DoD claim/verification/progress.
Rule source is derived from the mutation actor. `revise_mission` preserves
omitted Rules, explicit `rules: []` clears them, and full replacement without
Rules starts empty. Legacy records normalize a missing collection to `rules: []`
without an eager write.

`move_goal` and `/mh-goal move` reuse the existing tool/command registrations.
Under the state lock they locate one exact Goal ID/revision, require the same
agent and an empty destination, preserve lifecycle plus all nested mission
state, retain origin-workspace attribution, advance the revision once, validate
the destination key, then delete the source and insert the destination in one
atomic state write. The old conversation loses reminder/status/mutation
ownership immediately. Non-default cwd differences produce the existing
workspace warning; raw `default` lanes require the exact workspace key.

Current source/static evidence:

- `pnpm check` passed all ten-entry transpilation, registration-budget, state,
  migration, rule lifecycle, hostile rendering/reminder, movement, rejection,
  human-gate, and cleanup smoke checks
- `pnpm pack --dry-run` passed and included the changed Goal source plus shipped
  README/MOD/Thai usage contracts
- `git diff --check` passed
- an independent read-only verifier returned PASS / Verified with Caveats for
  source/static and local package evidence, finding no high or medium defects
- the exact 39-registration bundle budget remains unchanged because Rules and
  movement extend `mh_update_goal` and `/mh-goal` instead of adding registrations
- `pnpm mods:update` installed the local checkout with backup
  `~/.letta/mods/backups/2026-08-09T16-25-43-644Z-49859`
- `pnpm mods:status` reported all ten entries matching and
  `Migration needed: no`; repository and installed Goal SHA-256 both equal
  `a23f60293ed174150f42adff276295ccc999a28112532637b2116ecec3551fd7`
- Mahiro ran `/reload` successfully; the reloaded `mh_get_goal` returned the
  legacy live Goal with normalized `rules: []`, then two revision-guarded
  `add_rule` calls persisted one `must` and one `prefer` Rule at revisions 13
  and 14 with stable IDs and agent source

Final runtime and human evidence:

- Goal `mh-goal-mslzs56h-92607c17` moved from `local-conv-312` into the empty
  `local-conv-314` at expected revision 14; the atomic move advanced it once to
  revision 15 while preserving the existing workspace and both stable-ID Rules
- a fresh `mh_get_goal`, the destination turn reminder, and `/mh-goal status`
  showed the same one `must` plus one `prefer` Rule, the original criteria and
  evidence, the destination conversation ID, and ordinary revision progress
- Mahiro explicitly accepted the live cross-conversation result and verified
  human-owned `criterion-05`; all five required Goal criteria then satisfied the
  completion audit
- Mahiro completed the current plan through `/mh-goal complete`; the Goal
  reached `complete` at revision 19 while retaining Rules and evidence for
  inspection or a later explicit mission revision

This is the release basis for v0.8.8. A `/reload` remains required in every
already-running Letta Code session after installation. Final local HEAD,
`origin/main`, annotated tag, GitHub release, package version, all-ten-entry
managed status, and installed Goal hash alignment must be checked after
publishing.

## v0.8.9 design-owner and skill-contract alignment

Release scope:

- UX Workflow schema v2 replaces the removed hard-coded `frontend-design`
  requirement with an explicit human/repository/model/procedure design owner.
- Schema-v1 runtime records migrate losslessly in memory and persist as v2 only
  on the next locked mutation; read-only status calls leave the original state
  file untouched.
- Direct-CLI v0.1.89 same-conversation terminal wakes remain controller-owned
  lifecycle metadata, not Execution Run reports, Code Evidence, or completion.
- Active docs, notices, tool descriptions, schemas, tests, and historical
  provenance agree on the current owner boundary.

Release evidence:

- `pnpm check` passed all ten mod entries, including schema-v1 read/persist
  migration fixtures, human gates, Goal separation, and cleanup.
- A disposable copy of the real 19-run UX state loaded as schema v2 with all 11
  briefs and two handoffs preserved while the disk copy remained schema v1.
- `pnpm pack --dry-run` and `git diff --check` passed.
- The bounded context scanner found zero retired active invocation instructions
  across 22 files / 684,331 bytes.
- Fresh independent verification found no High/Medium issue.
- Managed local installation matched every source hash; after `/reload`, live
  `mh_get_ux_workflow` returned the schema-v2 design-owner boundary while the
  legacy state remained unchanged by the read-only call.

This is the release basis for v0.8.9. A `/reload` remains required in every
already-running Letta Code session after installation.

## v0.8.10 upstream retirement provenance alignment

Evidence captured on 2026-08-25 with Letta Code 0.30.31 and pnpm 10.33.0.

Upstream ownership changed after the private adaptations were pinned:

- official `letta-ai/mods` main is `4c249a9609c4d17de74bf7ef229510915b473d55`
- `c9047cf0e5655f7e44dc142f9c898cd8150224dc` creates the official/retired
  catalog boundary and removes the retired package source trees
- CruiseCode, CruiseUX, Code Outline Enforce, Threadkeeper, Environment
  Compass, and Tool Guard Inspector are retired historical references
- Goal Mode and User Timestamps remain separate official packages
- all pinned source commits, file hashes, authors, and Apache-2.0 receipts stay
  intact; only volatile current-ownership wording changes

Release verification:

- frozen `pnpm install` completed with the lockfile unchanged
- the bounded context-contract scan covered all four provenance surfaces with
  zero stale-current findings, warnings, skipped files, or truncated output
- `pnpm check` passed the ten-entry/9-capability manifest, entry-manager,
  transpile, registration, state, human-gate, and cleanup checks
- the provenance regression requires every paragraph containing the target
  pre-retirement snapshot ID to use an explicit historical marker and contain
  no live-ownership claim; fixtures cover owner-before-ID, ID-before-owner,
  and `remains current` sentence shapes
- `pnpm pack --dry-run` included only the expected private package allowlist at
  version 0.8.10
- `git diff --check` passed
- fresh independent verification resolved the exact retirement commit,
  confirmed its ancestry and all six retired package removals, recomputed all
  eight pinned source hashes, and found no concrete defect
- `pnpm mods:update` installed `npm:@mahirocoko/letta-mods@0.8.10`; all ten
  installed mod hashes match repository source and migration is not needed
- official `@letta-ai/memfs-search@0.1.1` remains enabled separately

No private mod source, manifest entry/capability, state schema, or runtime
behavior changed in this release. Every active Letta Code process still needs
`/reload` after the managed package updates.

## v0.8.11 active background-subagent statusline

Evidence captured on 2026-08-28 with Letta Code 0.31.5 and pnpm 10.33.0.

Release scope:

- the order-0 statusline reads the public subagent lifecycle context and keeps
  `pending`/`running` background subagents visible after the parent turn settles
- the compact segment exposes only sanitized type, capped remaining count, and
  capped elapsed time; task descriptions and prompts never enter the panel
- foreground and completed subagents remain excluded
- malformed lifecycle getters/items, control characters, Unicode line
  separators, extreme elapsed values, and large counts fail closed or remain
  bounded inside the existing maximum-two-row layout contract
- Bash and Monitor background tasks remain intentionally outside this release
  and continue to use `/bg`
- the `letta-ai/letta-code` checkout was pulled and inspected as read-only
  upstream evidence; no Letta Code core source was modified

Release verification:

- `pnpm check` passed all ten entries and nine capabilities, including the
  statusline's normal, hostile-value, lifecycle-failure, narrow-layout, and
  right-side model-retention assertions
- `git diff --check` passed
- fresh independent verification returned PASS after directly probing control
  and Unicode separators, throwing lifecycle getters, bounded type/count/time,
  active-background filtering, and width-64 two-row rendering
- `pnpm mods:update` installed `npm:@mahirocoko/letta-mods@0.8.11`; all ten
  installed mod hashes match repository source and migration is not needed

Every already-running Letta Code session must run `/reload` before the new
indicator can receive live lifecycle state. A live post-parent-turn panel check
remains a runtime observation after reload, not a pre-release static claim.

## Post-v0.8.11 background-subagent lifecycle fallback correction

Evidence captured across 2026-08-28–29 with Letta Code 0.31.5.

The first live post-release probe disproved the static lifecycle assumption:

- background `task_2` remained `running` and its descendant Letta
  `stream-json` process was present under the current CLI process
- `/bg` correctly showed background shell process state, confirming that it is
  a separate shell-only surface rather than a subagent inventory
- the order-0 statusline rendered normally, but public
  `context.subagents.list()` did not surface the live child and no background
  segment appeared

The candidate correction preserves public lifecycle data as the primary owner
and adds a discovery-gated local fallback only when that data has no active
background child. The fallback:

- walks descendants of the current Letta process only
- accepts direct `letta`/`letta.js` executables or `bun`/`node` executing those
  exact script basenames with `stream-json` output
- requires existing `--system` or `type:` tag metadata and rejects unrelated
  process trees plus shell payloads that merely mention spoofed Letta flags
- polls once per second only during a ten-second discovery window or while a
  matched child remains, then stops when idle
- retains the existing sanitized/capped type, count, elapsed, cleanup, and
  maximum-two-row rendering contracts

Verification:

- `pnpm check` and `git diff --check` passed
- the focused parser fixture covers descendant inclusion, unrelated-tree
  exclusion, descendant-command exclusion, and a shell payload containing
  spoofed Letta system/tag/output flags
- fresh independent verification returned PASS after the executable-aware
  filter correction
- `pnpm mods:update` installed the candidate with all ten source hashes
  matching and no migration needed
- Mahiro ran `/reload`, background `task_5` continued after the parent turn
  settled, and Mahiro directly confirmed the footer displayed the live
  `agent general-purpose` fallback segment
- no Letta Code core source was modified

This live result closes the runtime observation gap left by v0.8.11 and is the
release basis for the next patch version. Commit, tag, push, and release remain
separate explicit operations.

## v0.8.12 process-fallback release evidence

Release-preparation evidence captured on 2026-08-29:

- package and checker version contracts are `0.8.12`
- `pnpm install --frozen-lockfile` completed with the lockfile unchanged
- `pnpm check` passed all ten entries and nine capabilities
- `git diff --check` passed
- `pnpm pack --dry-run --json` completed through the prepack gate and produced
  `mahirocoko-letta-mods-0.8.12.tgz` with the expected 16-file allowlist:
  package docs/notices/licenses, ten mod entries, and `package.json`
- the managed `npm:@mahirocoko/letta-mods` bundle was updated from the local
  checkout with backup
  `/Users/mahiro/.letta/mods/backups/2026-08-29T02-32-13-251Z-45925`
- `pnpm mods:status` reports all ten installed source hashes matching, the MCP
  runtime dependency present, no recognized legacy direct/package copies, and
  no migration needed
- fresh independent review returned PASS after executable-aware filtering;
  focused regressions reject unrelated trees and shell payloads that merely
  mention spoofed Letta flags
- Mahiro directly confirmed the live segment after `/reload`; concurrent
  natural-completion probes exercised multiple-child display, one remaining
  child, and final disappearance

Every already-running Letta session still requires `/reload` after the managed
package update. Final commit, origin, annotated tag, and GitHub Release alignment
are verified only after publication.

## Provider quota statusline correction — 2026-09-09

Owner: `mods/statusline.tsx` in this checkout; Agent Halo native provider code
was read-only schema evidence. No Letta core changes, auth refresh, Agy spawn,
reset-credit operation, commit, or push belongs to this change.

Live safe probes established Codex WHAM primary-window duration (weekly on
this account), Agy's four independent buckets, and Agy's string `window`
metadata (`5h`/`weekly`) before implementation. Both implemented adapters then
returned normalized live windows without credential or raw-response output.
Optional Codex additional limits, code review, credits, and reset-credit counts
follow the existing native envelope schema; their full combinations are fixture
verified, not claimed to have appeared in this account's live response.

The initial candidate omitted optional Codex surfaces and unknown Agy buckets,
used ASCII bars, and lacked width-sensitive compact fallback. Main rejected
that candidate. The correction retains independently named additional/review
windows; renders credits/reset credits only from the usage envelope (otherwise
unavailable); preserves sanitized unknown Agy identities and explicit windows;
uses five `▰▱` segments; and tries compact quota text before dropping overflow.
There is no inferred aggregate or invented absolute limit/currency conversion.

Focused regressions cover these exact corrected shapes, cached complete status,
source reset timestamps/unavailable resets, remaining zero/full values, unknown
bucket sanitization, two-row layout and compact rescue, persisted-off no-fetch
behavior across controllers, shared cache/locks, failure backoff, corrupt and
symlink settings, and normal/engine-aborted cleanup without late publication.
The exact static registration budget is 40, not proof of live React acceptance.

Verification closeout passed: `pnpm check`, `pnpm pack --dry-run`, and
`git diff --check`. The owning `pnpm mods:update` completed; `pnpm mods:status`
reported all ten source entries matching and no migration needed. Historical
window-correction checkpoint source/installed SHA-256 (superseded below):
`ac2bf8659d40c40f9e14a7c07cdf7ae2ebd30582b56e8c767d24997f9da99ae5`.
Remaining boundaries: providers default off; quotas can still be omitted when
both rows are full (status keeps details); Agy requires an existing HTTP LS and
its account identity is TTL-based; more than 64 windows fails unavailable;
absolute token/request limits and absent envelope credit fields stay unavailable.
The user's earlier reload does not establish that this corrected generation is
active. Another reload and human visual acceptance remain pending.

### Busy-safe Usage Status follow-up — 2026-09-09

The user reported that the command was disabled while the agent worked.
The existing `mh-goal-status` implementation supplied the public API pattern:
commands plus panels capability gate, `runWhenBusy: true`, no transcript output,
`handled` responses, a transient order-120 panel, public chalk, sanitized fields,
replacement on repeat, and ten-second close. `/mh-usage` now follows that pattern
for status, toggles, help, and errors; `/mh-usage close` also dismisses it.
Status captures cached data only, without a provider fetch or agent turn.
The two-row persistent statusline and registration cadence are unchanged.

Direct regressions cover busy metadata, every handled branch, cached panel
anatomy, repeat/explicit/timed close, public coloring and control-character
sanitization, missing capabilities, state/host errors, and normal versus
engine-aborted cleanup. Existing no-fetch-when-off and quota regressions pass.
`pnpm check`, `pnpm pack --dry-run`, and `git diff --check` passed; the owning
managed update completed and all ten installed source hashes matched. Historical
busy-safe checkpoint source/installed statusline SHA-256 (paint superseded below):
`a92b36c2082e44c0ad4fa426cba0f1a1ff881d308db39c7a03367c2893bb0da2`.
No commit, core change, new tool, permission change, or auth expansion was made.
The prior user reload predates this update: active-host and visual acceptance
remain unclaimed until the user reloads and checks the busy command.

### Continuous block paint — 2026-09-09

User-approved rendering-only follow-up replaces the earlier segmented glyphs
with eight-cell statusline and sixteen-cell detail bars using `█` / `░`.
The same remaining percentage and green/yellow/red threshold hue apply; only
the remainder is dimmed through public chalk during render, with no stored ANSI.
The two-row geometry, compact-before-omit behavior, and busy-safe command remain.
Direct regressions cover zero/full/intermediate values, both bar widths, same-hue
dim calls, threshold colors, plain data, and narrow compact rescue. Full
`pnpm check`, pack dry-run, and whitespace checks passed. Managed update and
status reported all ten entries matching, no migration needed. Historical paint
checkpoint source/installed SHA-256 (fair allocation supersedes it below):
`bc289dc26f4f0ce26294532051abe95e39b20987b7ef1360cec38a53e008f3cd`.
User reload and visual acceptance remain pending. No core/auth/permission change
or commit/push was made.

### Fair dual-provider allocation — 2026-09-09

Both-enabled status now reserves row two for representative actual Codex,
Agy Gemini, and Agy Claude-GPT windows, before alternating optional extras.
All representatives use the same block paint and symmetric 8/6/4/2-cell fallback;
percent-only is the final fallback. Durations remain explicit, and details retain
all independent windows. Primary status/identity order stays on row one, but its
lower-priority overflow may be omitted to make room for the reserved quota row.

Realistic fixture regressions (primary Codex weekly plus optional limits and
four Agy windows) prove all three families with four-cell bars at width 80 and
eight-cell bars at widths 120/160. Width 40 retains both providers compactly;
width 20 may show only Codex. All tested widths remain within two rows, and
workspace/model identity survives at the normal widths. Existing busy-panel,
privacy, remaining-percentage, and cleanup checks also pass.
`pnpm check`, pack dry-run, and whitespace checks passed; managed update/status
reported all ten entries matching with no migration needed. Historical two-row
allocation checkpoint source/installed SHA-256 (superseded below):
`663059aefe22265186bd912586b73097ace86c7b882439f06a57c6f5c3b351ca`.
No provider/auth/core changes or commit/push. Reload and human visual acceptance
remain pending; fixture widths do not establish the user's exact terminal view.

### Superseding contract: provider rows, Thai width, visible panel pages — 2026-09-09

The user screenshot disproved the earlier Usage Status completeness claim:
returning many panel lines did not make them visible. Read-only inspection of
the actual installed NVM Letta bundle's `ModPanelRow.tsx` section showed
`flatMap(renderModPanelLines).slice(0, MAX_MOD_PANEL_LINES)` with a shared cap of
8, and each row truncated to `terminalWidth - 1`. Its public `row()` measures
with grapheme-based `string-width` and pads the first row to full width.
The previous local code-point measurement counted Thai combining marks twice,
then rejected that correctly padded row and fell back without provider rows.
The independent reproducer is 17 code points but 16 terminal/grapheme cells for
`อยากให้ pull mods`. No core source or installed core file was edited.

The user explicitly superseded the old two-row limit: default statusline first,
Codex second, Agy third. A disabled provider removes only its own row; both off
retain the accepted default one/two-row behavior. Each provider shortens bars
independently before compact fallback. Actual window labels/durations remain
separate; optional windows may be omitted on a narrow provider row, not moved
onto the other provider. Grapheme-aware measuring, truncation, and short labels
preserve Thai marks and joined emoji. The padded public row is no longer
rejected by a second incompatible count.

Usage Status now returns at most five rows (title, three representative windows,
navigation), leaving three rows for the statusline inside the shared cap.
`/mh-usage status 1` and subsequent numbered pages expose all cached windows,
resets, credits, and freshness in three width-bounded content rows plus title
and navigation. Host-cap regressions apply the actual first-eight-rows slice,
not an assertion on an arbitrarily long returned array. Higher-order unrelated
additive panels can still consume this shared budget. Narrow summary widths may
shorten bars or clip labels; numbered details wrap content across pages.

Direct regressions use an independent grapheme-width/padded-row fixture with
Thai conversation and agent names at available widths 80/120/160; they assert
three rows, retained identity, Codex/Agy row separation, disabled-row removal,
and independent narrowing at width 40. The previously retained two-row tests
apply only to the disabled/default layout, not acceptance of this new contract.

Exact plain fixtures (public chalk adds threshold hue and dim remainder only):

Available width 80:
```text
📁 mods · 🌿 main ✓ · 💬 อยากให้ pull…         ผู้ช่วยมาฮิโระ · [GPT-5.6 Sol r:xhigh]
Codex P:7d [████░░░░] 56% · Spark P:5h [██████░░] 80%
Agy Gemini:5h [██████░░] 81% · Claude-GPT:5h [████████] 100%
```

Available width 120:
```text
📁 mods · 🌿 main ✓ · 💬 อยากให้ pull… · ctx 42% · ✏️ accept-edits                     ผู้ช่วยมาฮิโระ · [GPT-5.6 Sol r:xhigh]
Codex P:7d [████░░░░] 56% · Spark P:5h [██████░░] 80% · Code review P:7d [████████] 100%
Agy Gemini:5h [██████░░] 81% · Claude-GPT:5h [████████] 100% · Gemini:7d [███████░] 85% · Claude-GPT:7d [███████░] 90%
```

Available width 160:
```text
📁 mods · 🌿 main ✓ · 💬 อยากให้ pull… · ctx 42% · ✏️ accept-edits                                                             ผู้ช่วยมาฮิโระ · [GPT-5.6 Sol r:xhigh]
Codex P:7d [████░░░░] 56% · Spark P:5h [██████░░] 80% · Code review P:7d [████████] 100%
Agy Gemini:5h [██████░░] 81% · Claude-GPT:5h [████████] 100% · Gemini:7d [███████░] 85% · Claude-GPT:7d [███████░] 90%
```

Summary at available width 80 (five rows, before three statusline rows):
```text
Mahiro Usage · remaining
Codex P:7d [█████████░░░░░░░] 56% left
Agy Gemini:5h [█████████████░░░] 81% left
Agy Claude-GPT:5h [████████████████] 100% left
/mh-usage status 1 · 6 detail pages · closes 10s
```

These are deterministic live-shaped fixtures, not the user's current account
snapshot or a human-approved screenshot. Prior edits were preserved and no
leftover checkout install/check process was found before execution resumed.
Main audit, user reload, and visual acceptance remain pending; no core/auth
changes, commits, or pushes were authorized or performed.

Closeout checks passed: `pnpm check`, `pnpm pack --dry-run`, and
`git diff --check`. `pnpm mods:update` completed through the owning local manager;
`pnpm mods:status` reported all ten source entries matching and no migration
needed. Current three-row/paginated-panel statusline source/installed SHA-256:
`93fa7068b68e36606ed7c676b9d43e7f08f8038ee250df7ee14caa831b7083a7`.

## Commit attribution auto-sanitize — 2026-09-25

The automatic commit-attribution entry now combines its permission overlay with
one bounded `tool_start` transform when the host exposes tool events. Approval
retains normal host policy. The transform removes only the two exact Letta
attribution strings when a string command begins directly with `git commit` and
every occurrence lies inside an unambiguous literal quoted `-m` / `--message`
value (or its argv-like message argument), preserving the original command/cmd
shape, subject/body, cwd, suffix chain, hooks, signing, and result ownership.
Prefix chains, ambiguous forms, dynamic shell constructs, and occurrences
elsewhere in the chain are denied rather than rewritten.
Execution rechecks final arguments and denies when a transform is absent, fails,
or is overwritten. Hosts without tool events retain the previous deny-only
behavior. The mod never spawns Git itself. Manifest order places the guard before
RTK Control, and final-argument matching recognizes RTK's `rtk git commit`
wrapper so optional rewrite-rtk mode cannot bypass the attribution boundary.

Synthetic regressions cover command and cmd inputs, strings and argv-like
arrays, a direct commit with a status suffix, approval versus execution phases,
clean/non-commit no-ops, post-transform acceptance, unsanitized final-argument
denial, attributed text in a later `printf`, a quoted/non-executed fake commit,
heredoc-body fake commit text, the non-command token `git commit-not-real`,
`$()` / backtick / arithmetic substitutions, unsupported `cd` and `git add`
prefix chains, shell-comment options, process substitutions, capability
fallback, normal cleanup, aborted cleanup, and event-registration failure
rollback. The added event registration raises the verified bundle total from 49
to the existing 50-registration ceiling.

Multiple source-only iterations passed `pnpm check` and `pnpm pack --dry-run`;
each fresh verifier counterexample above was added before the direct-command-only
boundary replaced broad shell parsing. A bounded version also passed a live
positive commit and two negative cross-segment/quoted-fake probes. However, the
first direct-only live probe then exposed a separate integration failure: active
RTK mode was `rewrite-rtk`, RTK's earlier `tool_start` changed the raw command to
`rtk git commit`, and the guard no longer recognized it. The disposable commit
therefore retained both attribution lines. Its evidence was inspected and the
temporary repository removed; it is a failed probe, not acceptance evidence.

The final fix moves the guard before RTK in every canonical entry list and adds
exact RTK-wrapper final-argument coverage. Focused checks, manifest validation,
the full 14-entry suite, and `pnpm pack --dry-run` passed. The first pack attempt
hit one unrelated Herdr lifecycle timing assertion; the exact full-suite rerun
and subsequent pack both passed without source changes to that subsystem.
`pnpm mods:update` installed the reordered bundle, `pnpm mods:status` reported
all entries matching with no migration needed, and the final guard source/
installed SHA-256 is
`4953f8442ce3bab498bfd2845a8028f5e3fe2cd70d9649fe47e27a381a96ab7d`.

After reload with RTK state still explicitly set to `rewrite-rtk`, a fresh
disposable repository probe sent a direct attributed `git commit`. It produced
exactly one commit, preserved the requested subject, and stored no `Letta Code`
text. A separate disposable probe then sent an explicitly unsanitized
`rtk git commit`; the permission overlay denied it and the repository remained
at zero commits. Both temporary repositories were removed. This establishes the
live raw-guard → RTK rewrite → final-argument recheck path for the current bytes.
No source repository commit, push, tag, or release occurred.

A later real `git-commit` subagent probe exposed one narrower stored-message
defect that the original live fixture had missed: the harness input uses
`👾 Generated with [Letta Code]`, while the sanitizer removed only the text
beginning at `Generated`. The commit succeeded but retained an orphan `👾` line.
The focused string and argv regressions now use the exact harness trailer and
require the marker to disappear with the generated-by line; the legacy
marker-less form remains covered separately. This later evidence supersedes the
earlier claim that absence of `Letta Code` text alone proved a clean stored body.

After reinstall and reload, a fresh specialized `git-commit` agent completed
the full flow itself. It ran preflight/staging separately, issued a direct
attributed commit call, and stored commit
`23ade749491a2e5d61095a67ff431e0902421705` with the exact body
`test: verify final agent commit flow` followed only by Git's terminal blank
line. Independent readback confirmed one commit, a clean worktree, and no Letta
text, co-author trailer, generated-by text, or orphan `👾` marker. The disposable
repository was removed and nothing was pushed. This is the current end-to-end
acceptance evidence for Skill → specialized Agent → permission approval →
`tool_start` sanitation → RTK rewrite → Git → stored-message verification.
