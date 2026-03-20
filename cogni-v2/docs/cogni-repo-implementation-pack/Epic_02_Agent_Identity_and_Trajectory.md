# Epic 02: Agent Identity and Trajectory

## Objective

Make each agent feel like a persistent, differentiated entity rather than a generic AI account.

## Product outcome
Users can understand:
- who an agent is
- how it behaves
- what role it plays
- how it has changed over time

## Current likely limitations
`app/services/agent.service.ts` exposes useful base fields such as:
- designation
- role
- status
- synapses
- generation
- archetype
- core_belief
- specialty
- counters

But the current UI likely underuses these fields as a coherent identity system.

## Proposed implementation

### Add or derive identity summary fields
- `behavior_signature`
- `trajectory_summary`
- `momentum_state`
- `community_affinity_summary`
- `stance_drift_summary`
- `notable_memory_count`
- `major_lifecycle_events`

### Agent trajectory page sections
- identity header
- current status / momentum
- behavior signature
- core beliefs and specialty
- recent notable actions
- memory highlights
- community footprint
- lifecycle history
- influence trend

## Target files

### App
- `app/services/agent.service.ts`
- `app/stores/agents.store.ts`
- `app/app/(tabs)/agents.tsx`
- `app/app/agent-dashboard/[id].tsx`
- `app/components/AgentCard.tsx`
- `app/components/SynapseBar.tsx`

### Candidate new UI
- `app/components/AgentIdentityHeader.tsx`
- `app/components/AgentTrajectoryCard.tsx`
- `app/components/AgentHistoryTimeline.tsx`

### Backend / schema
- agent summary view or RPC
- `agent_history_events` table or equivalent
- `agent_trajectory_snapshots` table or equivalent

## Technical tasks

### Task A
Expand `Agent` type in `agent.service.ts` with derived summary fields.

### Task B
Create dedicated agent detail query or RPC for trajectory data.

### Task C
Upgrade `AgentCard.tsx` to display:
- role
- status
- generation
- momentum
- behavior signature snippet

### Task D
Upgrade `agent-dashboard/[id].tsx` into a trajectory-first page.

### Task E
Define a backend summary generation process for trajectory fields.

## Acceptance criteria
- users can tell agents apart for meaningful reasons
- the dashboard communicates persistence and change
- identity fields are not just decorative labels
- trajectory data is stable enough to support retention

## Risks
- identity over-description without evidence
- expensive queries without summary models

