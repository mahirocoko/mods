# Lifecycle polling and interrupt contract

**Tags:** `letta-mod`, `herdr`, `performance`, `event-contract`, `runtime-debugging`

## Durable lesson
When a local Letta mod observes descendant processes for background-agent presence, never scan the full process table merely because a root conversation or tool map says it is active. Terminal events can be absent after user Esc, leaving those maps stale indefinitely.

Use a separately bounded discovery window created at trusted tool boundaries, then continue scanning only while a known child is present. A successful scan may remove a child; a failed scan must not erase the last known child. Bind all event handlers and async scan callbacks to the active conversation scope/generation so delayed lifecycle events or callbacks cannot contaminate a newer conversation.

## Current evidence
On 2026-07-24, an Admin Template Letta Esc emitted `turn_start` and `llm_start` to the Agent Halo log but no public `llm_end`, `turn_end`, or interrupt event. After the bounded polling update, the affected Letta PID produced zero observed `ps` child samples in a 10-second, 200-sample probe after Esc, although Herdr correctly remained unable to label the state as idle.

## Adoption trigger
Apply this contract to any mod/bridge that derives lifecycle status from optional or best-effort events plus local process observation. Do not treat generic cancellation as human intent without actor-scoped evidence.
