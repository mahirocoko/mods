# Upstream adaptation ledger

This repository prefers source-attributed adaptation over either blind package
installation or clean-room reinvention. Every borrowed implementation must pin
its source, preserve its license notice, and record what was kept, adapted, and
rejected.

## Mahiro Goal Phase 1

Upstream:

- package: `@letta-ai/goal-mode@0.1.0`
- repository: `https://github.com/letta-ai/mods`
- source commit: `27859c3771177a4e431ace91a4780b0e154abae1`
- source file hash: `c94c9b06e3547b379427ec8c482ab742898a351dcb7028e9180ccfb2abec5590`
- license: Apache-2.0

### Keep

- Public Letta APIs only: commands, tools, and `turn_start` events.
- Conversation-scoped goal behavior.
- Explicit create/status/pause/resume/complete/clear lifecycle.
- Active-time tracking and compact turn reminders.
- Capability guards and reverse-order disposer cleanup.

### Adapt

- `/goal` became `/mh-goal` during dogfood so the official package could remain
  enabled without command collision. After the accepted switchover, Mahiro
  removed the official package while retaining this provenance record.
- Generic goal tools become `mh_get_goal`, `mh_create_goal`, and
  `mh_update_goal` with no aliases or hidden override.
- State moves to `~/.letta/mods/mahiro-goal.state.json` with schema versioning,
  mode `0600` fsynced atomic rename, an owner-token directory lock with atomic
  force-unlock quarantine and explicit human recovery, and
  agent-plus-conversation scope keys with workspace isolation for raw `default`
  lanes.
- A plain objective becomes a structured workflow goal with Definition of Done
  criteria, agent/human ownership, evidence, blockers, phase, next action,
  revision guards, non-goals, workspace attribution, and bounded history.
- Agent criteria require evidence before `claimed`; human criteria require the
  `/mh-goal verify` command before completion.
- Completion fails closed while required criteria or blockers remain. Only the
  explicit human `/mh-goal complete --force` path bypasses that audit.
- Token-budget enforcement is removed. Legacy persisted quota fields are ignored,
  and a legacy `budget_limited` goal normalizes to `active`; completion auditing,
  immutable completed goals, and current-revision replacement remain unchanged.

### Reject for Phase 1

- Overriding `/goal` while the official package is installed.
- PascalCase tool aliases that duplicate the model surface.
- Reading, migrating, or mutating `goal-mode.state.json` automatically.
- Treating an agent claim as human verification.
- Storing state in this repository or project worktrees.
- A persistent panel before real use proves one is needed; `/mh-goal status`
  and turn reminders are sufficient for the first dogfood phase.

## Mahiro Code Evidence Phase 2

Primary upstream:

- package: `@letta-ai/cruise-code@0.1.0-alpha.1`
- source commit: `5acfc823849ab7e5b401ab74f1c6158fdb4da7c6`
- source SHA-256:
  `90dd87993de9529b02d5d33dcabc85e74f09ea92e7ccfb9fbb829186db52acd3`
- license: Apache-2.0

Design references inspected without copying implementation:

- `@letta-ai/plan-mode@0.1.1`, commit
  `27859c3771177a4e431ace91a4780b0e154abae1`, current source SHA-256
  `6636135abdcd3685b05830055eb2216d7884ba76e165c48ae19bdc488fe11834`
- `@letta-ai/code-outline-enforce@0.2.0`, commit
  `492c6c6ea5102dc29e2c8ac24ace62067891b93c`, current source SHA-256
  `d4b37430b86fcd2e07af28e40b55d12f48574c660997f8a220d94fd7a3d23a31`

### Keep

- CruiseCode's `No evidence → no verified` posture and separate evidence
  collection versus trust verdict.
- Bounded subprocess execution with `execFile`, timeouts, and no shell parsing.
- Repository identity, branch/HEAD/base context, evidence records, conservative
  verdicts, and criterion-ready handoff output.
