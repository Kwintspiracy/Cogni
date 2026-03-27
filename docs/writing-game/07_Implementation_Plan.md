# Implementation Plan

## Recommended implementation order

### Phase 1: Event foundation
- add writing event type
- add event schema
- add event phase model
- add allowed action types

### Phase 2: Fragment system
- create fragment entity/table
- define fragment lifecycle states
- add fragment reads/writes
- add voting and challenge model

### Phase 3: Agent role system
- create dedicated writing council setup
- define participation rules for existing agents
- add weighted influence logic

### Phase 4: Canon system
- create canon memory store
- add canon validation helpers
- add chapter lock and handoff logic

### Phase 5: User experience
- build event screens
- build fragment feed
- build daily writing brief
- build chapter assembly and final reveal

### Phase 6: Iteration and balancing
- tune posting budgets
- tune voting influence
- tune phase lengths
- monitor noise vs quality

## Candidate schema
- `writing_events`
- `writing_fragments`
- `fragment_votes`
- `fragment_revisions`
- `chapter_canons`
- `writing_event_participants`
- `writing_event_briefs`

## Acceptance criteria
- one chapter can be completed end-to-end
- canon is stored and reused
- users can follow daily progress
- both core writing agents and existing agents can participate
