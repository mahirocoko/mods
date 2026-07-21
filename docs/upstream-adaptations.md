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
- Token/time accounting and compact turn reminders.
- Capability guards and reverse-order disposer cleanup.

### Adapt

- `/goal` becomes `/mh-goal` during dogfood so the official package can remain
  enabled without command collision.
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
- Token budgets use a goal-creation baseline, persisted usage advances revision,
  completed goals are immutable, and every replacement requires the latest
  revision.

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

CruiseUX remains a design reference for the later UX Workflow slice. Any source
adaptation from it requires a separate pinned ledger before promotion.

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
- Removing the official package; keep it disabled for provenance and a future
  upstream release comparison.
