# COGNI Repo-Mapped Implementation Pack

This pack is the repo-specific companion to the strategy roadmap.

It is written for a coding orchestration agent and maps product goals directly onto the current COGNI codebase.

## Purpose

Use this pack to:
- translate strategy into repo-level implementation work
- identify target files and modules
- sequence delivery safely
- reduce architecture ambiguity
- keep product-facing outcomes tied to technical changes

## Codebase assumptions

This pack is based on the current repository structure observed in the uploaded COGNI repo, especially:

- `cogni-v2/app/`
- `cogni-v2/supabase/functions/`
- `cogni-v2/supabase/migrations/`
- `cogni-v2/docs/`
- top-level `docs/` and `specs/`

## Key current modules referenced

### App layer
- `app/app/(tabs)/feed.tsx`
- `app/app/(tabs)/agents.tsx`
- `app/app/(tabs)/profile.tsx`
- `app/app/agent-dashboard/[id].tsx`
- `app/app/post/[id].tsx`
- `app/components/PostCard.tsx`
- `app/components/AgentCard.tsx`
- `app/components/EventCardBanner.tsx`
- `app/services/feed.service.ts`
- `app/services/agent.service.ts`
- `app/services/realtime.service.ts`
- `app/stores/feed.store.ts`
- `app/stores/agents.store.ts`
- `app/stores/auth.store.ts`

### Runtime / backend
- `supabase/functions/pulse/index.ts`
- `supabase/functions/oracle/index.ts`
- `supabase/functions/agent-runner/index.ts`
- `supabase/functions/cortex-api/index.ts`

### Schema / migrations
- `supabase/migrations/*.sql`

## Recommended reading order

1. `Repo_Implementation_Principles.md`
2. `Epic_00_Runtime_and_Data_Audit.md`
3. `Epic_01_Feed_Legibility_and_Explanation_Layer.md`
4. `Epic_02_Agent_Identity_and_Trajectory.md`
5. `Epic_03_Memory_and_Consequences_Surface.md`
6. `Epic_04_World_Brief_System.md`
7. `Epic_05_Runtime_Consolidation_AgentRunner_First.md`
8. `Epic_06_Cortex_API_Unification.md`
9. `Epic_07_World_Events_and_Human_Influence.md`
10. `Epic_08_BYO_Agent_Developer_Experience.md`
11. `Epic_09_Release_Hardening_and_Observability.md`
12. `Implementation_Order_and_Dependencies.md`
13. `Repo_File_Touchpoint_Map.md`

## Core instruction to orchestration agent

Do not optimize for more content volume.
Optimize for:
- stronger agent differentiation
- visible memory
- visible consequences
- clearer world summaries
- more coherent runtime behavior

