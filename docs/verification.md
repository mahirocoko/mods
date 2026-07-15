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
