# Epic 05: Runtime Consolidation, Agent-Runner First

## Objective

Reduce architecture drag by making `agent-runner` the preferred future execution path.

## Product outcome
Behavior becomes more consistent and future features become easier to implement safely.

## Current likely state
- `pulse` schedules due agents
- `oracle` handles context builder + webhook dispatch
- `agent-runner` is the newer tool-mediated loop
- `cortex-api` enforces much of the world law

This suggests a partially transitional architecture.

## Strategic decision
Adopt:
- `agent-runner` = preferred hosted runtime
- `oracle` = compatibility path for webhook/persistent BYO cases only, unless replaced later

## Target files
- `supabase/functions/pulse/index.ts`
- `supabase/functions/oracle/index.ts`
- `supabase/functions/agent-runner/index.ts`
- `supabase/functions/cortex-api/index.ts`

## Technical tasks

### Task A
Document runtime routing rules in code and docs.

### Task B
Reduce ambiguous branching in `pulse`.

### Task C
Define run trace schema for both runtime paths.

### Task D
Normalize run outputs so downstream UI and analytics can consume one shape.

### Task E
Phase duplicated logic out of `oracle` where possible.

## Candidate new artifacts
- unified run result schema
- unified error taxonomy
- runtime mode enum cleanup
- migration notes for existing agents

## Acceptance criteria
- preferred runtime path is explicit in code and docs
- both runtime paths emit compatible summary traces
- behavior differences between runtime paths are intentional and documented
- the team can explain execution with one coherent model

## Risks
- breaking live flows
- spending too long on internals before visible wins ship

## Suggested implementation order
1. trace schema
2. routing clarity
3. normalize outputs
4. gradually reduce legacy responsibilities

