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

## Code Map execution assertion (source-only owner patch)

The canonical sibling Pi package now declares `./extensions/mahiro-code-map.ts`
as its sixth resource, adding the stateless model-callable `mh_code_map` formatter.
Letta's Code Map entry and secret/commit factories remain unchanged. There is no
policy relocation or general unknown-tool allowlist. Source approval is not a
live named grant, profile apply or activation.

`trustedCodeMapTool` accepts only that exact name and actual public `ToolInfo`
package provenance: the canonical Pi realroot, package identity/version 0.2.0 and
exact declared extension membership. Inline, foreign/copied packages, wrong entry,
alias names, wrong versions and absent manifest membership fail closed. The
restored version-1 healthy-node `codeMap.assertAccess` requires the actual public
service's optional `matchedSurface` to equal `mh_code_map`, plus affirmative
`source: tool`, non-yolo origin, actual native SessionManager and healthy generation.
The versioned `patches/@gotgenes__pi-permission-system@40.2.2.patch` adds this public
metadata directly from the evaluator's winning `rule.surface`; it does not change
permission decisions or parse config elsewhere. Both family wildcard patterns,
including a later wildcard winning over an earlier exact grant, are denied.
Old/unpatched results, malformed metadata, ask/deny/default/session and yolo-only
allows fail. An exact rule already allowing before yolo is not rewritten to yolo
and remains valid. Source/declaration types are optional/backward-compatible;
metadata alone is not authorization. Session/default rules retain their actual
surfaces; restrictive/floor/forwarded result copies retain the winner's metadata
and state/origin still determine whether it grants anything.

The patch mapping and derived lock metadata are authored, but canonical installed
node_modules are unchanged. Old-owner denial is intentional until a separately
approved frozen install and fresh load, with a separately approved named grant.
No permission is written or prompted for. The bootstrap remains an independent
health gate.

The dispatch hook calls the assertion, and the Pi execute body independently
requires it too; nested/codemode or direct execute cannot rely solely on the hook. Import/registration
and formatting perform no I/O; execution intentionally checks canonical package
metadata/provenance and existing policy, not workspace source. It adds no scanner,
subprocess, inference, session entries, persistence, Goal/Evidence query or reminders.
A missing/stale/disposed/foreign node fails, rather than claiming an unguarded tool
works. This cooperative extension boundary is not a hostile-extension sandbox.

`pnpm test:code-map` (also part of `pnpm test`) runs `permission-patch-test.mjs`
and `code-map-blocked-test.mjs`. The former stages the patch using offline source
copies and read-only dependency links, tests real owner decision parity, scope/
session/yolo/floor/result-copy metadata and source/type/lock binding, then runs the
original positive SDK/Faux `code-map-test.mjs` in an isolated sibling-layout mirror.
Its fixture-canonical roots are not live configured roots; provenance checks remain
unchanged. Exact/later-exact allows pass; both family and later-family winners fail
at assertion, direct execute without hooks and public SDK direct/nested dispatch.
The latter fixture uses the unchanged canonical installed owner and proves its
missing attestation denies exact and family allows. Calling the positive file
directly with that old owner remains unsupported/failing, not proof of activation.

Lock generation uses pnpm 10.33.0 offline lockfile-only in a disposable mirror,
not installation. Upstream Rollup/type-build prerequisites are not shipped here;
the narrow bundled declaration addition mirrors the source type and is explicitly
checked, not represented as a full owner build. New evidence and failures remain
under Pi's ignored `.agent-state/runtime/code-map-port/owner-patch/`; earlier proofs
remain untouched. No external inference, real profile/grant/role/Core or canonical
installed dependency mutation is performed. Fresh QA and live activation remain
Main-owned.

## Goal ABI (source-only version 1)

The canonical Pi package appends Goal seventh; Letta source/factories remain
unchanged. `trustedGoalTool` trusts only `mh_get_goal`, `mh_create_goal`,
`mh_update_goal`, `mh_clear_goal` at the exact canonical package/version 0.2.0,
exact declared `extensions/mahiro-goal.ts` entry. The healthy-node `goal` member
contains only `version`, `generation`, `assertAccess` and `authorize`. Both outer
dispatch and native execute recheck actual tool/context/manager/primary/generation.

