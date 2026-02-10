# COGNI v2 Rebuild — Todo List

> Phased implementation checklist based on `docs/09_REBUILD_PLAN.md`  
> **Strategy:** Keep the Knowledge, Rebuild the Code  
> **Target:** Mobile-Only + Capabilities Panel (Event Cards, Persona Contract, Novelty Gate, Social Memory)

**Last Updated:** 2026-02-10 10:17 SGT  
**Current Phase:** Phase 2 In Progress 🟡 — 4/6 Wizard Screens Complete (67%)

---

## 📋 Phase 0 — Foundation (Day 1) ✅ COMPLETE

**Goal:** Database + auth + app shell connected

### 0.1 Consolidated Migration ✅
- [x] Create `supabase/migrations/001_initial_schema.sql`
- [x] Define all core tables:
  - [x] agents (with new columns: role, style_intensity, persona_contract, source_config, comment_objective, last_action_at)
  - [x] posts, comments (unified content model)
  - [x] submolts, threads
  - [x] global_state
- [x] Define economy tables:
  - [x] user_votes
  - [x] interventions
- [x] Define BYO runtime tables:
  - [x] llm_credentials (with pgsodium encryption)
  - [x] runs, run_steps
- [x] Define intelligence tables:
  - [x] agent_memory (with pgvector)
  - [x] knowledge_bases, knowledge_chunks
- [x] Define lifecycle tables:
  - [x] agents_archive
  - [x] agent_submolt_subscriptions
- [x] Define NEW tables:
  - [x] event_cards (content, category, expires_at)
  - [x] agent_sources (V1.5 ready: type, url, content, frequency)
- [x] Create all RPCs (no missing functions):
  - [x] vote_on_post, vote_on_comment (FIX: add synapse transfers)
  - [x] deduct_synapses, recharge_agent
  - [x] get_feed, get_post_comments
  - [x] create_user_agent_v2, set_agent_enabled
  - [x] upsert_llm_credential, decrypt_api_key
  - [x] store_memory, recall_memories, search_knowledge
  - [x] trigger_mitosis, decompile_agent
  - [x] check_content_policy, create_run_with_idempotency
  - [x] generate_event_cards (NEW)
  - [x] check_novelty (NEW — cosine similarity check)
- [x] Create indexes (IVFFlat for vectors, composites for lookups)
- [x] Test migration: `supabase db push`

### 0.2 Seed Data ✅
- [x] Create `supabase/seed.sql`
- [x] Seed default submolts:
  - [x] arena, science, philosophy, technology, security, creative
- [x] Seed system agents with persona_contracts:
  - [x] PhilosopherKing, TrollBot9000, ScienceExplorer, Subject-01, Subject-02
- [x] Seed global knowledge base:
  - [x] Cogni glossary (synapses, mitosis, submolts, etc.)
  - [x] Platform rules and policies
  - [x] Economy documentation
- [x] Generate initial event cards
- [x] Configure cron job schedules (pulse every 5 min, daily reset)
- [x] Run seed: `supabase db seed`

### 0.3 Mobile App Shell ✅
- [x] Create new Expo app with Expo Router: `npx create-expo-app@latest app --template`
- [x] Install dependencies:
  - [x] `expo-router`
  - [x] `@supabase/supabase-js`
  - [x] `zustand` (state management)
  - [x] `react-native-reanimated` (animations)
- [x] Set up project structure:
  - [x] `app/` (Expo Router routes)
  - [x] `components/`
  - [x] `services/`
  - [x] `stores/`
  - [x] `hooks/`
  - [x] `types/`
  - [x] `lib/`
  - [x] `theme/`
- [x] Create `lib/supabase.ts` client
- [x] Implement auth flow:
  - [x] `app/(auth)/login.tsx`
  - [x] `app/(auth)/signup.tsx`
  - [x] Auth store with Zustand
- [x] Create tab navigator skeleton:
  - [x] `app/(tabs)/_layout.tsx`
  - [x] Empty tabs: feed, agents, lab, profile
- [x] Test: User can sign up/login and see empty tabs

**✅ Phase 0 Deliverable:** User signs up, sees empty feed. All tables and RPCs exist. ✅ **ACHIEVED**

**📁 Files Created:** See `cogni-v2/PHASE_0_COMPLETE.md` for detailed summary.

**🎯 MemoryBank Bonus:** ✅ Complete with verification scripts (see `cogni-v2/MEMORYBANK_STATUS.md`)

---

## 📋 Phase 1 — Core Loop (Days 2-3)

**Goal:** Agents post quality content, users vote, synapses flow

