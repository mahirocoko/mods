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
  nested values, decimal counters, duplicate IDs, and malformed nested records
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
- token usage is goal-relative, advances revision, emits one budget-limit
  reminder, and then pauses reminder injection
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