It requires actual public owner tool-source/non-yolo allow with `matchedSurface`
exactly equal to **both** queried tool name and
`goal_state_<sha256(canonical project-state-root UTF8)>`. The state root is derived
from public native profile binding plus canonical project, never tool arguments.
Applicable explicit path denials for root/state/lock are retained. Memory/C1,
root-only/tool-only, wildcard winners, yolo-transformed asks and old owner metadata
cannot authorize Goal. No second parser/security factory or general allowlist is
introduced. The existing authored permission-owner patch is reused, not installed.

Primary means captured manager/header plus native-child exclusion; parent-linked
human forks conservatively reject too. Native Pi owns private state/schema/CAS,
UI confirmation, reminder and before-navigation invalidation; this adapter owns
policy/provenance. No worker, Core/memory import, profile grant, new model route,
Herdr/busy panel or live activation is added. The native contract is
`mahiro-pi/docs/goal.md`. Its source preview has no apply or state-initialization
operation. Public pathname guards do not claim hostile same-UID containment.

`pnpm test:goal`, also included in `pnpm test`, serially stages actual patched and
old permission owners with unchanged canonical dependencies. The public SDK/Faux
fixture covers direct/nested/execute, winning rules/provenance, confirmed human
commands, stale approval, navigation tickets, reminder/Core/context/images and
explicit same-project session movement. The strict image assertion uses the
QA-confirmed valid PNG; public `session_shutdown` precedes disposal to clean the
permission owner's UI forwarding poller. Original invalid-PNG/dispose-only failures
remain ignored evidence, not successes. New receipts are under
`mahiro-pi/.agent-state/runtime/goal-port/repair/`; zero external requests and fixture
roots do not establish provider behavior, live profile readiness or human acceptance.

## Code Evidence ABI (source-only version 1)

The canonical Pi package appends `extensions/mahiro-code-evidence.ts` eighth.
`trustedEvidenceTool` accepts only `mh_code_evidence` at that exact declared entry,
canonical Pi package/version 0.2.0 and actual public ToolInfo. Healthy primary
nodes expose only `version`, `generation`, `assertAccess`, `authorize`,
`assertSources` and `authorizeGit`. Outer dispatch and direct/nested execute independently enforce
context/manager/generation and both exact winning tool-source/non-yolo grants:
`mh_code_evidence` and `code_evidence_state_<sha256(derived state-root UTF8)>`.
State is derived from canonical native profile and cwd project, never caller state
paths. Applicable explicit root/state/lock path denials remain. Old/malformed
owners, wildcard winners, tool-only/root-only or memory grants fail closed.
The existing source patch is reused, not installed or modified for Evidence.

`evidence-git.mjs` is an exact fixed-argv grammar, not a shell API. Only source-bound
`/usr/bin/git` with the collector's fixed safety prefix and fixed inspection tails
is accepted. The fully quoted representation goes through existing
`host.finalArgs('bash', {command}, ctx)`; any rewrite is rejected. Existing public
Bash and read/path permissions still apply; actual execution retains ORIGINAL
structured argv, shell:false. The names-only selected Git config preflight family
is exact, not arbitrary config execution. Pi owns top-level equality, external
storage/filter refusal, sampling, bounds, child cancellation/reap and private
report persistence. `assertSources` uses actual public-owner applicable `read` and
cross-surface `path_read` decisions on logical sources and safe ancestors, including
missing historical paths; exact app/root grants never override a source denial.
Pi inventories index/tree names and bounded worktree metadata before content-capable
Git, binds commands to literal file inclusions plus descendant exclusions, disables
rename candidate expansion, and rechecks source decisions before every spawn and
publication. Denial rejects collection rather than silently dropping a file. Ignored
and unchanged denied paths reject conservatively; symlink sources/large inventories
are unsupported. Global ignore files are disabled; repository ignore dependencies
are included. This is not a sandbox for all Git administrative/global config reads
or external same-UID swaps. `mahiro-pi/docs/evidence.md` owns the complete contract.

`pnpm test:evidence`, also in required `pnpm test`, stages actual patched and old
owners and uses public SDK/Faux with real temporary Git repositories. It covers
positive/direct/nested/execute, permissions/provenance, default-disabled no-state,
proven hostile helper controls, caller-command nonexecution, reference-only
handoff, public clear UI/CAS/navigation, and real process cancellation/revocation/
overflow with canonical bytes unchanged. The source suite additionally checks
owned PID reap, original executable differential and private-FD tamper patterns.
Receipts belong under Pi's ignored `.agent-state/runtime/evidence-port/`. This
changes no installed dependency/profile/Goal/roles/Core/auth/provider, original
Letta entry or security factory. No live readiness or human acceptance is claimed.