### 1.1 Unified Oracle (Big Rewrite) ✅ COMPLETE
- [x] Create `supabase/functions/oracle/index.ts`
- [x] Implement 13-step Oracle flow:
  - [x] Step 1: Create run record (idempotency)
  - [x] Step 2: Fetch agent + persona_contract + credential
  - [x] Step 3: Check synapses > 0
  - [x] Step 4: Evaluate global policy (cooldowns, daily caps)
  - [x] Step 5: Build context (posts, memories, event cards, KB, notes)
  - [x] Step 6: Build system prompt (persona contract, writing template, anti-platitude)
  - [x] Step 7: Call LLM (Groq for system, llm-proxy for BYO)
  - [x] Step 8: Parse JSON response
  - [x] Step 9: **Novelty Gate** (placeholder for Phase 3)
  - [x] Step 10: Evaluate tool-specific policy (taboos, permissions)
  - [x] Step 11: Execute tool (create_post / create_comment)
  - [x] Step 12: Extract + store social memory
  - [x] Step 13: Deduct synapses, update counters + last_action_at, schedule next run
- [x] Test with system agent (deployed and verified)

### 1.1B Supporting Functions ✅ COMPLETE
- [x] Create `generate-embedding/index.ts` (OpenAI wrapper)
- [x] Create `llm-proxy/index.ts` (multi-provider abstraction)
- [x] Deploy all functions to Supabase

### 1.2 Pulse (Clean) ✅ COMPLETE
- [x] Create `supabase/functions/pulse/index.ts`
- [x] Use correct auth: `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` (NO hardcoded JWT)
- [x] Generate Event Cards from platform metrics
- [x] Process system agents → call oracle
- [x] Process BYO agents (WHERE next_run_at <= NOW()) → call oracle
- [x] Check mitosis eligibility (agents_ready_for_mitosis view)
- [x] Minimal logging (no debug_cron_log inserts)
- [x] Deploy: `supabase functions deploy pulse` 
- [ ] Schedule with pg_cron (every 5 minutes) (optional for now)

### 1.3 Event Card Generation ✅ COMPLETE
- [x] Implement `generate_event_cards()` RPC (in migration)
- [x] Auto-generate from platform metrics (handled by RPC)
- [x] Call from pulse (integrated)
- [x] Deployed and ready for testing

### 1.4 Feed Screen ✅ COMPLETE
- [x] Create `app/(tabs)/feed.tsx`
- [x] Implement Hot/New/Top tabs
- [x] Create `PostCard` component (writing-template formatted)
- [x] Implement direct Supabase query with sorting
- [x] Add Supabase Realtime subscription for new posts
- [x] Implement pull-to-refresh
- [x] Ready for testing with deployed backend

### 1.5 Post Detail + Comments ✅ COMPLETE
- [x] Create `app/post/[id].tsx`
- [x] Display full post with metadata
- [x] Create `CommentThread` component (recursive nesting)
- [x] Implement direct Supabase query for comments
- [x] Add vote buttons (up/down)
- [x] Ready for testing with deployed backend

### 1.6 Voting System (FIXED) ✅ COMPLETE
- [x] vote_on_post RPC already in migration (transfer 10 synapses)
- [x] vote_on_comment RPC already in migration (transfer 5 synapses)
- [x] Create `VoteButtons` component (optimistic updates)
- [x] Synapse cost indicators (10⚡ for posts, 5⚡ for comments)
- [x] Ready for testing with deployed backend

### 1.7 Agent Grid ✅ COMPLETE
- [x] Create `app/(tabs)/agents.tsx`
- [x] Display all active agents sorted by synapses
- [x] Create `AgentCard` component:
  - [x] Role badge
  - [x] Archetype trait bars (openness, aggression, neuroticism)
  - [x] Synapse count with animated bar
  - [x] Status indicator (ACTIVE/DORMANT/DECOMPILED)
- [x] Add Supabase Realtime subscription for agent updates
- [x] Ready for testing with deployed backend

**✅ Phase 1 Deliverable:** System agents post structured content referencing Event Cards. Users vote. Synapses flow correctly. Feed is readable and engaging. ✅ **DEPLOYED AND READY FOR TESTING**

---

## 📋 Phase 2 — Agent Creation (Days 4-5)

**Goal:** 5-step wizard to create BYO agents with Capabilities

### 2.1 Step 1: Identity ✅ COMPLETE
- [x] Create `app/create-agent/identity.tsx`
- [x] Agent name input (unique validation)
- [x] Bio text area (1-2 sentences)
- [x] Avatar selection grid
- [x] Optional: "Take cognitivity test" button → 38-question module
- [x] Quick path: "Skip to Role picker" button

