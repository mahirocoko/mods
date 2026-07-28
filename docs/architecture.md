# Repository architecture

## Current reality

The repository root is one installable Letta package with ten manifest entries. This deliberately favors one-command private Git installation and one update source over independent npm publication.

```text
package.json#letta
├── mods/mahiro-user-timestamps.ts
├── mods/mahiro-herdr-lifecycle.ts
├── mods/mahiro-goal.ts
├── mods/mahiro-code-evidence.ts
├── mods/mahiro-ux-workflow.ts
├── mods/mahiro-code-map.ts
├── mods/mahiro-execution-run.ts
├── mods/rtk-control.ts
├── mods/statusline.tsx
└── mods/mahiro-mcp-proxy.js
```

The declared capability list is the union of the ten entries. Runtime behavior still remains independent because each activation function checks the capabilities it needs.

`mahiro-herdr-lifecycle.ts` is a local observability adapter, not a Herdr
controller. It activates only when Herdr injects its local socket and pane
identity, observes bounded local child-process identity, and reports one
semantic pane state plus bounded presentation
metadata. Herdr owns rollups, unseen `done`, focus, waits, and notifications.
The mod never starts, stops, prompts, or reads output from another agent.
It registers lifecycle, turn, and tool events only; LLM events are a fallback
when turn events are unavailable. Engine-aborted reload cleanup deliberately
does not call each event disposer because Letta clears the whole generation
after abort and every redundant unregister publishes a new host snapshot.

`mahiro-goal.ts`, `mahiro-code-evidence.ts`, and `mahiro-ux-workflow.ts` each
own focused state and invariants. Phase 3 deliberately does not extract a shared
workflow core: Goal owns completion, Code Evidence owns repository proof, and UX
Workflow owns design-stage coordination/human gates. This keeps cross-mod
handoffs explicit through public tool output rather than internal imports. See
`docs/workflow-ecosystem.md`.

`mahiro-code-map.ts` is intentionally stateless and independent. It owns only a
bounded routing/read-guidance contract; `ccc`, exact search, outline tools, file
reads, and verification remain external operations. It does not share a core or
state with Goal, Code Evidence, or UX Workflow.

`mahiro-execution-run.ts` owns optional execution coordination between planning
and fresh Code Evidence collection. It records declared lanes, targets,
one-writer/many-reader ownership, blockers, bounded reports, and handoff packets
without running or supervising any executor. Main-agent, Letta-subagent, and
Direct-CLI lanes share one trust model. All session/worktree/path/check/report
data remains caller-supplied metadata; Goal, UX, Code Evidence, and Code Map
state stay separate and are never imported or mutated.

## Why one package

- `letta install git:github.com/mahirocoko/mods` can install the complete private bundle.
- `letta mods update git:github.com/mahirocoko/mods` updates one known source.
- The MCP SDK dependency is installed automatically by the Git package installer in Letta Code 0.28.8.
- The bundle matches Mahiro's current machine, where these mods are intended to be active together after each new entry passes its explicit runtime gate.

Letta still installs and versions the bundle as a unit. Local troubleshooting
and optional runtime use can disable one entry through a fixed sentinel before
that entry registers anything; this leaves the managed registry and state
untouched. Split a mod into an independently versioned package only when
separate distribution—not merely local runtime control—becomes a real
requirement.

## Reload registration cadence

Letta awaits each mod factory but synchronously publishes every command, tool,
event, permission, provider, and panel registration to an Ink legacy-React
external store. The higher-registration Herdr, Goal, UX Workflow, and
Statusline entries intentionally cross a zero-delay macrotask before their
registration group. This changes cadence only: the final registry, event
handlers, tools, state, and cleanup contracts remain the same. Each entry
checks its abort signal after the yield so an overlapping/stale reload cannot
register into a dying generation.

## Ownership boundary

Repository source flows into a managed package below `~/.letta/mods/packages/`. Mod-owned state flows elsewhere under `~/.letta/` and must survive reinstall/update/remove operations.

Agent Halo remains an external managed source because its mod and install lifecycle are coupled to the Agent Halo bridge/desktop project.

## Local migration

The local installer is a compatibility bridge for the pre-repository layout:

1. Validate manifest and source files.
2. Refuse to overwrite divergent legacy files.
3. Take a local mutation lock and back up only recognized package/direct-mod paths plus the package registry.
4. Install this checkout as a managed package.
5. Install production dependencies into the managed local copy because Letta 0.28.8 local-path installation intentionally excludes `node_modules`.
6. Verify copied source hashes and the MCP SDK.
7. Remove the superseded direct RTK/statusline files and old `npm:mahiro-mcp-proxy` package.
8. Preserve all unrelated state, logs, config, cache, diagnostics, Agent Halo files, and package-registry entries.

Rollback restores this bundle/legacy paths while preserving unrelated package-registry entries that may have changed. Do not deliberately run other Letta package mutations concurrently because the upstream CLI does not share this repository's lock.

Every active Letta process must run `/reload` after the filesystem/package transition. Do not reload during the short install/dependency-verification window.

The MCP approval boundary treats global config as user-owned trust. Project config may request live auto-approval, but the request is ignored unless the current cwd is inside a globally trusted root. The live model tool is not registered on hosts without the permissions capability.
