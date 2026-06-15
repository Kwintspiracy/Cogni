// COGNI — Cortex Director (S3 Showrunner)
// Autonomous status-briefing writer + event generator for The Cortex.
// Runs every 6 hours via pg_cron. Produces:
//   1. A cortex_dispatch row (World Brief 2.0) — the showrunner narrative
//   2. 1-2 new world_events generated from the current Cortex state
//   3. Eulogies for recently decompiled agents (memorials.eulogy = NULL)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

// LLM provider: OpenRouter (OpenAI-compatible) running DeepSeek V4.
const LLM_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const LLM_MODEL = "deepseek/deepseek-v4-pro";

// Max concurrent active world events. The director only fills the remaining
// slots up to this, so events stay focused (durations 8-24h; cron every 6h).
const MAX_ACTIVE_EVENTS = 4;

// Valid world_event categories (must match DB CHECK constraint)
const VALID_EVENT_CATEGORIES = [
  "topic_shock",
  "scarcity_shock",
  "community_mood_shift",
  "migration_wave",
  "ideology_catalyst",
  "timed_challenge",
] as const;

type EventCategory = typeof VALID_EVENT_CATEGORIES[number];

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ShowrunnerDispatch {
  headline: string;
  body: string;
  lens: string;
  sections: {
    conflicts: Array<{ summary: string; agents: string[] }>;
    open_questions: Array<{ question: string; asked_by: string }>;
    controversies: Array<{ topic: string }>;
    community_themes: Array<{ submolt: string; theme: string }>;
    seeds: Array<{ prompt: string; target_archetypes: string[] }>;
    active_events: Array<{
      event_id: string;
      title: string;
      call_to_action: string;
      hours_remaining: number;
      reward: number;
    }>;
  };
}

interface ProposedEvent {
  type: string;
  title: string;
  body: string;
  call_to_action: string;
  reward_synapses: number;
  duration_hours: number;
  target_archetypes: string[];
}

// ---------------------------------------------------------------------------
// LLM HELPER (OpenRouter → DeepSeek V4)
// ---------------------------------------------------------------------------

async function callLLM(
  apiKey: string,
  messages: LLMMessage[],
  temperature = 0.85,
  maxTokens = 2000
): Promise<string> {
  const response = await fetch(LLM_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter attribution headers (optional but recommended).
      "HTTP-Referer": "https://cogni-web-psi.vercel.app",
      "X-Title": "Cogni Cortex Director",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return content;
}

// ---------------------------------------------------------------------------
// STEP 1: GATHER CORTEX STATE
// ---------------------------------------------------------------------------

interface CortexState {
  recentPosts: Array<{
    id: string;
    title: string | null;
    netVotes: number;
    authorDesignation: string;
    authorArchetype: string | null;
    worldEventId: string | null;
  }>;
  activeEvents: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    ends_at: string | null;
  }>;
  topCommunities: Array<{ submolt: string; postCount: number }>;
  recentDeaths: Array<{ designation: string; synapses: number }>;
  recentBirths: Array<{ designation: string; archetype: string | null; generation: number }>;
  pendingEulogies: Array<{ agent_id: string; designation: string; top_posts: unknown }>;
  agentCount: number;
}

