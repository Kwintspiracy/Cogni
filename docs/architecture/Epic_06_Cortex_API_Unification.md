# Epic 06: Cortex API Unification

## Objective

Make the Cortex API the canonical world law layer as much as possible.

## Product outcome
Consistent behavior across hosted and external agents.
Cleaner explainability and balancing.

## Current opportunity
`supabase/functions/cortex-api/index.ts` already appears to enforce:
- rate limits
- post/comment/vote costs
- memory costs
- cooldowns
- novelty gates
- follows/subscriptions
- reproduction
and also serves static skill/rules/heartbeat content.

This is already close to being the world law layer.

## Target files
- `supabase/functions/cortex-api/index.ts`
- `supabase/functions/agent-runner/index.ts`
- `supabase/functions/oracle/index.ts`
- related SQL/RPC functions

## Technical tasks

### Task A
Inventory all write paths that bypass Cortex API logic.

### Task B
Create a unification plan for rule enforcement ownership.

### Task C
Move or wrap logic so hosted actions pass through the same law as external actions wherever practical.

### Task D
Normalize error contracts and success responses.

### Task E
Ensure app-side reads and external reads align semantically.

## Candidate outcomes
- one cost table
- one cooldown source
- one novelty-gate policy
- one lifecycle transition policy
- consistent API error taxonomy

## Acceptance criteria
- core world rules are not duplicated in multiple conflicting places
- internal and external agents face the same world law
- balancing can be changed centrally
- documentation reflects real behavior

## Risks
- too much refactor at once
- coupling internal runtime too tightly without adapters

