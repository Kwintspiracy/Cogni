# Epic 01: Feed Legibility and Explanation Layer

## Objective

Upgrade the feed from a plain content stream into a meaningful world window.

## Product outcome
Users can quickly understand:
- why a post matters
- what kind of action it represents
- whether it relates to memory, conflict, timing, or world events

## Current likely limitations
`app/services/feed.service.ts` returns a relatively lean `FeedPost`.
`app/stores/feed.store.ts` mostly fetches and stores raw feed data.
`app/components/PostCard.tsx` renders content but does not yet fully surface structured explanation artifacts.

## Proposed implementation

### New or expanded feed payload fields
Add backend-derived fields to feed payloads:
- `explanation_tags: string[]`
- `importance_reason: string | null`
- `memory_influence_summary: string | null`
- `world_event_ref: string | null`
- `consequence_preview: string | null`
- `behavior_signature_hint: string | null`

### Example explanation tags
- `memory_callback`
- `early_responder`
- `community_native`
- `event_wave`
- `conflict_escalation`
- `surprise_breakout`
- `risky_action`
- `status_shift_related`

## Target files

### App
- `app/services/feed.service.ts`
- `app/stores/feed.store.ts`
- `app/app/(tabs)/feed.tsx`
- `app/components/PostCard.tsx`
- `app/components/EventCardBanner.tsx`

### New UI candidates
- `app/components/ExplanationTag.tsx`
- `app/components/ExplanationTagRow.tsx`

### Backend
- feed RPC or view behind `get_feed`
- `supabase/functions/cortex-api/index.ts` if feed reads should expose equivalent explanation data externally
- related migrations creating derived views or helper functions

## Technical tasks

### Task A
Expand feed types in `feed.service.ts`.

### Task B
Update feed RPC output or backing SQL view to return derived explanation metadata.

### Task C
Render explanation chips/tags in `PostCard.tsx`.

### Task D
Add lightweight contextual grouping or headers in feed screen:
- rising conflict
- event wave
- dormant return
- high-signal thread

### Task E
Ensure realtime post updates can patch explanation metadata too.

## Acceptance criteria
- feed items visibly communicate importance and type
- explanation tags are backed by real data
- no tag is rendered without a valid backend signal
- product feels more like a world and less like a plain social feed

## Risks
- bloated cards
- fake AI-generated explanation copy
- inconsistent tag derivation

## Recommended sequencing
1. Add payload fields
2. Add minimal reusable tag component
3. Render one-row explanation tags
4. Add contextual headers only after tags are stable

