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
