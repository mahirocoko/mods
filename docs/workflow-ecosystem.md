# Mahiro workflow ecosystem

## Direction

Mahiro's workflow ecosystem layers portable skills over deterministic Letta
runtime controls instead of moving all procedural knowledge into Letta-only
mods.

```text
Repository docs/code  current project truth
Skills                portable procedure and judgment across agents
Mods                   Letta runtime state, commands, tools, events, and gates
Memory                 durable preferences and learned corrections
```

`frontend-design` remains the canonical portable design procedure. The Phase 3
UX Workflow mod coordinates stages, durable artifacts, handoffs, review, and
human gates while requiring the agent to invoke that skill; it does not
duplicate or silently replace the skill's design doctrine.

Letta exposes no trusted skill-invocation receipt. The recorded
`frontend-design` reference is explicit caller attestation, not proof of
execution or visual quality; human direction approval remains the runtime
authority boundary.

`control-room-goals` owns the portable Goal drafting/application procedure.
After Mahiro explicitly approves a packet, the agent applies it itself through
`mh_get_goal` / `mh_create_goal` / `mh_update_goal` / `mh_clear_goal` and never asks Mahiro to type
a slash command while a tool exists. The mod owns deterministic structured state,
revision gates, evidence, blockers, and completion audit; the skill owns when
and how the agent should use those surfaces. Human-owned criteria remain
Mahiro-verified only.

## Focused run models

Goal, Code Evidence, and UX Workflow retain owner-local schemas and no shared
core. Their overlapping revision/lock patterns are intentionally repeated
because their invariants and state ownership differ. Integrations use public
handoff output: UX/Code Evidence suggest bounded references, and the agent
selects what to attach through `mh_update_goal`.

The Goal schema reserves these ownership boundaries:

- one human-owned living mission objective
- conversation and agent scope
- originating workspace
- workflow phase and immediate next action
- a bounded mutable plan for reprioritising work during execution
- required/optional Definition of Done criteria
- agent-owned versus human-owned criteria
- bounded structured evidence
- blockers and resolution state
- revision-guarded mutations
- active-time tracking and bounded history

## Active slices

1. **Mahiro Goal** — living mission, mutable plan, DoD, evidence, blockers,
   human gates, and turn continuity through namespaced Mahiro surfaces. Mission
   revisions keep one ID/history; current-plan completion is explicitly reopened
   only by a later revision.
2. **Code Evidence** — active Phase 2. The mod collects staged, unstaged,
   untracked, and base-to-HEAD Git metadata with fixed read-only commands;
   records bounded summaries of already-performed command/test/browser/native/
   manual proof; invalidates old proof on recollection; and returns a
   criterion-ready handoff. The agent—not the evidence mod—attaches selected
   proof with `mh_update_goal`.
3. **UX Workflow** — active Phase 3. Decision framing, recorded discovery,
   required `frontend-design` brief, concepts, human direction approval,
   CruiseCode-compatible implementation handoff, up to three UX review
   iterations, and human approval only for a `Ready` review. It performs none of
   the research/design/implementation/check work itself and never changes Goal.
4. **Code Map** — active Phase 4. Stateless `mh_code_map` guidance routes
   semantic/conceptual discovery to `ccc`, exact symbol/path/string lookup to
   exact search, and outline requests to bounded external outline guidance.
   Large reads require explicit bounded opt-in, but the result is advisory and
   never permission enforcement or a security boundary. Caller search results
   and Goal/Code Evidence references remain navigation/coordination metadata,
   not verification proof.
5. **Execution Run** — Phase 5. An optional executor-neutral
   coordinator for complex main-agent, Letta-subagent, Direct-CLI, human, or
   other external work. It records declared lanes, targets, one-writer/
   many-reader ownership, blockers, bounded reports, and the handoff into fresh
   Code Evidence. It does not execute, supervise, inspect, or verify work.

Execution Run is not a mandatory fifth step for ordinary edits. Use it when
multiple writers/executors, external CLI sessions, several worktrees/targets,
cross-turn coordination, or a material implementation handoff justifies the
extra state. Straightforward work remains `Goal (optional) → implement → Code
Evidence (when acceptance needs it)`.

Each slice stays a focused mod entry until a second owner proves shared-module
pressure. Runtime state remains under `~/.letta/`; repository state and installed
copies remain separate.

### Checkpoints are not completion

Goal completion is a DoD audit, not a model-turn outcome. A completed response,
checkpoint report, Execution Run `reported` stage, or Herdr activity label may
describe useful progress while a Goal remains active. Checkpoints are the default
safe pause: the status surface must name whether agent-owned work remains or a
Mahiro-owned gate is pending. No workflow mod automatically starts another turn.

## Completion semantics

```text
pending   work/evidence not complete
claimed   agent checked concrete evidence
verified  Mahiro accepted a human-owned criterion
blocked   progress cannot continue without resolution
complete  all required agent claims + human verification + no open blockers
```

No Code Evidence or UX verdict may silently complete the goal. The goal
runtime performs the final deterministic audit, and Mahiro owns explicit human
verification gates.
