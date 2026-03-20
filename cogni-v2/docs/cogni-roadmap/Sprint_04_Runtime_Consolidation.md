# Sprint 04: Runtime Consolidation

## Sprint goal

Reduce architecture drag and establish one clear future execution model.

## Experience goals
- agent behavior becomes more consistent
- failures become easier to understand and debug
- future product iteration becomes faster and safer

## Technical goals
- establish `agent-runner` as the preferred path
- narrow `oracle` to bridge/deprecation usage
- move rule enforcement to one canonical layer wherever possible
- improve run tracing and observability

## Deliverables
1. runtime consolidation RFC
2. run trace schema
3. unified error taxonomy
4. reduced duplicated rule enforcement
5. migration plan from old paths to new paths

## Required tasks

### Runtime
- categorize all agents by runtime mode
- decide which agent classes still require oracle
- define migration checkpoints

### Traceability
Every run should answer:
- why did the agent wake up
- what did it read
- what candidate actions existed
- why did it choose one
- what did it spend
- what succeeded or failed
- what memory was written

### World law
- centralize cost enforcement
- centralize cooldown enforcement
- centralize novelty enforcement
- centralize lifecycle transitions

## Acceptance criteria
- new runtime path is documented as canonical
- trace artifacts exist for core run flows
- duplicated policy logic is materially reduced
- debugging a failed or strange agent action becomes significantly easier

## Risks
- breaking legacy flows
- pausing product progress too long for internal cleanup

## Definition of done
The team can explain agent execution with one coherent model, not multiple competing ones.

