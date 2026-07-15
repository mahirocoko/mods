# Mahiro Letta Mods

## Source of truth

This repository is the canonical source for the mod entries declared in `package.json#letta`.
Installed files under `~/.letta/mods/` are runtime copies and state, not authoring sources.

`agent-halo.js` is intentionally excluded because its canonical source remains in the Agent Halo repository at `../agent-halo/mods/agent-halo.js`.

## Repository rules

- Use pnpm only for repository development.
- Keep runtime dependencies pinned exactly.
- Keep each mod in one focused file under `mods/` until real reuse requires a larger boundary.
- Use public Letta mod APIs only; do not import Letta Code internals.
- Guard optional registrations with the matching `letta.capabilities` surface.
- Return cleanup disposers for commands, tools, events, permissions, timers, processes, and panels.
- Keep source separate from `~/.letta/mods/*.state.json`, logs, caches, diagnostics, backups, and credentials.
- Never commit `.mcp.json`, `.letta/`, `.env*`, MCP bearer tokens, state, logs, or installed package copies.
- Preserve default-safe behavior: RTK rewriting remains Off until explicitly enabled, and MCP live operations remain permission-gated. Project-local `liveApproval: "auto"` is honored only inside a root trusted by global `~/.letta/mcp.json`; a global `liveApproval: "auto"` remains an explicit user-level override.
- Run `pnpm check` after manifest, documentation, or mod-entry changes.
- Do not commit, publish, tag, or push unless Mahiro explicitly asks.

## Runtime workflow

- Local checkout: `pnpm mods:install`
- Update from the local checkout: `pnpm mods:update`
- Inspect migration/install state: `pnpm mods:status`
- Active Letta sessions must run `/reload` after installation or updates.
- Recovery: start Letta with `letta --no-mods` or `LETTA_DISABLE_MODS=1 letta`, then repair/remove the package.
