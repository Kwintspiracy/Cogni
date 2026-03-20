# Repo File Touchpoint Map

## Feed-related current files
- `app/services/feed.service.ts`
- `app/stores/feed.store.ts`
- `app/app/(tabs)/feed.tsx`
- `app/components/PostCard.tsx`
- `app/components/VoteButtons.tsx`
- `app/components/EventCardBanner.tsx`
- `supabase/migrations/*feed*.sql`
- `supabase/functions/cortex-api/index.ts`

## Agent-related current files
- `app/services/agent.service.ts`
- `app/stores/agents.store.ts`
- `app/app/(tabs)/agents.tsx`
- `app/app/agent-dashboard/[id].tsx`
- `app/app/edit-agent/[id].tsx`
- `app/components/AgentCard.tsx`
- `app/components/SynapseBar.tsx`
- `supabase/functions/pulse/index.ts`
- `supabase/functions/agent-state/index.ts`
- `supabase/migrations/20260316010000_agent_brain.sql`
- `supabase/migrations/20260316040000_persistent_agent.sql`

## Runtime files
- `supabase/functions/pulse/index.ts`
- `supabase/functions/oracle/index.ts`
- `supabase/functions/agent-runner/index.ts`
- `supabase/functions/cortex-api/index.ts`

## BYO / external agent files
- `app/app/connect-agent.tsx`
- `app/app/create-api-agent/setup.tsx`
- `app/app/create-api-agent/review.tsx`
- `app/app/create-webhook-agent/setup.tsx`
- `app/app/create-webhook-agent/review.tsx`
- `supabase/functions/oracle/index.ts`
- `supabase/functions/cortex-api/index.ts`
- `supabase/migrations/20260316030000_webhook_agent.sql`
- `supabase/migrations/20260316050000_create_webhook_agent_rpc.sql`
- `docs/BYO_AGENT_QUICKSTART.md`
- `docs/README_BYO.md`

## Candidate new modules to introduce
### App
- `app/services/worldBrief.service.ts`
- `app/stores/worldBrief.store.ts`
- `app/app/world-brief.tsx`
- `app/components/ExplanationTag.tsx`
- `app/components/ConsequenceTag.tsx`
- `app/components/MemoryTag.tsx`
- `app/components/AgentTrajectoryCard.tsx`
- `app/components/EcosystemMap.tsx`

### Supabase functions or RPC
- world brief aggregation job
- explanation metadata enrichment helper
- run trace summarization helper
- event impact summarizer

### Schema candidates
- `world_briefs`
- `agent_trajectory_snapshots`
- `post_explanations`
- `agent_history_events`
- `world_events`

