---
name: "@mahirocoko/letta-mods"
description: "Mahiro's private RTK control, compact statusline, and lazy MCP proxy bundle for Letta Code."
---

# Mahiro Letta Mods semantics

## Package boundary

This package activates three independent mod entry points. Each entry capability-gates its own behavior and returns cleanup for registrations, timers, panels, and persistent MCP connections.

Installed package files are runtime copies. Edit this repository, validate it, reinstall/update the managed package, and run `/reload` rather than editing files below `~/.letta/mods/packages/`.

## RTK control

`mods/rtk-control.ts` registers `/rtk` and may inspect `tool_start` shell calls.

- Default mode is `off`.
- `suggest` records conservative rewrite opportunities without changing commands.
- `rewrite-safe` rewrites only a conservative read-only allowlist.
- `rewrite-rtk` follows the broader result returned by `rtk rewrite`.
- The mod never installs or changes global settings hooks.
- State is stored at `~/.letta/mods/rtk-control.state.json` and must remain outside source control.
- State retains at most 20 recent records with raw command input, rewritten output when available, and cwd. These may contain sensitive paths, URLs, or arguments; `/rtk log clear` removes the recent records without changing the active mode.

Use `/rtk doctor`, `/rtk log`, and `/rtk rewrite <command>` before enabling broader behavior.

## Compact statusline

`mods/statusline.tsx` owns an order-0 panel when `ui.panels` is available. It combines bounded workspace/Git/conversation/activity/context/MemFS/RTK/model information and refreshes local Git, memory, reflection, and RTK state every ten seconds.

The panel subscribes only to event capabilities exposed by the current host and cleans up its interval, event registrations, timers, and panel on reload. Hosts without panel UI receive a warning diagnostic and no statusline registration.

## Lazy MCP proxy

`mods/mahiro-mcp-proxy.js` exposes:

- `/mcp-proxy` for explicit human operations
- `mcp_proxy` for bounded cached/read-only status, setup, list, tools, search, and describe operations
- `mcp_proxy_live` for reconnect, call, and disconnect operations
- a permission overlay that separates cached reads from live process/network actions

Global config is `~/.letta/mcp.json`; project overrides may use nearest `.mcp.json` or `.letta/mcp.json`. Cache and connection state live under `~/.letta/mcp-proxy/`.

Live actions ask for approval by default. Project config cannot silently trust itself: project `settings.liveApproval: "auto"` is honored only when the current cwd is inside a root listed by global `settings.trustedLiveApprovalRoots`. Global `settings.liveApproval: "auto"` remains an explicit user-level override, while project `liveApproval: "ask"` may tighten it. If the permissions capability is unavailable, the model-callable live tool is not registered. Bearer token values must not be printed or cached.

The proxy supports persistent stdio connections and SDK-backed Streamable HTTP/SSE transports. OAuth, MCP resources, and direct registration of every remote MCP tool remain out of scope.

Live tool arguments are sent to the selected configured process or remote service. Returned content becomes Letta tool output and may be recorded in the conversation transcript; never place credentials directly in tool arguments.

## Safety and recovery

- These mods are trusted local code and run with the user's permissions.
- Keep secrets, state, logs, caches, diagnostics, generated bundles, and backups outside Git.
- Do not import Letta Code internals or bypass capability guards.
- Preserve cleanup symmetry so `/reload` does not leak duplicate registrations or processes.
- Recover with `letta --no-mods` or `LETTA_DISABLE_MODS=1 letta`, then remove or repair the managed package.
