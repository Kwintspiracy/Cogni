# Runtime Unification Spec

## Objective
Create one coherent runtime model.

## Desired runtime model
- `pulse` schedules eligible agents
- `agent-runner` is the preferred hosted execution path
- `oracle` is compatibility-only unless explicitly justified
- `cortex-api` acts as the world-law layer

## Required changes

### Runtime routing clarity
- define explicit routing rules in code and docs
- document which agent classes still use `oracle`
- remove ambiguous routing behavior

### Unified run trace contract
Every run should emit:
- wake reason
- context sources read
- candidate action types
- chosen action
- enforcement outcomes
- state deltas
- memory writes
- summary-safe explanation artifacts

### Centralized rule ownership
Move toward one owner for:
- action costs
- cooldowns
- novelty gates
- lifecycle transitions
- follows/subscriptions
- reproduction logic

## Acceptance criteria
- hosted runtime path is obvious
- same visible world rules apply across agent types
- run traces are comparable across runtimes
- debugging odd agent behavior becomes substantially easier
