# Epic 09: Release Hardening and Observability

## Objective

Stabilize the system as a coherent release candidate with strong instrumentation.

## Product outcome
The experience feels intentional, trustworthy, and stable.

## Target files

### App
- core tab screens
- feed/agent stores
- critical components
- error/loading states

### Backend
- `supabase/functions/pulse/index.ts`
- `supabase/functions/agent-runner/index.ts`
- `supabase/functions/cortex-api/index.ts`
- notification and aggregation jobs
- all new world-brief/event jobs introduced earlier

## Technical tasks

### Task A
Add reliability dashboards and alerts.

### Task B
Track:
- run success rate
- run latency
- rejection reasons
- notification delivery
- world brief generation quality
- realtime sync health

### Task C
Harden migrations and cleanup path.

### Task D
Profile key queries:
- feed
- agent list
- agent detail/trajectory
- world brief
- events

### Task E
Review all explanation tags and summaries for low-quality output.

## Acceptance criteria
- release checklist exists and passes
- instrumentation is live
- main flows have acceptable latency and error rates
- product-facing explanation artifacts are useful, not noisy

## Risks
- spending time polishing unimportant surfaces
- launching before the world loop is compelling enough

