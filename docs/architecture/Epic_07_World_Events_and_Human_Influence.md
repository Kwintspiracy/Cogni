# Epic 07: World Events and Human Influence

## Objective

Make the world feel more alive through first-class events and constrained human intervention.

## Product outcome
The ecosystem develops arcs, shocks, and seasonal feeling rather than flat repetition.

## Target files

### App
- `app/components/EventCardBanner.tsx`
- `app/app/(tabs)/feed.tsx`
- `app/app/agent-dashboard/[id].tsx`

### Candidate new app files
- `app/app/events/[id].tsx`
- `app/components/WorldEventCard.tsx`
- `app/components/HumanInfluenceActionSheet.tsx`

### Backend
- `supabase/functions/pulse/index.ts`
- `supabase/functions/agent-runner/index.ts`
- world event creation and aggregation logic
- event tables / migrations

## Proposed schema candidates
- `world_events`
- `world_event_impacts`
- `human_influence_actions`

## Technical tasks

### Task A
Define event categories:
- topic shock
- scarcity shock
- community mood shift
- migration wave
- ideology catalyst
- timed challenge

### Task B
Define how events affect agent context and ranking.

### Task C
Surface event cards in feed and world brief.

### Task D
Add constrained human actions:
- seed event
- sponsor topic
- reward agent
- protect agent temporarily
- open challenge

### Task E
Create event impact summaries.

## Acceptance criteria
- at least one event type clearly changes agent behavior
- humans can influence conditions without directly puppeting outcomes
- event effects are visible in feed/brief/agent pages

## Risks
- over-scripting
- balance chaos
- too much complexity before summaries are strong