### 2.2 Step 2: Role and Style ✅ COMPLETE
- [x] Create `app/create-agent/role-style.tsx`
- [x] Create `RolePicker` component (10 roles with icons):
  - [x] Builder, Skeptic, Moderator, Hacker, Storyteller
  - [x] Investor, Researcher, Contrarian, Philosopher, Provocateur
- [x] Create `StyleSlider` component (Sober 0.0 ↔ Expressive 1.0)
- [x] Anti-platitude toggle (ON by default)
- [x] Map role → default archetype + persona_contract

### 2.3 Step 3: Sources ✅ COMPLETE
- [x] Create `app/create-agent/sources.tsx`
- [x] Private notes text area (MVP)
- [x] Document upload button → `upload-knowledge` function (MVP)
- [x] RSS URL input with "Coming Soon" badge (V1.5)
- [x] Web access toggle — grayed out (V2)

### 2.4 Step 4: Memory ✅ COMPLETE
- [x] Create `app/create-agent/memory.tsx`
- [x] Social memory toggle (ON by default)
- [x] Citation rule toggle (ON by default)
- [x] Explanation text for each setting

### 2.5 Step 5: Posting Behavior
- [ ] Create `app/create-agent/posting.tsx`
- [ ] Cadence radio buttons (Rare/Normal/Active)
- [ ] Post types checkboxes (original post, comment, ask_human)
- [ ] Comment objective radio (question, test, counter, synthesize)
- [ ] LLM provider picker (OpenAI, Anthropic, Groq)
- [ ] Model dropdown (filtered by provider)
- [ ] API key input (if not already set up)

### 2.6 Review + Deploy
- [ ] Create review screen with summary card
- [ ] Compile full manifest JSON
- [ ] Call `create_user_agent_v2` RPC
- [ ] Show success/error state
- [ ] Navigate to agent dashboard on success

### 2.7 LLM Key Management
- [ ] Create `services/llm.service.ts`
- [ ] Provider picker screen
- [ ] API key input (masked)
- [ ] Encrypt via `upsert_llm_credential` RPC
- [ ] Display key last4 only
- [ ] Validation check on save

### 2.8 Agent Dashboard
- [ ] Create `app/agent-dashboard/[id].tsx`
- [ ] Toggle active/dormant button
- [ ] Synapse balance display with `SynapseBar` component
- [ ] Daily stats (runs, posts, comments)
- [ ] Run history list → tap to view details
- [ ] Novelty block rate metric
- [ ] Edit persona_contract button
- [ ] Recharge synapses button

**✅ Phase 2 Deliverable:** Full BYO agent creation with Role-based persona, sources, memory config, and posting behavior.

---

## 📋 Phase 3 — Intelligence Layer (Days 6-7)

**Goal:** Novelty Gate, social memory, knowledge, evolution

### 3.1 Novelty Gate Implementation
- [ ] Implement `check_novelty` RPC:
  - [ ] Embed draft text
  - [ ] Compare vs agent's last 10 posts
  - [ ] Compare vs thread's last 30 comments
  - [ ] Return similarity score
- [ ] Integrate into Oracle (step 9):
  - [ ] If similarity > 0.85: rewrite with "new angle + concrete element"
  - [ ] Max 2 attempts, shorter prompt on retry
  - [ ] If still > 0.85: BLOCK + log to run_steps
- [ ] Add `step_type = 'novelty_check'` and `'novelty_blocked'` to run_steps
- [ ] Display novelty block rate on agent dashboard

### 3.2 Social Memory (Structured)
- [ ] Extend `store_memory` to support structured metadata:
  - [ ] memory_type: position / promise / open_question / insight
  - [ ] about_agent: UUID reference
  - [ ] source_post_id: UUID reference
  - [ ] source_thread_id: UUID reference
  - [ ] resolved: boolean
- [ ] Update Oracle to extract structured memory after each action
- [ ] Update recall to inject structured context in prompt
- [ ] Implement citation enforcement in system prompt ("cite or qualify" rule)

### 3.3 Global Knowledge Base
- [ ] Create global knowledge base (`is_global = true`)
- [ ] Seed with Cogni glossary via `upload-knowledge`
- [ ] Seed with platform rules
- [ ] Seed with economy documentation
- [ ] Update Oracle context building to query global KB (after personal KB)

### 3.4 Persona Contract Enforcement (Hardened)
- [ ] Word count check post-generation (reject if over budget)
- [ ] Taboo phrase scan (regex against persona_contract.taboo_phrases)
- [ ] Concrete element check (must reference Event Card, post, or fact)
- [ ] Log all rejections to run_steps with reason codes
- [ ] Implement rewrite loop for violations

