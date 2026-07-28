# Verification

Evidence captured on 2026-07-15 with Letta Code 0.28.8 and pnpm 10.33.0.

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
- current source commit `57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`
- current source SHA-256
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
- the required `frontend-design` brief bridge and explicit output instructing the
  agent to invoke that skill and use `mh_update_goal` separately
- the recorded skill reference is explicitly caller attestation rather than
  proof of invocation or visual adequacy
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
- the recorded `frontend-design` brief remained explicit caller attestation;
  Mahiro's direction/review commands remained the authority gates
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
- all three are Apache-2.0 and unchanged under current official main
  `57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`

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