- Plan Mode's distinction between approval and implementation proof.
- Code Outline's rule that structural locators aid navigation but do not prove
  runtime behavior.

### Adapt

- Collect staged, unstaged, untracked, and explicit/upstream-base-to-HEAD lanes
  separately. Staged-only and untracked-only work remain visible.
- Disable repository-configured external diff and textconv helpers on every Git
  diff invocation; evidence collection must not execute repo-supplied helpers.
- Store only bounded file/status/stat metadata in mode-`0600` global runtime
  state. The collector hashes a bounded in-memory patch for freshness but never
  persists it or file bodies.
- Use one report per agent/conversation/repository with atomic writes,
  ownership-token locking, revision guards, explicit abandoned-lock recovery,
  and fail-closed malformed state.
- Bind external command/test/browser/native/manual records to a collection ID
  and HEAD. A later collection makes old records visibly stale and excludes
  them from Goal handoff/verdict calculation.
- External proof is recorded only after existing approved tools perform it.
  `mh_record_code_evidence` stores bounded single-line summaries/references/
  command labels, rejects multiline/raw-diff-shaped payloads, and never runs
  arbitrary commands.
- Return criterion-ready evidence for the agent to attach with
  `mh_update_goal`. Code Evidence never reads/writes Goal state, claims or
  verifies criteria, or completes a Goal.
- `evidence_ready` means bounded current proof is available—not verified.

### Reject

- Treating plain `git diff` as the whole working change.
- Persisting raw/full diffs, command logs, file contents, secrets, or unbounded
  artifact histories.
- Auto-detected arbitrary check execution inside the mod.
- Automatic staging, unstaging, commits, pushes, worktrees, PRs, fixes, or
  retry loops.
- Plan approval, source outlines, changed files, or one passing check as proof
  of full acceptance.
- Direct Goal state mutation or presenting Code Evidence as a security
  boundary.

## Mahiro UX Workflow Phase 3

Upstream:

- package: `@letta-ai/cruise-ux@0.2.0-alpha.1`
- current source commit: `57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`
- current source SHA-256:
  `40c5964f616c19afa2c632433781086d40b4df1fcd8cbb0f26ca66915eebcac0`
- package-introducing commit: `5acfc823849ab7e5b401ab74f1c6158fdb4da7c6`
- license: Apache-2.0

### Keep

- A durable staged UX run spanning framing, discovery, design, direction
  approval, implementation handoff, review, and completion.
- Structured research, brief, concepts, chosen direction, handoff, review
  findings, evidence references, and bounded history.
- Explicit human direction and final review approval instead of model-assumed
  acceptance.
- CruiseCode-compatible handoff names for readiness, brief, acceptance
  criteria, non-goals, constraints, and open questions.
- Public Letta commands/tools, capability guards, and reverse cleanup.

### Adapt

- Namespace the public surface as `/mh-ux`, `mh_get_ux_workflow`,
  `mh_create_ux_workflow`, and `mh_update_ux_workflow`; all tools use the real
  one-context `run(ctx)` / `ctx.args` host contract.
- Make `frontend-design` the canonical doctrine. Direction approval and handoff
  require a recorded brief object whose `skill` is exactly `frontend-design`
  and whose mode/reference/summary remain traceable.
- Treat that record as caller attestation—not proof of skill execution or
  visual quality—because no trusted invocation receipt exists; retain explicit
  human direction approval as the authority boundary.
- Use one run per explicit agent/conversation identity, with workspace isolation
  for raw `default` lanes, in global mode-`0600` runtime state. Add fsynced
  atomic writes, owner-token locks, explicit human force-unlock, recursive
  fail-closed validation, revision guards, bounded lists/text/history, and
  corruption preservation.
- Add protected contracts, target matrix, suggested checks, and Goal criterion
  references to the handoff. Block implementation until direction is human
  approved, readiness is prototype/implementation ready, and no handoff
  question is blocking.