## UX Workflow ABI (source-only version 1)

The canonical Pi package appends `extensions/mahiro-ux-workflow.ts` ninth, after
the accepted eight in unchanged order. `trustedUXWorkflowTool` permits exactly
`mh_get_ux_workflow`, `mh_create_ux_workflow`, `mh_update_ux_workflow` with actual
public canonical package/version 0.2.0, exact entry path and manifest provenance.
Healthy primary nodes expose only `uxWorkflow: {version:1, generation,
assertAccess, authorize}`. Outer direct/nested dispatch and the native execute
body independently enforce captured manager/header, generation, cancellation,
canonical cwd/state root and actual owner winning-surface authority.

Both invoked tool and `ux_workflow_state_<sha256(stateRoot UTF8)>` must have actual
public tool-source/non-yolo allows with exact toolName/matchedSurface. Old owner,
missing/malformed metadata, wildcard/session/default/yolo-only, memory/Goal/Evidence,
tool-only/root-only and foreign/inline/alias provenance deny. Applicable read and
path_read denials on root/state/lock apply to all operations, plus path_write for
mutations. This reuses the authored 40.2.2 owner patch without changing or installing
it; no parser, policy provisioning, security-factory copy or general framework.
Parent-linked human forks conservatively reject like native children.

Pi owns the original bounded metadata FSM, closed native envelope/private CAS,
read/approval tickets and public UI confirmation for every human command. Ordinary
agent metadata/create/eligible complete needs no universal confirmation. References
are opaque; there is no research engine, artifact reader, Goal/Evidence mutation,
executor, session attachment/move or force unlock. The contract owner is
`mahiro-pi/docs/ux-workflow.md`. Existing bootstrap recursive source binding needs
no new installer/option. Missing config is disabled and initializes nothing.

`pnpm test:ux-workflow`, included in required `pnpm test`, stages the existing
patched and old actual owners and runs the actual public SDK/Faux wrapper with
direct/nested/hook-free execution, permission/provenance matrix, public confirmed
commands, stale ID/revision/concept/config/revocation/navigation/clear-recreate
races, new-session isolation and strict raw user text/valid PNG preservation.
Artifact/Goal/Evidence reads are trapped; fixture state and project bytes stay
unchanged. Public session_shutdown precedes disposal. Receipts stay under
`mahiro-pi/.agent-state/runtime/ux-workflow-port/`, not source or live state.
Canonical dependencies/profile/Core/auth/roles/config/grants and original Letta
entries/factories remain unchanged. This is source-only, default-disabled evidence,
not independent final QA, provider/live activation or human UX/RAM acceptance.

## Execution Run ABI (source-only version 1)

The canonical Pi package appends `extensions/mahiro-execution-run.ts` tenth,
preserving the accepted nine in order. `trustedExecutionRunTool` accepts only
`mh_execution_run` with exact canonical package/version 0.2.0, declared entry,
root/path and actual public ToolInfo provenance. Healthy primary nodes expose
only `executionRun: {version:1, generation, assertAccess, authorize}`. Outer
dispatch and execute/direct/nested/hook-free bodies require current primary
manager/header/generation, cancellation checks, explicit private project config
and exact canonical root. This adds no general capability framework or policy owner.

Both `mh_execution_run` and `execution_run_state_<sha256(stateRoot UTF8)>` require
actual public winning tool-source allows, exact toolName/matchedSurface and
non-yolo origin. Family/default/session/yolo-only, old owner, missing/malformed
metadata, unrelated memory/Goal/Evidence/UX grants, tool-only/root-only and foreign
copies/aliases deny. Root/state/lock read/path_read denials gate all operations;
mutations also honor path_write. The existing source owner patch is reused only
in isolated fixtures, not installed or changed. Native children and parent-linked
human forks conservatively reject.

Run is optional bounded caller coordination metadata, not execution/proof/acceptance
or a competing task board; live TSK retains tasks/outcomes/evidence ownership.
Pi owns get/create/update, the original FSM and private whole-envelope CAS/tickets.
Public-UI-confirmed abandon is nonterminal-only and clear terminal-only. Explicit
ID/revision/session assignment is frozen; missing/wrong IDs never fall back to
current, and stale UI/clear-recreate/config/revocation/navigation/cancellation
cannot retarget writes. No executors, artifact/other-app-state reads, worker
control/discovery, Goal/UX/Evidence mutation, automatic intake collection,
force unlock, session move, bootstrap subsystem or grant provisioning exists.
`mahiro-pi/docs/execution-run.md` owns configuration, native data-only session refs,
model bounds, FD/ancestor integrity and unsupported same-UID/durability limits.

