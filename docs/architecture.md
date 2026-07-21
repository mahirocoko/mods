# Repository architecture

## Current reality

The repository root is one installable Letta package with six manifest entries. This deliberately favors one-command private Git installation and one update source over independent npm publication.

```text
package.json#letta
├── mods/mahiro-user-timestamps.ts
├── mods/mahiro-goal.ts
├── mods/mahiro-code-evidence.ts
├── mods/rtk-control.ts
├── mods/statusline.tsx
└── mods/mahiro-mcp-proxy.js
```

The declared capability list is the union of the six entries. Runtime behavior still remains independent because each activation function checks the capabilities it needs.

`mahiro-goal.ts` owns the first workflow schema locally until a second concrete
owner (Code Evidence or UX Workflow) proves extraction pressure. This follows
the repository rule to keep young features owner-local instead of creating a
shared framework before reuse exists. See `docs/workflow-ecosystem.md`.

## Why one package

- `letta install git:github.com/mahirocoko/mods` can install the complete private bundle.
- `letta mods update git:github.com/mahirocoko/mods` updates one known source.
- The MCP SDK dependency is installed automatically by the Git package installer in Letta Code 0.28.8.
- The bundle matches Mahiro's current machine, where these mods are intended to be active together after each new entry passes its explicit runtime gate.

Tradeoff: Letta enables, disables, and versions the bundle as a unit. Split a mod into an independently versioned package only when separate distribution or lifecycle control becomes a real requirement.

## Ownership boundary

Repository source flows into a managed package below `~/.letta/mods/packages/`. Mod-owned state flows elsewhere under `~/.letta/` and must survive reinstall/update/remove operations.

Agent Halo remains an external managed source because its mod and install lifecycle are coupled to the Agent Halo bridge/desktop project.

Official `@letta-ai/goal-mode` also remains an independent managed source during
Mahiro Goal dogfood. The two goal mods have distinct commands, tools, and state;
there is no automatic migration or cross-write.

## Local migration

The local installer is a compatibility bridge for the pre-repository layout:

1. Validate manifest and source files.
2. Refuse to overwrite divergent legacy files.
3. Take a local mutation lock and back up only recognized package/direct-mod paths plus the package registry.
4. Install this checkout as a managed package.
5. Install production dependencies into the managed local copy because Letta 0.28.8 local-path installation intentionally excludes `node_modules`.
6. Verify copied source hashes and the MCP SDK.
7. Remove the superseded direct RTK/statusline files and old `npm:mahiro-mcp-proxy` package.
8. Preserve all state, logs, config, cache, diagnostics, Agent Halo files, and official packages.

Rollback restores this bundle/legacy paths while preserving unrelated package-registry entries that may have changed. Do not deliberately run other Letta package mutations concurrently because the upstream CLI does not share this repository's lock.

Every active Letta process must run `/reload` after the filesystem/package transition. Do not reload during the short install/dependency-verification window.

The MCP approval boundary treats global config as user-owned trust. Project config may request live auto-approval, but the request is ignored unless the current cwd is inside a globally trusted root. The live model tool is not registered on hosts without the permissions capability.
