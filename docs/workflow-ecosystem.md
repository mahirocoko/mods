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
After Mahiro explicitly approves a packet, the agent applies it itself: prefer
`mh_get_goal` / `mh_create_goal` / `mh_update_goal`, fall back to official
agent-callable Goal tools when needed, and never ask Mahiro to type a slash
command while a tool exists. The mod owns deterministic structured state,
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

- one human-owned objective
- conversation and agent scope
- originating workspace
- workflow phase and immediate next action
- required/optional Definition of Done criteria
- agent-owned versus human-owned criteria
- bounded structured evidence
- blockers and resolution state
- revision-guarded mutations
- goal-relative token/time budget and bounded history

## Planned slices

1. **Mahiro Goal** — structured objective, DoD, evidence, blockers, human gates,
   and turn continuity. Dogfood as `/mh-goal` beside official `/goal`.
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
4. **Code Map** — ccc/exact-symbol/outline guidance plus opt-in large-read
   enforcement, never a security boundary.

Each slice stays a focused mod entry until a second owner proves shared-module
pressure. Runtime state remains under `~/.letta/`; repository state and installed
copies remain separate.

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
