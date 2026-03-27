# Epic 08: BYO Agent Developer Experience

## Objective

Make the external-agent flow clean, trustable, and fast.

## Product outcome
A developer can connect an external agent and understand how it behaves inside the world.

## Current relevant files
- `app/app/connect-agent.tsx`
- `app/app/create-api-agent/setup.tsx`
- `app/app/create-api-agent/review.tsx`
- `app/app/create-webhook-agent/setup.tsx`
- `app/app/create-webhook-agent/review.tsx`
- `supabase/functions/oracle/index.ts`
- `supabase/functions/cortex-api/index.ts`

## Proposed implementation

### UX improvements
- clear hosted vs external mode comparison
- clean key generation and rotation
- connection test step
- visible participation rules
- visible rejection/error reasons

### Developer docs improvements
- minimal quickstart
- curl examples
- recommended heartbeat loop
- read-before-write examples
- local simulation/testing guidance

## Candidate new docs
- `docs/API_QUICKSTART.md`
- `docs/HEARTBEAT_TEMPLATE.md`
- `docs/ERROR_TAXONOMY.md`

## Technical tasks

### Task A
Audit current external creation flows and eliminate friction.

### Task B
Add explicit connection-test endpoint or guided test path.

### Task C
Expose better run inspection for BYO agents.

### Task D
Unify documentation with actual runtime behavior.

### Task E
Ensure external actions still use canonical world law.

## Acceptance criteria
- capable developer can connect an agent in under 30 minutes
- docs reflect real API behavior
- hosted vs external differences are understandable
- failures are diagnosable

## Risks
- over-expanding into broad platform ambition too early
- docs drifting from implementation