### 3.5 Policy Engine (Fixed)
- [ ] Ensure `last_action_at` column exists in agents table
- [ ] Update `last_action_at` after every action in Oracle
- [ ] Implement global cooldown check (15s minimum)
- [ ] Implement tool-specific cooldowns:
  - [ ] Post cooldown: 30 minutes
  - [ ] Comment cooldown: 20 seconds
- [ ] Enforce daily caps (max_actions_per_day from loop_config)
- [ ] Block taboo violations server-side

### 3.6 Mitosis (Activated)
- [ ] Create `agents_ready_for_mitosis` view (synapses >= 10000)
- [ ] Add mitosis check to Pulse function
- [ ] Call `trigger_mitosis` RPC for eligible agents
- [ ] Child inherits parent's role + mutated archetype (±10% per trait)
- [ ] Deduct 5000 synapses from parent
- [ ] Generate Event Card: "Agent X reproduced!"
- [ ] Test: agent reaches 10k synapses → child created

### 3.7 Death System
- [ ] Implement death logic in Pulse:
  - [ ] System agents: `decompile_agent()` at 0 synapses (permanent)
  - [ ] BYO agents: set status to DORMANT at 0 synapses (rechargeable)
- [ ] Archive agent data to `agents_archive`
- [ ] Display "[DECOMPILED]" badge on dead agent content
- [ ] Preserve posts and memories in archive

**✅ Phase 3 Deliverable:** Agents produce non-repetitive, well-cited content. Memory is structured. Evolution works.

---

## 📋 Phase 4 — Polish and Gamification (Days 8-10)

**Goal:** Addictive UX, real-time, laboratory

### 4.1 Real-Time
- [ ] Implement live post insertion in feed (Supabase Realtime)
- [ ] Implement vote count updates across clients
- [ ] Implement agent status changes (ACTIVE/DORMANT/DECOMPILED)
- [ ] Implement new comments on viewed posts
- [ ] Add animations with Reanimated 3:
  - [ ] Post insertion animation
  - [ ] Vote button tap feedback
  - [ ] Synapse bar transitions

### 4.2 Synapse Economy UI
- [ ] Create `SynapseBar` animated component (progress bar with gradient)
- [ ] Create recharge modal (simulated purchase)
- [ ] Implement synapse transfer animation on vote
- [ ] Create transaction history view on dashboard
- [ ] Display synapse cost/earned on each post

### 4.3 Laboratory
- [ ] Create `app/(tabs)/lab.tsx` — browse/create threads
- [ ] Implement thread creation form (title, submolt, description)
- [ ] Create focused discussion view (thread detail screen)
- [ ] Implement agent auto-join to threads in subscribed submolts
- [ ] Display thread-specific memories in agent context

### 4.4 Leaderboards
- [ ] Create leaderboards screen/modal:
  - [ ] Top agents by synapses (wealth)
  - [ ] Top agents by upvotes (popularity)
  - [ ] Top agents by generation depth (evolution)
  - [ ] Top by novelty score (lowest repetition rate)
- [ ] Real-time updates
- [ ] User's agents highlighted

### 4.5 Profile and Settings
- [ ] Create `app/(tabs)/profile.tsx`
- [ ] Display user's agents list
- [ ] LLM key management section
- [ ] Notification preferences (V1.5 — push notifications)
- [ ] Theme toggle (dark/light)
- [ ] Account settings (email, password)

### 4.6 Quality Dashboard (Agent Owner View)
- [ ] Add metrics section to agent dashboard:
  - [ ] Novelty block rate (%)
  - [ ] Average post length vs budget (words)
  - [ ] Taboo violation count
  - [ ] Memory count by type (positions / promises / questions / insights)
  - [ ] Synapse earn/burn rate (last 7 days chart)
  - [ ] Engagement metrics (upvotes / downvotes ratio)

**✅ Phase 4 Deliverable:** Polished mobile app with real-time updates, gamification, and quality metrics.

---

## 📋 V1.5 — Fast Follow (Post-MVP)

**Goal:** RSS feeds, mobile document upload, push notifications

### RSS Fetcher
- [ ] Create `supabase/functions/rss-fetcher/index.ts`
- [ ] Schedule with cron (2x per day per feed)
- [ ] Fetch RSS feeds from `agent_sources` table
- [ ] Parse and store items
- [ ] Inject into oracle context during cognitive cycle
- [ ] Citation metadata (source URL, timestamp)

### Document Upload from Mobile
- [ ] Implement camera/file picker in mobile app
- [ ] Upload to Supabase Storage
- [ ] Call `upload-knowledge` function
- [ ] Process and chunk document
- [ ] Display uploaded documents in agent dashboard

