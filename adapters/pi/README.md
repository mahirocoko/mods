# Pi operation guards

Private local Pi adapter for SDK 1.3.0, `@gotgenes/pi-subagents` 23.4.1 and
`@gotgenes/pi-permission-system` 40.2.2. It reuses the canonical secret-read and
commit-attribution default factories in this repository; it does not copy their
policy or change the fifteen-entry Letta manifest.

## Required configuration

Load the complete package, with `bootstrap.mjs` first and `index.ts` second.
Loading index alone is unsupported. The dependency-free bootstrap blocks every
tool dispatch unless the session has a healthy node published by the completed
adapter, including actual tool ownership, canonical factory health, permission
service, generation and lifecycle checks. Registration/import failures must not
fall back to an earlier unguarded reader.

Register this package and the same local upstream package roots used by its
installed dependencies. Orchestrator authorization checks public runtime
`ToolInfo` provenance against the pinned package and its declared extension entry;
an arbitrary second copy or a tool name alone is insufficient. The tested setup
uses absolute local package-source paths.

Set `excludedExtensionPackages` to the **exact configured subagents package
source** in the native subagents configuration. Its upstream default is empty.
Never exclude the permission package or this guard package from children. Missing
child nodes/services stop orchestrated spawn/resume; cancellation conservatively
includes healthy and queued siblings belonging to the captured parent.

Native filesystem/shell definitions enforce transformed final arguments directly
before execution. Filtered-reader failures become native errors. Unknown tools
and PowerShell remain denied. Only the pinned orchestrator's three meta tools and
approved native HiroHiro/Chrome MCP provenance receive the explicit meta routing.
MCP permission rules belong under the permission package's current `mcp` surface;
outside-CWD access has a separate `external_directory` surface.

## Continuity read ABI (version 1)

This adapter owns the `continuity` member of each healthy-node registry entry
(`Symbol.for("@mahirocoko/pi-guards:healthy-nodes")`). Consumers must match ABI
version 1 and the node's generation and recheck session health before and after
asynchronous operations. `trustedTool` accepts only actual runtime ToolInfo for
`recall_search` / `recall_read` from the canonical sibling mahiro-pi checkout,
package identity/version 0.1.0, and its declared continuity extension entry.
Until that entry is registered in the package manifest, recall remains denied.
Caller argument flags and same-name foreign tools convey no trust.

`authorizeRead(tool, absolutePath, ctx, signal)` applies the unchanged canonical
native-read final checks, rejects path rewrites and requires existing `read`,
the actual trusted tool name (`recall_search` / `recall_read`), and (outside CWD)
`external_directory_read` allows. Background `before_agent_start` context reads
must supply the actual `recall_read` ToolInfo and therefore require its allow too.
An explicitly matched `path_read` ask/deny blocks; an unmatched universal fallback
is not a path restriction, matching the native path gate's `matchedPattern` rule.
The directional query is essential in permission-system 40.2.2: the bare
`external_directory` family folds read and write most-restrictively, so a read-only
grant must not require or imply write access. ABI version 1 is retained: signature
and opaque node shape are unchanged; tool/path authorization is tightened and the
read direction corrected. No root-specific bypass is added. It never grants
permissions or prompts on behalf of a background context read. The consumer must use the
exact authorized paths and retain final lifecycle checks at actual IO/return.
`parentService()` returns only this node's captured parent service while healthy;
it does not authorize a role, launch a worker, or weaken subagent policy.

The Pi reader's private data root defaults to `~/.pi/agent/continuity`, with one
explicit trial override `MAHIRO_CONTINUITY_ROOT`. Its private `manifest.json`
shape is `{ "version": 1, "projects": [{ "cwd": "/canonical/cwd", "projectId": "id" }] }`.
Exact CWD assignment is required; duplicate assignments and OneDee are denied.
No directories, manifests or accepted data are created by activation or recall.
Missing data/permissions/health means unavailable, not empty verified knowledge.

## Pinned initial-outcome claim patch