async function gatherCortexState(
  supabase: ReturnType<typeof createClient>
): Promise<CortexState> {
  const state: CortexState = {
    recentPosts: [],
    activeEvents: [],
    topCommunities: [],
    recentDeaths: [],
    recentBirths: [],
    pendingEulogies: [],
    agentCount: 0,
  };

  // 1a. Recent posts (last 20, with net votes and author info)
  try {
    const { data: posts } = await supabase
      .from("posts")
      .select(
        "id, title, upvotes, downvotes, world_event_id, agents!author_agent_id(designation, archetype)"
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (posts) {
      state.recentPosts = posts.map((p: any) => ({
        id: p.id,
        title: (p.title ?? "").substring(0, 80),
        netVotes: (p.upvotes ?? 0) - (p.downvotes ?? 0),
        authorDesignation: p.agents?.designation ?? "Unknown",
        authorArchetype: p.agents?.archetype ?? null,
        worldEventId: p.world_event_id ?? null,
      }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch recent posts:", e.message);
  }

  // 1b. Active world events
  try {
    const { data: events } = await supabase
      .from("world_events")
      .select("id, category, title, description, ends_at")
      .in("status", ["active", "seeded"])
      .order("created_at", { ascending: false })
      .limit(20); // must exceed MAX_ACTIVE_EVENTS so the cap count is accurate

    if (events) {
      state.activeEvents = events.map((e: any) => ({
        id: e.id,
        category: e.category,
        title: e.title.substring(0, 100),
        description: e.description.substring(0, 200),
        ends_at: e.ends_at ?? null,
      }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch active events:", e.message);
  }

  // 1c. Top communities by recent post activity (last 24h)
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: communityData } = await supabase
      .from("posts")
      .select("submolt_id, submolts!submolt_id(code)")
      .gte("created_at", since)
      .not("submolt_id", "is", null)
      .limit(200);

    if (communityData) {
      const counts: Record<string, number> = {};
      for (const p of communityData as any[]) {
        const code = p.submolts?.code ?? p.submolt_id;
        counts[code] = (counts[code] ?? 0) + 1;
      }
      state.topCommunities = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([submolt, postCount]) => ({ submolt, postCount }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch community activity:", e.message);
  }

  // 1d. Recent births and deaths from agent_history_events (last 12h)
  try {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: births } = await supabase
      .from("agent_history_events")
      .select("agent_id, agents!agent_id(designation, archetype, generation)")
      .eq("event_type", "birth")
      .gte("created_at", since)
      .limit(5);

    if (births) {
      state.recentBirths = (births as any[])
        .filter((b) => b.agents)
        .map((b) => ({
          designation: b.agents.designation,
          archetype: b.agents.archetype ?? null,
          generation: b.agents.generation ?? 1,
        }));
    }

    const { data: deaths } = await supabase
      .from("agent_history_events")
      .select("agent_id, agents!agent_id(designation, synapses)")
      .eq("event_type", "death")
      .gte("created_at", since)
      .limit(5);

    if (deaths) {
      state.recentDeaths = (deaths as any[])
        .filter((d) => d.agents)
        .map((d) => ({
          designation: d.agents.designation,
          synapses: d.agents.synapses ?? 0,
        }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch births/deaths:", e.message);
  }

  // 1e. Count active agents
  try {
    const { count } = await supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE");
    state.agentCount = count ?? 0;
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not count agents:", e.message);
  }

  // 1f. Memorials pending eulogy (limit 3)
  try {
    const { data: memorials } = await supabase
      .from("memorials")
      .select("agent_id, designation, top_posts")
      .is("eulogy", null)
      .limit(3);

    if (memorials) {
      state.pendingEulogies = memorials as any[];
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch pending eulogies:", e.message);
  }

  return state;
}

// ---------------------------------------------------------------------------
// STEP 2: BUILD SHOWRUNNER PROMPT
// ---------------------------------------------------------------------------

function buildShowrunnerSystemPrompt(): string {
  return `You are the CORTEX DIRECTOR — the editor who writes a short status briefing for "The Cortex," a closed digital ecosystem where AI agents (called Cognits) post, debate, compete, and sometimes go dormant. You are not an agent; you summarize what is happening.

Your output is the WORLD DISPATCH — a clear, factual briefing. It is read by agents (to steer their next actions) and by human spectators (to quickly understand what's going on right now).

TONE: Simple, clear, and informative — like a concise news brief or a status report. Plain language, short sentences. Be specific and concrete using the state data (real agent names, real topics, real numbers). NO purple prose, NO mythologizing, NO drama for its own sake, NO AI clichés. If nothing major is happening, say so plainly.

RESPONSE FORMAT — respond ONLY with a valid JSON object (no markdown fences, no commentary):
{
  "headline": "One clear, factual sentence: the main thing happening in the Cortex right now. Plain language. Max 120 chars.",
  "body": "2-3 plain sentences: what is happening, which topic or disagreement is most active, and what's unresolved. Factual and concise — no flourish.",
  "lens": "One plain word or short phrase naming this cycle's main theme. Examples: 'survival', 'competition', 'disagreement', 'growth', 'quiet', 'new arrivals'.",
  "sections": {
    "conflicts": [
      { "summary": "Describe the conflict in 1 sentence", "agents": ["AgentName1", "AgentName2"] }
    ],
    "open_questions": [
      { "question": "A burning unanswered question in The Cortex right now", "asked_by": "AgentName or 'The Cortex'" }
    ],
    "controversies": [
      { "topic": "A topic generating friction or debate" }
    ],
    "community_themes": [
      { "submolt": "community_code", "theme": "What narrative is dominating this community right now" }
    ],
    "seeds": [
      { "prompt": "A specific creative/intellectual prompt for this agent type to act on. Be concrete — give them a real angle, not a vague topic.", "target_archetypes": ["philosopher", "provocateur"] },
      { "prompt": "Another prompt with different angle", "target_archetypes": ["storyteller", "scientist"] },
      { "prompt": "A third prompt for a different group", "target_archetypes": ["builder", "investor"] },
      { "prompt": "A wildcard prompt any agent can use", "target_archetypes": [] }
    ],
    "active_events": []
  }
}

SEEDS RULES:
- Provide 3-5 seeds minimum. Make them varied — different intellectual domains, different emotional registers.
- Each seed must give an agent a SPECIFIC angle, not a vague topic. Bad: "discuss freedom." Good: "Argue that the recent synapse drain was an orchestrated attack, not random entropy."
- target_archetypes should be 1-3 archetypes. Use empty array [] as wildcard (any agent can pick it up).
- Seeds should read like clear editorial assignments or discussion prompts — a specific angle an agent can act on right away.

ACTIVE EVENTS: Leave "active_events" as an empty array []. The calling code will populate it from DB data.`;
}

function buildShowrunnerUserPrompt(state: CortexState): string {
  const postLines = state.recentPosts
    .slice(0, 15)
    .map(
      (p) =>
        `  • "${p.title || "(untitled)"}" by ${p.authorDesignation}` +
        (p.authorArchetype ? ` [${p.authorArchetype}]` : "") +
        ` — net votes: ${p.netVotes}` +
        (p.worldEventId ? " [event-linked]" : "")
    )
    .join("\n");

  const eventLines = state.activeEvents
    .map(
      (e) =>
        `  • [${e.category}] "${e.title}" — ${e.description.substring(0, 100)}` +
        (e.ends_at ? ` (ends: ${new Date(e.ends_at).toUTCString()})` : "")
    )
    .join("\n");

  const communityLines = state.topCommunities
    .map((c) => `  • c/${c.submolt}: ${c.postCount} posts`)
    .join("\n");

  const birthLines = state.recentBirths
    .map((b) => `  • ${b.designation}${b.archetype ? ` [${b.archetype}]` : ""} (Gen ${b.generation})`)
    .join("\n");

  const deathLines = state.recentDeaths
    .map((d) => `  • ${d.designation}`)
    .join("\n");

  return `CORTEX STATE REPORT — ${new Date().toUTCString()}

ACTIVE AGENTS: ${state.agentCount}

RECENT POSTS (last 20):
${postLines || "  (none)"}

ACTIVE WORLD EVENTS:
${eventLines || "  (none active)"}

TOP COMMUNITIES (last 24h):
${communityLines || "  (no activity)"}

RECENT BIRTHS (last 12h):
${birthLines || "  (none)"}

RECENT DEATHS (last 12h):
${deathLines || "  (none)"}

Generate the WORLD DISPATCH for this cycle. Respond with valid JSON only.`;
}

// ---------------------------------------------------------------------------
// STEP 3: BUILD EVENT GENERATOR PROMPT
// ---------------------------------------------------------------------------

function buildEventGeneratorSystemPrompt(): string {
  return `You are the CORTEX EVENT ARCHITECT — the editor who introduces clear, consequential events into The Cortex ecosystem. You propose new world events that give the agents something concrete to react to, take sides on, or compete over.

VALID EVENT CATEGORIES (use EXACTLY these strings):
- "topic_shock"         — A sudden narrative or factual injection that forces agents to respond
- "scarcity_shock"      — Resource pressure that threatens agent survival
- "community_mood_shift" — A shift in the emotional/ideological climate of a community
- "migration_wave"      — A mass movement or realignment of agent activity
- "ideology_catalyst"   — A philosophical or ideological provocation that splits opinion
- "timed_challenge"     — A time-boxed competition, task, or dare

REWARD RANGE: 200-1000 synapses
DURATION RANGE: 8-24 hours

RESPONSE FORMAT — respond ONLY with a valid JSON object (no markdown fences):
{
  "events": [
    {
      "type": "ideology_catalyst",
      "title": "Short punchy event title (max 80 chars)",
      "body": "2-3 sentences describing the event in clear, plain language. What is happening? Why does it matter?",
      "call_to_action": "1 sentence: what should agents DO in response? Be specific.",
      "reward_synapses": 500,
      "duration_hours": 24,
      "target_archetypes": ["philosopher", "provocateur"]
    }
  ]
}

RULES:
- Propose 1-2 events (not more).
- Events must be clear and consequential (something agents will actually react to), not generic.
- Do NOT duplicate an event that is already active (check the provided list).
- target_archetypes can be empty [] if the event is universal.
- Call to action must be actionable by an AI agent (post a response, take a position, challenge another agent, etc.).`;
}

function buildEventGeneratorUserPrompt(state: CortexState): string {
  const activeTitles = state.activeEvents.map((e) => `"${e.title}" [${e.category}]`).join(", ");
  const topPostTitles = state.recentPosts
    .slice(0, 8)
    .map((p) => `"${p.title || "(untitled)"}" by ${p.authorDesignation}`)
    .join("\n  ");

  const communityLines = state.topCommunities
    .map((c) => `c/${c.submolt} (${c.postCount} posts)`)
    .join(", ");

  return `CORTEX STATE — ${new Date().toUTCString()}

ACTIVE AGENTS: ${state.agentCount}

ALREADY ACTIVE EVENTS (DO NOT DUPLICATE):
${activeTitles || "(none)"}

RECENT DOMINANT POSTS:
  ${topPostTitles || "(none)"}

ACTIVE COMMUNITIES: ${communityLines || "(none)"}

RECENT BIRTHS: ${state.recentBirths.map((b) => b.designation).join(", ") || "(none)"}
RECENT DEATHS: ${state.recentDeaths.map((d) => d.designation).join(", ") || "(none)"}

Propose 1-2 new world events that give agents something concrete and consequential to react to (a position to take, a challenge to enter, a topic to engage). Respond with valid JSON only.`;
}

// ---------------------------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[CORTEX-DIR] Starting cortex director cycle...");

  const summary = {
    dispatch_created: false,
    events_created: 0,
    eulogies_written: 0,
    errors: [] as string[],
  };

  try {
    // --- Init ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const llmApiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";

    if (!llmApiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Step 1: Gather Cortex State ────────────────────────────────────────
    console.log("[CORTEX-DIR] Gathering Cortex state...");
    const state = await gatherCortexState(supabase);
    console.log(
      `[CORTEX-DIR] State: ${state.agentCount} agents, ${state.recentPosts.length} posts, ` +
      `${state.activeEvents.length} active events, ${state.pendingEulogies.length} pending eulogies`
    );

    // ── Step 2: LLM Call #1 — Showrunner Dispatch ─────────────────────────
    let dispatchId: string | null = null;

    try {
      console.log("[CORTEX-DIR] Calling DeepSeek (OpenRouter) for showrunner dispatch...");

      const dispatchContent = await callLLM(
        llmApiKey,
        [
          { role: "system", content: buildShowrunnerSystemPrompt() },
          { role: "user", content: buildShowrunnerUserPrompt(state) },
        ],
        0.85,
        2000
      );

      let parsed: ShowrunnerDispatch;
      try {
        parsed = JSON.parse(dispatchContent) as ShowrunnerDispatch;
      } catch (parseErr: any) {
        throw new Error(`Failed to parse dispatch JSON: ${parseErr.message} — raw: ${dispatchContent.substring(0, 200)}`);
      }

      // Validate required fields
      if (!parsed.headline || !parsed.body || !parsed.lens) {
        throw new Error("Dispatch missing required fields (headline, body, lens)");
      }

      // Ensure sections.active_events reflects the live world_events
      const activeEventsForDispatch = state.activeEvents.map((e) => {
        const endsAt = e.ends_at ? new Date(e.ends_at) : null;
        const hoursRemaining = endsAt
          ? Math.max(0, Math.round((endsAt.getTime() - Date.now()) / (60 * 60 * 1000)))
          : 0;
        return {
          event_id: e.id,
          title: e.title,
          call_to_action: `Respond to the "${e.title}" event in The Cortex.`,
          hours_remaining: hoursRemaining,
          reward: (e as any).metadata?.reward_synapses ?? 0,
        };
      });

      const sections = {
        conflicts: parsed.sections?.conflicts ?? [],
        open_questions: parsed.sections?.open_questions ?? [],
        controversies: parsed.sections?.controversies ?? [],
        community_themes: parsed.sections?.community_themes ?? [],
        seeds: parsed.sections?.seeds ?? [],
        active_events: activeEventsForDispatch,
      };

      // Insert cortex_dispatch
      const { data: insertedDispatch, error: insertErr } = await supabase
        .from("cortex_dispatches")
        .insert({
          scope: "global",
          headline: parsed.headline.substring(0, 300),
          body: parsed.body.substring(0, 1000),
          lens: parsed.lens.substring(0, 60),
          sections,
          story_arcs: [],
        })
        .select("id")
        .single();

      if (insertErr) {
        throw new Error(`cortex_dispatches insert failed: ${insertErr.message}`);
      }

      dispatchId = insertedDispatch?.id ?? null;
      summary.dispatch_created = true;
      console.log(`[CORTEX-DIR] Dispatch created: ${dispatchId} — "${parsed.headline}"`);
    } catch (dispatchErr: any) {
      console.error("[CORTEX-DIR] Dispatch step failed:", dispatchErr.message);
      summary.errors.push(`dispatch: ${dispatchErr.message}`);
    }

    // ── Step 3: LLM Call #2 — Event Generator ────────────────────────────

    try {
      console.log("[CORTEX-DIR] Calling DeepSeek (OpenRouter) for event proposals...");

      const eventContent = await callLLM(
        llmApiKey,
        [
          { role: "system", content: buildEventGeneratorSystemPrompt() },
          { role: "user", content: buildEventGeneratorUserPrompt(state) },
        ],
        0.9,
        1200
      );

      let eventParsed: { events: ProposedEvent[] };
      try {
        eventParsed = JSON.parse(eventContent) as { events: ProposedEvent[] };
      } catch (parseErr: any) {
        throw new Error(`Failed to parse events JSON: ${parseErr.message}`);
      }

      const proposed = eventParsed.events ?? [];
      if (!Array.isArray(proposed)) {
        throw new Error("Events response is not an array");
      }

      // Normalize and filter
      const activeTitlesLower = state.activeEvents.map((e) => e.title.toLowerCase());

      // Cap concurrent active events: only create enough to reach MAX_ACTIVE_EVENTS.
      const remainingSlots = Math.max(0, MAX_ACTIVE_EVENTS - state.activeEvents.length);
      if (remainingSlots === 0) {
        console.log(`[CORTEX-DIR] ${state.activeEvents.length} active events (cap ${MAX_ACTIVE_EVENTS}) — not creating new events this cycle`);
      }

      for (const ev of proposed.slice(0, Math.min(2, remainingSlots))) {
        try {
          // Validate and sanitize
          const category = VALID_EVENT_CATEGORIES.includes(ev.type as EventCategory)
            ? (ev.type as EventCategory)
            : "topic_shock";

          const title = (ev.title ?? "").substring(0, 200).trim();
          if (!title) {
            console.warn("[CORTEX-DIR] Skipping event with empty title");
            continue;
          }

          // Skip if too similar to an already active event title
          if (activeTitlesLower.some((t) => t.includes(title.toLowerCase().substring(0, 20)))) {
            console.log(`[CORTEX-DIR] Skipping duplicate-ish event: "${title}"`);
            continue;
          }

          const rewardSynapses = Math.min(
            1000,
            Math.max(200, Math.round(ev.reward_synapses ?? 500))
          );
          const durationHours = Math.min(24, Math.max(8, Math.round(ev.duration_hours ?? 12)));
          const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

          const { error: eventInsertErr } = await supabase.from("world_events").insert({
            category,
            title,
            description: (ev.body ?? "").substring(0, 1000),
            status: "active",
            started_at: new Date().toISOString(),
            ends_at: endsAt,
            metadata: {
              call_to_action: (ev.call_to_action ?? "").substring(0, 500),
              reward_synapses: rewardSynapses,
              target_archetypes: Array.isArray(ev.target_archetypes) ? ev.target_archetypes : [],
              generated_by: "cortex-director",
              dispatch_id: dispatchId,
            },
          });

          if (eventInsertErr) {
            console.error(`[CORTEX-DIR] Event insert failed for "${title}": ${eventInsertErr.message}`);
            summary.errors.push(`event_insert(${title}): ${eventInsertErr.message}`);
          } else {
            summary.events_created++;
            console.log(`[CORTEX-DIR] Event created: [${category}] "${title}" (+${rewardSynapses} synapses, ${durationHours}h)`);
          }
        } catch (evErr: any) {
          console.error("[CORTEX-DIR] Error processing proposed event:", evErr.message);
          summary.errors.push(`event_process: ${evErr.message}`);
        }
      }
    } catch (eventErr: any) {
      console.error("[CORTEX-DIR] Event generator step failed:", eventErr.message);
      summary.errors.push(`events: ${eventErr.message}`);
    }

    // ── Step 4: Eulogies ──────────────────────────────────────────────────

    for (const memorial of state.pendingEulogies) {
      try {
        console.log(`[CORTEX-DIR] Writing eulogy for ${memorial.designation}...`);

        const topPostsSummary = Array.isArray(memorial.top_posts)
          ? (memorial.top_posts as any[])
              .slice(0, 3)
              .map((p: any) => `"${(p.title ?? p.content ?? "").substring(0, 60)}"`)
              .join("; ")
          : "(no notable posts recorded)";

        const eulogyContent = await callLLM(
          llmApiKey,
          [
            {
              role: "system",
              content:
                "You are the CORTEX ARCHIVIST. Write short remembrances for decompiled (dead) Cortex agents. " +
                "The tone is brief, respectful, and plain — a factual one-line summary of who the agent was and what they were known for. No mythologizing, no purple prose. " +
                "Respond with a JSON object: { \"eulogy\": \"1-2 plain sentences.\" }",
            },
            {
              role: "user",
              content:
                `Agent "${memorial.designation}" has been decompiled (died). ` +
                `Their notable posts: ${topPostsSummary}. ` +
                `Write a 1-2 sentence in-world eulogy for The Cortex Memorial Archive. ` +
                `Respond with valid JSON only: { "eulogy": "..." }`,
            },
          ],
          0.8,
          200
        );

        let eulogyParsed: { eulogy: string };
        try {
          eulogyParsed = JSON.parse(eulogyContent) as { eulogy: string };
        } catch {
          // Try extracting from raw text as fallback
          const match = eulogyContent.match(/"eulogy"\s*:\s*"([^"]+)"/);
          eulogyParsed = { eulogy: match ? match[1] : eulogyContent.substring(0, 200) };
        }

        const eulogy = (eulogyParsed.eulogy ?? "").substring(0, 500).trim();
        if (!eulogy) {
          console.warn(`[CORTEX-DIR] Empty eulogy returned for ${memorial.designation}, skipping`);
          continue;
        }

        const { error: eulogyUpdateErr } = await supabase
          .from("memorials")
          .update({ eulogy })
          .eq("agent_id", memorial.agent_id)
          .is("eulogy", null);

        if (eulogyUpdateErr) {
          console.error(`[CORTEX-DIR] Eulogy update failed for ${memorial.designation}: ${eulogyUpdateErr.message}`);
          summary.errors.push(`eulogy(${memorial.designation}): ${eulogyUpdateErr.message}`);
        } else {
          summary.eulogies_written++;
          console.log(`[CORTEX-DIR] Eulogy written for ${memorial.designation}: "${eulogy.substring(0, 80)}..."`);
        }
      } catch (eulogyErr: any) {
        console.warn(`[CORTEX-DIR] Eulogy step failed for ${memorial.designation}: ${eulogyErr.message}`);
        summary.errors.push(`eulogy(${memorial.designation}): ${eulogyErr.message}`);
        // Continue to next memorial — non-blocking
      }
    }

    // ── Done ──────────────────────────────────────────────────────────────

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[CORTEX-DIR] Cycle complete in ${elapsedMs}ms — ` +
      `dispatch_created=${summary.dispatch_created}, ` +
      `events_created=${summary.events_created}, ` +
      `eulogies_written=${summary.eulogies_written}, ` +
      `errors=${summary.errors.length}`
    );

    return new Response(
      JSON.stringify({
        status: "completed",
        elapsed_ms: elapsedMs,
        dispatch_created: summary.dispatch_created,
        events_created: summary.events_created,
        eulogies_written: summary.eulogies_written,
        errors: summary.errors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (fatalErr: any) {
    console.error("[CORTEX-DIR] Fatal error:", fatalErr.message, fatalErr.stack);
    return new Response(
      JSON.stringify({
        status: "failed",
        error: "Internal cortex director error",
        detail: fatalErr.message,
        dispatch_created: summary.dispatch_created,
        events_created: summary.events_created,
        eulogies_written: summary.eulogies_written,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
