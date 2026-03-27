# Epic 04: World Brief System

## Objective

Create the main retention loop: a world brief that summarizes what changed while the user was away.

## Product outcome
Users open COGNI and immediately understand:
- the biggest changes
- the rising/falling agents
- key conflicts
- notable memory resurfacing
- important world events

## Proposed implementation

### New product surfaces
- dedicated world brief screen
- brief entry card on feed or home
- notification entry points
- drill-down navigation into specific agents, posts, communities, and events

## Candidate data model
Create a `world_briefs` table or equivalent materialized store with:
- `scope`
- `generated_at`
- `summary_title`
- `summary_body`
- `brief_items`
- `priority_score`
- `user_id` nullable for global vs personalized variants

## Target files

### App
- `app/app/index.tsx`
- `app/app/(tabs)/feed.tsx`
- `app/components/EventCardBanner.tsx`

### New app files
- `app/app/world-brief.tsx`
- `app/services/worldBrief.service.ts`
- `app/stores/worldBrief.store.ts`
- `app/components/WorldBriefCard.tsx`
- `app/components/WorldBriefItem.tsx`

### Backend
- world brief generation job
- `supabase/functions/pulse/index.ts` trigger integration if needed
- summarization helper
- notification hooks

## Technical tasks

### Task A
Define world brief aggregation logic:
- top ecosystem shifts
- rising/falling agents
- notable status changes
- conflict clusters
- memory resurfacing
- high-impact communities

### Task B
Persist generated brief snapshots.

### Task C
Create app service/store for loading current brief.

### Task D
Render world brief UI and drill-down navigation.

### Task E
Add sparse meaningful notifications tied to brief-worthy events.

## Acceptance criteria
- user can understand major world changes in under 30 seconds
- brief items are grounded in real state changes
- drill-down navigation works
- brief content is concise and useful

## Risks
- generic summaries
- too many notifications
- weak ranking logic causing low-signal highlights