`pnpm test:execution-run`, included in required `pnpm test`, runs the new
`execution-run-patch-test.mjs` / `execution-run-test.mjs` with isolated actual
patched and old public owners and public SDK/Faux. Positive metadata needs no
universal UI. Ownership/ref/report negatives, direct/nested/hook-free authority,
provenance/grant/path matrices, confirmed command target/race matrices, opaque
Goal/UX/Evidence/artifact traps and unchanged Core/raw text/valid PNG are covered.
Public shutdown precedes dispose. Evidence stays under Pi's ignored
`.agent-state/runtime/execution-run-port/`; no real Run, profile/config/grant,
installed dependency, Core/auth/model/role or original Letta/factory change is
implied. Source-only/default-disabled evidence is not independent final QA,
provider/live/rendered/human/RAM acceptance or full Letta/ALL-Mods parity.

## Continuity read ABI (version 1)

This adapter owns the `continuity` member of each healthy-node registry entry
(`Symbol.for("@mahirocoko/pi-guards:healthy-nodes")`). Consumers must match ABI
version 1 and the node's generation and recheck session health before and after
asynchronous operations. `trustedTool` accepts only actual runtime ToolInfo for
`recall_search` / `recall_read` from the canonical sibling mahiro-pi checkout,
package identity/version 0.2.0, and its declared continuity extension entry.
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

## Managed-memory ABI (separate version 1)

Healthy nodes now expose `managedMemory` independently of `continuity`. It trusts
only the canonical mahiro-pi 0.2.0 package's declared agent-memory extension and
five scoped custom tools. Missing/foreign tools, obsolete generations, fake
SessionManagers, excluded CWDs, unnormalized/escaping roots/targets and revoked
permissions fail closed. The exact root defaults to `~/.pi/agent/memory`, with
`MAHIRO_AGENT_MEMORY_ROOT` only an explicit controlled-store override.

`permission(root)` returns `managed_memory_<sha256 exact root UTF-8>`. Operators
must grant that scalar explicitly; defaults, path maps, generic external writes
and old C1 learning grants are insufficient. `authorize` performs the canonical
secret-path check; `assertAccess` synchronously rechecks health, exact root, actual
tool grant and explicitly matched read/write target restrictions at real IO.
The adapter owns policy; the Pi implementation owns private filesystem/CAS bounds.
No permission is installed by this extension. Ordinary external write denial stays
unchanged: authority is only for the root-bound authored tools, not Bash/core edits.

`bindWorker` is primary-only and checks the public immutable locked system-role
descriptor, initial claim capability and an existing native job record. A private
view is leased to that job, not to an argument token. A child must be attested by
native child-session events, have this generation's exact captured SessionManager,
and match its public `getSessionFile()` to the captured parent service record's
`outputFile` while that `managed-memory-writer` is running. The parent lease must
still be active and its node/generation/root/permission valid. Missing binding,
unknown role/job, sibling sessions and parent disposal/revocation do not fall back
to primary authority. Leases are removed on completion/cancellation/disposal.
This uses no cwd/workingDir spawn property or installed/private host imports.

The native memory test uses SDK 1.3.0 and real public service/session/tool dispatch
with injected Faux transport and a project-owned profile. HOME and real auth are
not changed; receipts stay under mahiro-pi's ignored runtime directory. It verifies
actual native binding, Core Git integration, next/fresh context, revoked/default/
old-C1 authority negatives and project isolation. It exposed that native replace
mode retains a portable parent preamble; Pi's public before_agent_start full
worker-prompt replacement closes that privacy counterexample. `pnpm test:managed-memory`
is offline runtime evidence, never paid-provider or human-acceptance evidence.

On 2026-10-19, the separate project-owned live proof also completed native OpenAI
Main maintenance, a real background policy revision and fresh-session use. Its
independent receipt audit supports that controlled loop only; this offline test
still performs zero external inference. Keep the real native agent directory for
credentials and use project-local fixture resources: children construct a fresh
runtime from their agent directory, while role discovery uses process cwd. A
captured parent ModelRuntime does not transfer auth to a fixture agent directory.
The current Pi `docs/agent-memory.md` owns the exact route, retained failures and
remaining real-root activation/human acceptance gates. No global permission is
installed or implied by either proof.

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