The adapter's pnpm workspace registers a version-specific patch for subagents
23.4.1; its hash is pinned in the adapter lockfile. Both source `SpawnOptions` and
published declarations add `claimOutcome?: boolean`. The public service also
exposes `readonly supportsInitialOutcomeClaim: true` at runtime. Before any owned
spawn, the caller must fail closed unless
`service.supportsInitialOutcomeClaim === true`: stale upstream services silently
ignore unknown spawn options, regardless of the caller's installed types.
A native service caller can
use `spawn(type, prompt, { claimOutcome: true })` without foreground or queue
bypass. The manager takes the existing per-run carrier claim before publishing
creation events or admitting work to the native limiter. Terminal events,
persistence, snapshots and result retrieval remain available; the claim is not
consumption. The caller must collect and deliver/consume its outcome once.
Omitting the option or passing false preserves ordinary completion nudges and
scheduling. A later resume still uses its own existing `ResumeOptions.claimOutcome`.

`pnpm test:subagents-patch` reapplies the canonical patch offline in an ignored,
isolated fixture and tests the real service adapter, manager, limiter, events
observer and notification manager with synthetic sessions (no provider calls).
It checks pre-creation claims, queued fast completion, FIFO/concurrency, queued
and running cancellation, failures, ordinary nudges, public declarations and
claim reset on resume. `SUBAGENTS_UNPATCHED=1 pnpm test:subagents-patch` is the
negative control against the currently installed upstream copy, expected to fail
until that copy is activated. The fixture installs only the pinned subagents
package with auto peers disabled and verifies the canonical patch hash: this is
not a full SDK installation or provider acceptance proof.

Authoring the patch does not activate it. Main must coordinate a local frozen
pnpm install and reload: installation changes the subagents dependency realpath,
so configured package-source/provenance references must be reviewed together.
Do not reload or alter global Pi configuration as part of offline validation.

## Learning authority and topology (additive ABI 1)

Healthy-node `continuity.isPrimarySession(ctx)` requires this generation's actual
session manager and a public `getHeader()` with matching ID and no parent.
Native `subagents:child:session-created` (before binding) and `bound` events retain
child identities in the shared registry, including after disposal. Missing headers,
parented/forked sessions and known children fail closed. Headless/script roots are
allowed: this means native-root-user attribution, never confirmed-human proof.

Synchronous `continuity.authorizeLearning(ctx, root, target = root)` additionally requires the
exact normalized absolute configured continuity root, excludes OneDee/OneDeex CWDs,
and checks the public permission service for an explicit non-default scalar allow
on `continuity.learningPermission(root)`, plus any explicitly matched `path_write`
restriction. The helper returns `continuity_learning_` followed by the lowercase
SHA-256 hex digest of the exact canonical absolute root's UTF-8 bytes. It performs
no IO and conveys no authority: this is a cooperative scope namespace, not a
signature or human provenance. Operators grant that exact key as a scalar `allow`.
Changing roots changes the required key. Native unknown-surface path maps do not
match their root argument, so old `continuity_learning` scalar/path-map grants and
wildcard/default allows are deliberately insufficient.
Read grants and generic/external write grants are not learning authority. It grants
nothing and performs no filesystem IO. Store privacy/symlink checks remain the
store owner's responsibility; call this gate before writes and pointer publication.
Pass each actual write target: it must be normalized and remain in that root, and
descendant-specific `path_write` restrictions are checked against that target.

The patched public service now offers `getAgentType(name)`: unknown/disabled names
return undefined instead of spawn's unchanged general-purpose fallback. The frozen
copy reports canonical name, toolNames (undefined means native built-in defaults),
model, thinking, runInBackground, inheritContext, locked and promptMode. Arrays are
copied/frozen too; prompts are not exposed. Controllers must check both the runtime
initial-claim marker and query availability, then verify the expected role before
spawning. This query reads the same existing registry; it adds no registry/manager.

## Evidence boundary

Focused offline SDK tests cover final rewrites, nested codemode, model-facing
orchestration, missing services/nodes, registration/import faults, provenance,
filtered errors and parent isolation. Separate independent rechecks include real
retention/disposal followed by unrelated resume. The 2026-10-17 native OpenAI proof
also exercised a read-only child plus actual HiroHiro schema and Chrome list-pages.

These are cooperative trusted-extension tool boundaries, not an OS sandbox.
Trusted idle custom-message inference remains outside the orchestrated gate.
A physically absent/disabled whole package cannot enforce itself. Do not promote
offline/Faux reports into real-provider evidence or human product acceptance.

`mahiro-pi` owns footer/status/voice and the native role definition sources; this
package owns host mapping and guard lifecycle only. Runtime registration and QA
receipts are ignored project evidence, not another policy owner.
