# Letta mod reload registration cadence

**Tags**: `letta-code`, `mods`, `reload`, `react`, `useSyncExternalStore`, `macrotask`, `regression-testing`

## Durable lesson

`Maximum update depth exceeded` during Letta Code `/reload` may be a finite synchronous registry-publish burst rather than an infinite application loop. Ink runs React in legacy mode, and every command/tool/event/permission/provider/panel registry mutation can synchronously publish through `useSyncExternalStore`. Final registry cardinality is therefore only one pressure metric; adapter loading publishes, old-generation teardown, registration order, and event-loop cadence also matter.

On Letta Code 0.29.8, mod factories are awaited. A bundle can preserve its final registry and features while splitting large registration groups across zero-delay **macrotasks**:

```ts
await new Promise<void>((resolve) => setTimeout(resolve, 0))
if (letta.signal?.aborted) return
// register the bounded group
```

The post-yield abort check is mandatory: an overlapping reload must not let a stale generation register after its wait. Regression coverage should prove:

1. no registrations occur synchronously before the factory promise settles;
2. registration begins only after a real timer turn, not merely a microtask;
3. aborting during the yield produces zero registrations;
4. normal registration counts and behavior remain exact;
5. aborted cleanup skips registry-mutating disposers while still releasing non-registry resources;
6. repeated foreground reloads with every entry enabled produce no fresh warning trace.

Isolation must use source-level, fixed-path sentinels while leaving the managed package manifest and durable state untouched. Disabling a group proves only that the group contributes pressure; it does not prove that the group contains a React bug. Keep upstream Letta and separately owned Agent Halo changes out of scope unless Mahiro explicitly authorizes them.

## Accepted evidence

- Private bundle exact budget: 39 registrations.
- High-registration groups split: Herdr, Goal, UX Workflow, Statusline.
- Active runtime: NVM Letta Code 0.29.8.
- All ten entries enabled with matching installed/source hashes.
- Three consecutive `/reload` commands produced zero fresh tracer records.
- Mahiro confirmed the warning disappeared.
- Temporary tracer source/cache/logs removed after acceptance.