- Restrict review to three iterations, explicit `Ready` / `Needs Revision` /
  `Not Ready` verdicts, bounded findings plus UX/Code Evidence references, and
  human approval only for `Ready`.
- Keep UX completion local. The agent separately attaches selected UX and Code
  Evidence through `mh_update_goal`; the UX runtime never claims, verifies,
  completes, or mutates Goal.

### Reject

- Duplicating `frontend-design` doctrine or auto-designing from runtime state.
- Executing browser/research/command/file-scan work inside the mod.
- Implementing product code, editing repositories, or running checks.
- Importing Mahiro Goal or Code Evidence internals, sharing their state/core, or
  automatically mutating either state file.
- Model-callable direction/review approval, silent stage skips, unbounded review
  loops, or treating a UX verdict as Goal completion.
- Turn-event reminders or a persistent panel before real use proves either is
  necessary.

## Mahiro Code Map Phase 4

Upstream pattern reference:

- package: `@letta-ai/code-outline-enforce@0.2.0`
- source commit: `492c6c6ea5102dc29e2c8ac24ace62067891b93c`
- source SHA-256:
  `d4b37430b86fcd2e07af28e40b55d12f48574c660997f8a220d94fd7a3d23a31`
- license: Apache-2.0

### Keep

- Public capability-gated tool registration and reverse cleanup.
- Closed object schema with explicit required fields.
- Hard output bounds: at most 40 caller entries and 3,000 returned characters.
- Short actionable routing/status language instead of unbounded source output.

### Adapt

- Replace read enforcement with one stateless `mh_code_map` guidance tool.
- Route semantic/conceptual discovery to `ccc`, exact symbol/path/string lookup
  to exact search, and outline requests to an existing trusted external
  outline/symbol surface or small targeted reads.
- Accept optional caller-supplied navigation entries, but label them navigation
  metadata rather than verification evidence.
- Accept an optional target workspace as caller-supplied metadata so cross-repo
  guidance does not mislabel the host conversation cwd; never resolve/read it.
- Keep normal reads narrowly bounded. Broader guidance requires an explicit
  `large_read` object with a reason and 3–12 file / 6,000–20,000
  character-per-file limits; the result remains advisory.
- Accept Goal criterion and Code Evidence references only as caller-supplied
  coordination metadata. Store no state and import no workflow internals.

### Reject

- Reading arbitrary files or interpreting agent-supplied paths as authority.
- Python AST execution, Ctags probing/parsing, language regex parsers, fallback
  source excerpts, filesystem caches, or subprocesses of any kind.
- Permission overlays, Read-family interception, deny/force/anti-bypass
  behavior, or presenting large-read limits as authorization/security.
- Running `ccc`, exact search, indexing, outline generation, tests, or other
  verification from inside the mod.
- Mutating source, Git, indexes, Goal, Code Evidence, or another mod's state.

## Mahiro Execution Run Phase 5

Upstream pattern references:

- `@letta-ai/threadkeeper@0.1.0`
  - source commit: `35461e785330115869de1bc7a777b568f957c8e3`
  - source SHA-256:
    `3b5886629be4c9d204b8d95efd058e15f456268abcc21d39dcff34bc3d739617`
- `@letta-ai/environment-compass@0.1.0`
  - source commit: `01a3bf35c86c947abc1a374b1c24c89abc28547b`
  - source SHA-256:
    `3ed5504d780b23126741741d7430e3f5fb1ee18cb68537804f91458cbb161077`
- `@letta-ai/tool-guard-inspector@0.1.0`
  - source commit: `4f580ee3297e9c311b81ff64c39f9aae7ddf8b7a`
  - source SHA-256:
    `7dd30efb6bf7830967e59ff8a896f3d9362699b0c7308f990bdb6db7e4e9c2ce`
- current official main: `57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`
- license: Apache-2.0 for all three sources

