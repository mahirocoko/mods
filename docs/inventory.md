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

Official `@letta-ai/*` sources remain third-party provenance references and are
not vendored here. The previously installed Goal Mode and User Timestamps
packages were explicitly removed after Mahiro-owned replacements passed live
verification.

## Source-attributed adaptations

`mods/mahiro-goal.ts` is a behaviorally expanded adaptation of
`@letta-ai/goal-mode@0.1.0`, not an installed-file promotion. The pinned upstream
source is commit `27859c3771177a4e431ace91a4780b0e154abae1`, SHA-256
`c94c9b06e3547b379427ec8c482ab742898a351dcb7028e9180ccfb2abec5590`,
licensed Apache-2.0. The official installed source matched that hash at the
adaptation checkpoint. Mahiro removed the official package after the dogfood
switchover; this repository retains the pinned source receipt and attribution.

The exact Keep / Adapt / Reject boundary is recorded in
`docs/upstream-adaptations.md`; package attribution is in
`THIRD_PARTY_NOTICES.md`.

`mods/mahiro-user-timestamps.ts` adapts the current canonical fix from
`@letta-ai/user-timestamps@0.1.0`. Canonical commit
`c28d70fc490c7e59123e33ae73b064f9c75ddd27` hashes to
`242a70d7a144ef6acd8a27dd3417bd23192be5981b078a32ec1dbf8b5245e70a`.
The published npm artifact remains version `0.1.0`; the previously installed
copy hashed to
`21ba4eda9c7374e7f3cdd0b2c00d18e7033ab504174be5d5d72114e030558805`
and contains the invalid `timeZoneName` combination. Mahiro removed that package
after the replacement passed reload verification.

`mods/mahiro-code-evidence.ts` adapts selected evidence-first contracts from
`@letta-ai/cruise-code@0.1.0-alpha.1`, source commit
`5acfc823849ab7e5b401ab74f1c6158fdb4da7c6`, SHA-256
`90dd87993de9529b02d5d33dcabc85e74f09ea92e7ccfb9fbb829186db52acd3`,
Apache-2.0. Plan Mode and Code Outline Enforce were inspected only as bounded
design references; they are not installed or duplicated by this bundle.

`mods/mahiro-ux-workflow.ts` adapts runtime coordination contracts from
`@letta-ai/cruise-ux@0.2.0-alpha.1`. The current source is pinned at commit
`57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`, source SHA-256
`40c5964f616c19afa2c632433781086d40b4df1fcd8cbb0f26ca66915eebcac0`;
the package was introduced at commit
`5acfc823849ab7e5b401ab74f1c6158fdb4da7c6`. It is Apache-2.0. The adaptation
keeps staged UX coordination and human gates while making `frontend-design`
canonical and keeping Goal/Code Evidence state strictly separate.

`mods/mahiro-code-map.ts` adapts only public registration, reverse cleanup,
closed-schema, and bounded-output patterns from
`@letta-ai/code-outline-enforce@0.2.0`, source commit
`492c6c6ea5102dc29e2c8ac24ace62067891b93c`, source SHA-256
`d4b37430b86fcd2e07af28e40b55d12f48574c660997f8a220d94fd7a3d23a31`,
Apache-2.0. It deliberately rejects the upstream AST/Ctags/regex/read-file,
permission-overlay, and enforcement implementation.

`mods/mahiro-execution-run.ts` adapts bounded coordination patterns—not executor
logic—from `@letta-ai/threadkeeper@0.1.0`,
`@letta-ai/environment-compass@0.1.0`, and
`@letta-ai/tool-guard-inspector@0.1.0`. Their pinned commits/source SHA-256s are:

- Threadkeeper `35461e785330115869de1bc7a777b568f957c8e3` /
  `3b5886629be4c9d204b8d95efd058e15f456268abcc21d39dcff34bc3d739617`
- Environment Compass `01a3bf35c86c947abc1a374b1c24c89abc28547b` /
  `3ed5504d780b23126741741d7430e3f5fb1ee18cb68537804f91458cbb161077`
- Tool Guard Inspector `4f580ee3297e9c311b81ff64c39f9aae7ddf8b7a` /
  `7dd30efb6bf7830967e59ff8a896f3d9362699b0c7308f990bdb6db7e4e9c2ce`

All are Apache-2.0 and unchanged under current official main
`57f7a3ef3b4648a1c46b0f922d6df74d11bfa628`. The Mahiro owner keeps only
scoped operational records, read-only attribution, and narrow receipt patterns;
it rejects anchors/memory replacement, environment probing, generic permission
policy, process execution, repository inspection, and verification claims.
