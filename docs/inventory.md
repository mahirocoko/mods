# Installed mod inventory and ownership

Inventory captured on 2026-07-15 with Letta Code 0.28.8 before migration.

## Promoted into this repository

| Runtime/source before migration | Repository owner | SHA-256 at promotion |
| --- | --- | --- |
| `~/.letta/mods/rtk-control.ts` | `mods/rtk-control.ts` | `2325f9e23d1eef883a1d2c478603e88ec8499b463a35a48fe4d775e701785ba4` |
| `~/.letta/mods/statusline.tsx` | `mods/statusline.tsx` | `9f1bab53be8d24d697fd877401a9fff3ef2a6f393701aa2a73f48241b98a1cef` |
| `~/.letta/mcp-proxy/mahiro-mcp-proxy-package/mods/mahiro-mcp-proxy.js` | `mods/mahiro-mcp-proxy.js` | `89c526b4a58b08933b89fd6c07a2ff8432724391b2bb8e9a8cf945e1904403e5` |

The MCP proxy source matched the active `npm:mahiro-mcp-proxy@0.2.0` installed entry at promotion time.

The repository-owned MCP source was subsequently hardened before the initial commit candidate: project-local auto approval now requires a globally trusted root, the live model tool fails closed without the permissions capability, and stdio/HTTP client identity consistently reports component version 0.2.0. Its post-hardening SHA-256 is `eb33d68446f89b641582bbb36db01e5455049b512ba637de0e765eefaa14e51f`.

## External canonical source

`~/.letta/mods/agent-halo.js` matched `/Users/mahiro/ghq/github.com/mahirocoko/agent-halo/mods/agent-halo.js` exactly (`4dca9b79a2a6f40952a9d4061de1767ebd50f7ec71968c8cc0fdaee6f8b2f8de`). It remains owned and installed by Agent Halo to avoid duplicate canonical source.

## Runtime-only material excluded from Git

- `*.state.json`
- `*.events.ndjson`
- `diagnostics/`
- `backups/`
- `packages.json`
- managed package directories under `~/.letta/mods/packages/`
- disabled and timestamped backup mod files
- MCP config, cache, bearer tokens, environment files, and project-local overrides

Official `@letta-ai/*` packages remain third-party managed installs and are not vendored here.