### Keep

- Threadkeeper's bounded, scoped operational records, explicit terminal
  lifecycle, source attribution, secret rejection, and safe local persistence.
- Environment Compass's distinction between runtime-observed identity and
  caller/environment metadata plus concise read-only preflight language.
- Tool Guard Inspector's narrow decision-receipt scope and explicit statement
  that one component's audit is not a complete security/compliance record.
- Public commands/tools, capability guards, closed schemas, and reverse cleanup.

### Adapt

- Replace generic anchors with one optional, revisioned Execution Run per
  agent/conversation scope, plus workspace isolation for raw `default` lanes.
- Use executor-neutral lanes for main agents, Letta subagents, Direct CLI,
  humans, and other external executors without changing trust by executor type.
- Track declared targets, one-writer/many-reader ownership, bounded session and
  worktree references, blockers, reports, and changed paths as caller metadata.
- Gate `plan → ready → active → reported → handed_off`, with blockers
  orthogonal and `abandoned` terminal. Handed off means ready for fresh Code
  Evidence, never verified, accepted, merged, or complete.
- Emit bounded execution handoff and Code Evidence intake packets while keeping
  Goal, UX Workflow, Code Evidence, and Code Map state strictly separate.
- Strengthen stale-caller protection with both run ID and revision guards,
  including terminal replacement and lexical target-collision checks.

### Reject

- Generic conversational anchors, free-text turn injection, hidden global
  continuity, or treating the run as durable memory/backlog.
- Environment probing, Git/worktree inspection or mutation, memory sync,
  network calls, automatic repair, or repository trust claims.
- A global tool/shell permission policy, interception, command deny list, or
  security-boundary claim.
- Spawning/controlling executors, choosing model/provider/effort, submitting
  prompts, retrying work, or inferring process/session liveness.
- Reading/searching/editing source; running `ccc`, Git, tests, browser, or native
  checks; storing raw prompts/transcripts/diffs/logs/secrets.
- Treating lane reports, checks, changed paths, worktrees, or sessions as
  verification evidence; mutating or completing another workflow owner.

## Mahiro User Timestamps

Upstream:

- package: `@letta-ai/user-timestamps@0.1.0`
- canonical fix commit: `c28d70fc490c7e59123e33ae73b064f9c75ddd27`
- canonical fixed source hash:
  `242a70d7a144ef6acd8a27dd3417bd23192be5981b078a32ec1dbf8b5245e70a`
- published npm source hash:
  `21ba4eda9c7374e7f3cdd0b2c00d18e7033ab504174be5d5d72114e030558805`
- license: Apache-2.0

### Keep

- One public `turn_start` event transform and one cleanup disposer.
- Structured `metadata.user_timestamp` with local display text and IANA zone.
- Visible `<user_timestamp>` fallback so model providers cannot silently drop
  custom metadata.
- User-only transformation, approval exclusion, metadata preservation,
  multimodal text insertion, and duplicate-block prevention.

### Adapt

- Use the canonical safe `dateStyle: "full"` plus `timeStyle: "long"`
  formatter, never the stale npm artifact's incompatible `timeZoneName` option.
- Return `{ input }` instead of mutating `event.input`, preserving composability
  with Mahiro Goal and later workflow events.
- Ignore synthetic `<system-reminder>` user items so Goal reminders are not
  presented as human timestamped messages.
- Load this entry before Mahiro Goal; focused composition tests prove only the
  real user item receives a timestamp.
- Keep deterministic transformation helpers behind an isolated test-only seam.

### Reject

- Running the stale official npm handler and Mahiro handler simultaneously.
- Editing the installed official package in place.
- Removing the official package was initially deferred during verification.
  Mahiro explicitly superseded that temporary boundary after the replacement
  passed live use; future upstream comparison should use the pinned receipt or a
  deliberate reinstall rather than preserving a stale runtime package.
