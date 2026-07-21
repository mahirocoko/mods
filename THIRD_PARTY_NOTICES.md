# Third-party notices

## Letta Goal Mode

`mods/mahiro-goal.ts` is adapted in part from `@letta-ai/goal-mode` version
`0.1.0` in the [`letta-ai/mods`](https://github.com/letta-ai/mods) repository.

- Upstream package author: `kl2806`
- Upstream source commit: `27859c3771177a4e431ace91a4780b0e154abae1`
- Upstream source file SHA-256: `c94c9b06e3547b379427ec8c482ab742898a351dcb7028e9180ccfb2abec5590`
- Upstream license: Apache License 2.0; a complete copy is included at
  `LICENSES/Apache-2.0.txt`.

The Mahiro adaptation preserves the useful public mod API shape while changing
the command/tool names, state schema, scope identity, concurrency behavior,
Definition of Done model, evidence lifecycle, human verification gates, and
completion rules. See `docs/upstream-adaptations.md` for the detailed ledger.

No endorsement by Letta or the upstream author is implied.

## CruiseCode

`mods/mahiro-code-evidence.ts` is adapted in part from
`@letta-ai/cruise-code` version `0.1.0-alpha.1` in the
[`letta-ai/mods`](https://github.com/letta-ai/mods) repository.

- Upstream package author: homebodify
- Source commit: `5acfc823849ab7e5b401ab74f1c6158fdb4da7c6`
- Source SHA-256: `90dd87993de9529b02d5d33dcabc85e74f09ea92e7ccfb9fbb829186db52acd3`
- Upstream license: Apache License 2.0; a complete copy is included at
  `LICENSES/Apache-2.0.txt`.

The Mahiro adaptation keeps evidence-first reporting and the distinction
between workflow phase and trust verdict. It replaces project-local full-diff
snapshots and arbitrary configured check execution with bounded global runtime
state, fixed read-only Git collection, separate staged/unstaged/untracked/base
lanes, externally recorded check/browser/native/manual summaries, stale-proof
binding, and an explicit Mahiro Goal handoff boundary.

No endorsement by Letta or the upstream author is implied.

## Letta User Timestamps

`mods/mahiro-user-timestamps.ts` is adapted from
`@letta-ai/user-timestamps` version `0.1.0` in the
[`letta-ai/mods`](https://github.com/letta-ai/mods) repository.

- Upstream package author: Letta
- Canonical fix commit: `c28d70fc490c7e59123e33ae73b064f9c75ddd27`
- Canonical fixed source SHA-256: `242a70d7a144ef6acd8a27dd3417bd23192be5981b078a32ec1dbf8b5245e70a`
- Published npm 0.1.0 source SHA-256: `21ba4eda9c7374e7f3cdd0b2c00d18e7033ab504174be5d5d72114e030558805`
- Upstream license: Apache License 2.0; a complete copy is included at
  `LICENSES/Apache-2.0.txt`.

The published npm artifact predates the canonical fix and combines
`dateStyle`/`timeStyle` with `timeZoneName`, which throws on Node 22+.
The Mahiro adaptation follows the fixed formatter contract, returns a
composable `{ input }` transform, preserves multimodal content/metadata, and
excludes synthetic workflow reminders.

No endorsement by Letta or the upstream author is implied.
