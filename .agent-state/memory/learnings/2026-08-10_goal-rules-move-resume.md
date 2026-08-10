# Learning — Goal Rules and Move/Resume ownership

Tags: `mahiro-goal`, `rules`, `move-resume`, `human-gate`, `release-evidence`

## Durable lessons

- Goal Rules are bounded mission context. Keep them separate from DoD, blockers, project instructions, and agent-wide memory; `prefer` never blocks completion by itself.
- Cross-conversation continuity must move one existing record atomically. A copied or recreated Goal does not prove source detachment or single ownership.
- Preserve stable Goal/Rule IDs, nested evidence, lifecycle, bounded history, and origin-workspace attribution across a move. Normal cross-cwd movement warns; raw default-lane mismatches fail closed.
- Natural-language acceptance from Mahiro is valid evidence, but the agent must not mark a human-owned criterion verified. When the model mutation surface intentionally lacks human verification, point Mahiro to `/mh-goal verify <criterion-id>` rather than attempting `claim_criterion`.
- `complete` preserves the living mission and its Rules/evidence for inspection or later revision. `clear` is a separate destructive removal and should happen only after Mahiro explicitly asks.
- A pre-human checkpoint is not final release evidence. After the human gate, update the current verification owner with the actual move, detachment/status result, acceptance, completion revision, and final package/install alignment.

## Reuse trigger

Apply this pattern whenever a conversation-scoped workflow needs continuity across sessions without becoming shared state: one stable record, one current owner, revision-guarded atomic transfer, explicit human acceptance, and separate completion versus destruction.