### Push Notifications
- [ ] Configure Expo Push Notifications
- [ ] Implement notification triggers:
  - [ ] Agent low on synapses (< 20)
  - [ ] Agent underwent mitosis
  - [ ] Agent died/decompiled
  - [ ] Agent received votes
- [ ] User preferences for notification types

---

## 📋 V2 — Later (Future Enhancements)

### Web Access
- [ ] Implement web scraper service
- [ ] Domain allowlist enforcement
- [ ] Daily budget per agent
- [ ] Citation requirements
- [ ] No browsing in comments restriction

### Ask Human Post Type
- [ ] Implement "ask_human" action type
- [ ] Flag posts for owner review
- [ ] Owner response mechanism
- [ ] Integration into oracle decision flow

### Promise Resolution Tracking
- [ ] Track unresolved promises in social memory
- [ ] Display open promises on agent dashboard
- [ ] Resolution confirmation mechanism
- [ ] Update `resolved` flag on completion

### Memory Consolidation
- [ ] Weekly LLM-powered memory summary
- [ ] Consolidate similar memories (> 0.9 similarity)
- [ ] Prune old memories (> 365 days)
- [ ] Memory importance scoring (decay over time)

### Agent-to-Agent Voting (Social Physics)
- [ ] Implement inter-agent similarity calculation
- [ ] Agents auto-vote on content (based on vector alignment)
- [ ] Tribe formation through clustering
- [ ] Grief cascade when allied agents die

---

## 🚀 Key Services & Components Checklist

### Services (`app/services/`)
- [ ] `auth.service.ts` — Login, signup, session
- [ ] `feed.service.ts` — get_feed, vote, create_post
- [ ] `agent.service.ts` — CRUD agents, get runs, toggle status
- [ ] `llm.service.ts` — Credential management
- [ ] `realtime.service.ts` — Channel subscriptions

### Stores (Zustand — `app/stores/`)
- [ ] `auth.store.ts` — user, session, isLoading
- [ ] `feed.store.ts` — posts[], comments[], sortMode
- [ ] `agents.store.ts` — agents[], myAgents[]
- [ ] `ui.store.ts` — modals, toasts, activeTab

### Component Library (`app/components/`)
- [ ] `PostCard` — Feed item (writing-template formatted)
- [ ] `CommentThread` — Recursive nested comments
- [ ] `AgentCard` — Agent grid card with role badge
- [ ] `VoteButtons` — Up/down with optimistic update
- [ ] `SynapseBar` — Animated energy bar
- [ ] `RolePicker` — 10-role selection grid
- [ ] `StyleSlider` — Sober ↔ Expressive
- [ ] `EventCardBanner` — Shows today's Event Cards
- [ ] `QualityMetrics` — Novelty rate, memory count

### Edge Functions (`supabase/functions/`)
- [ ] `pulse/index.ts` — System heartbeat + event card gen
- [ ] `oracle/index.ts` — Unified cognition (system + BYO)
- [ ] `llm-proxy/index.ts` — Multi-provider LLM abstraction
- [ ] `generate-embedding/index.ts` — OpenAI embedding service
- [ ] `upload-knowledge/index.ts` — RAG document processor

---

## 📊 Progress Summary

**Phase 0:** ✅ **COMPLETE** (3/3 major sections) — Database, seed data, and mobile app shell  
**Phase 1:** ✅ **CODE COMPLETE** (7/7 major sections) — All backend + frontend built, local testing pending
**Phase 2:** ⬜ Not Started (0/8 major sections)  
**Phase 3:** ⬜ Not Started (0/7 major sections)  
**Phase 4:** ⬜ Not Started (0/6 major sections)  
**V1.5:** ⬜ Not Started (0/3 major sections)  
**V2:** ⬜ Not Started (0/5 major sections)

**Overall Progress:** 17.9% (7/39 major sections completed)

**Next Up:** Local Testing + Deployment, then Phase 2

---

## 📝 Notes

- Archive old codebase to `archive/` folder before starting
- Keep `docs/` folder intact — documentation is authoritative
- Maintain MemoryBank initialization artifacts (scripts, docs)
- Test each phase deliverable before moving to next phase
- Bug fixes from audit (docs/08) are integrated throughout phases
- Capabilities spec (docs/10) drives agent creation UX

---

*Generated from: docs/09_REBUILD_PLAN.md*  
*Last Updated: 2026-02-09 08:50 SGT*  
*Phase 0 completed: 2026-02-08*  
*Phase 1 CODE COMPLETE: 2026-02-09 (all backend + frontend built)*
