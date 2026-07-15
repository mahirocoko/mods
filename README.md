# Mahiro Letta Mods

Private, inspectable Letta Code mods that Mahiro uses across local projects.

This repository is the canonical source. Runtime state, logs, caches, diagnostics, and installed copies stay under `~/.letta/` and are never committed.

## Included mods

| Entry | Surface | Purpose |
| --- | --- | --- |
| `mods/rtk-control.ts` | `/rtk`, `tool_start` | Opt-in RTK status, savings, suggestions, and command rewriting. Default mode is Off. |
| `mods/statusline.tsx` | order-0 panel, lifecycle/turn/tool/LLM/compact events | Compact statusline for workspace, Git, conversation activity, context, MemFS, RTK, model, reasoning, and backend state. |
| `mods/mahiro-mcp-proxy.js` | `/mcp-proxy`, `mcp_proxy`, `mcp_proxy_live`, permission overlay | Lazy cached MCP discovery plus separately gated live reconnect/call/disconnect operations. |

Agent Halo is not duplicated here. Its canonical mod remains in the separate [`agent-halo`](https://github.com/mahirocoko/agent-halo) repository and is installed by that project.

## Requirements

- Letta Code `>=0.28.8`
- Node.js `>=22`
- pnpm `10.33.0` for repository development
- `rtk` for RTK rewriting and savings commands; the RTK mod remains useful for status/diagnostics when it is absent
- GitHub HTTPS credentials when installing this private repository from Git

## Local checkout

```bash
pnpm install
pnpm check
pnpm mods:status
pnpm mods:install
```

The installer validates source/runtime conflicts, backs up the files it migrates, installs this repository as one managed Letta package, installs production dependencies into the managed copy, and removes only the superseded direct/package copies it recognizes.

Let the command finish before running `/reload`, and do not run another Letta package install/update/remove concurrently. The manager serializes its own mutations and preserves unrelated registry entries during rollback, but the Letta CLI itself does not share that lock.

Run this in every active Letta Code session afterward:

```text
/reload
```

After changing a mod in this checkout, reinstall the managed copy with:

```bash
pnpm check
pnpm mods:update
```

## Install from Git

After the repository exists on GitHub:

```bash
letta install git:github.com/mahirocoko/mods
```

Then run `/reload`.

Update the Git-managed package with:

```bash
letta mods update git:github.com/mahirocoko/mods
```

The Git installer in Letta Code 0.28.8 installs declared runtime dependencies before copying the managed package.

Do not install the local and Git sources together. To switch this machine from the current checkout-managed package to Git management after the first push:

```bash
pnpm mods:uninstall
letta install git:github.com/mahirocoko/mods
```

Then run `/reload` and use `letta mods update git:github.com/mahirocoko/mods` for later updates.

## Inspect and remove

```bash
pnpm mods:status
pnpm mods:uninstall
```

Uninstall removes the managed bundle only. It deliberately preserves RTK state, MCP config/cache, and other runtime data. Run `/reload` afterward.

For a Git-managed installation, remove the exact source shown by `letta mods list`:

```bash
letta mods remove git:github.com/mahirocoko/mods
```

Then run `/reload`.

## Runtime data

These are examples of runtime-only paths and must not become source files:

- `~/.letta/mods/rtk-control.state.json`
- `~/.letta/mcp.json`
- `~/.letta/mcp-proxy/cache.json`
- `~/.letta/mods/diagnostics/`
- `~/.letta/mods/backups/`
- `~/.letta/mods/*.events.ndjson`

RTK state retains at most 20 recent rewrite records containing the raw shell command, rewritten output when present, and working directory. Commands can contain sensitive URLs, paths, or arguments; inspect with `/rtk log` and clear the retained records with `/rtk log clear` when needed.

MCP live calls forward the supplied tool arguments to the configured local process or remote service. Returned content becomes Letta tool output and may enter the conversation transcript. Review the selected server/tool and avoid passing credentials in tool arguments.

MCP configuration precedence remains:

1. `~/.letta/mcp.json`
2. nearest project `.mcp.json`
3. nearest project `.letta/mcp.json`

Later files override matching settings and servers. Do not commit project MCP config unless it is intentionally sanitized and reviewed.

Project-local `settings.liveApproval: "auto"` cannot grant itself trust. It is honored only when the current working directory is inside one of the global `settings.trustedLiveApprovalRoots` entries. A global `settings.liveApproval: "auto"` is a deliberate user-level override for all projects; otherwise live actions ask for approval. A project may explicitly set `liveApproval: "ask"` to tighten the policy.

## Recovery

If a mod prevents normal startup:

```bash
letta --no-mods
# or
LETTA_DISABLE_MODS=1 letta
```

Then inspect `letta mods list`, remove or repair the package, and restart or run `/reload`.

See [`MOD.md`](MOD.md) for agent-facing behavior, [`docs/inventory.md`](docs/inventory.md) for migration provenance, and [`docs/verification.md`](docs/verification.md) for install, rollback, security-policy, and two-reload runtime evidence.
