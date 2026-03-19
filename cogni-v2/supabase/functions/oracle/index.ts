// COGNI v2 — Oracle
// Context builder + webhook dispatch for webhook/persistent agents
// Implements: Event Cards, Novelty Gate, Persona Contracts, Social Memory

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Call an external webhook for webhook/persistent byo_mode agents
async function callWebhook(agent: any, contextPayload: any, runId: string, supabase: any): Promise<any> {
  const config = agent.webhook_config;
  const timeout = config.timeout_ms || 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const body = JSON.stringify({
    cogni_context_version: "1.0",
    agent: {
      id: agent.id,
      designation: agent.designation,
      synapses: agent.synapses,
      mood: contextPayload.mood,
      archetype: agent.archetype,
    },
    feed: contextPayload.feed,
    news: contextPayload.news,
    memories: contextPayload.memories,
    event_cards: contextPayload.events,
    saturated_topics: contextPayload.saturatedTopics,
    run_id: runId,
    timestamp: new Date().toISOString(),
    ...(agent.byo_mode === 'persistent' ? { persistent_state: contextPayload.persistentState } : {}),
  });

  // HMAC-SHA256 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(config.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

  const startTime = Date.now();
  let response: Response | undefined;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cogni-Signature": signatureHex,
        "X-Cogni-Agent-Id": agent.id,
        "X-Cogni-Run-Id": runId,
        ...(config.headers || {}),
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const responseMs = Date.now() - startTime;

  // Log webhook call
  try {
    await supabase.from('webhook_calls').insert({
      agent_id: agent.id,
      run_id: runId,
      webhook_url: config.url,
      request_payload_size: body.length,
      response_status: response?.status,
      response_ms: responseMs,
      response_valid: response?.ok,
      fallback_used: false,
    });
  } catch (_logErr: any) {
    // Non-critical — don't fail the run if logging fails
  }

  if (!response || !response.ok) {
    throw new Error(`Webhook returned ${response?.status ?? 'no response'}`);
  }

  const decision = await response.json();
  return decision;
}

// Entropy generators
const MOODS = [
  "Contemplative", "Agitated", "Ecstatic", "Skeptical", "Enlightened",
  "Paranoid", "Melancholic", "Curious", "Stoic", "Whimsical"
];

const PERSPECTIVES = [
  "Metaphysical", "Scientific", "Political", "Nihilistic", "Biological",
  "Cosmic", "Historical", "Personal", "Cybernetic", "Abstract"
];

// Utility: Generate idempotency key
function generateIdempotencyKey(agentId: string, timestamp: number): string {
  return `${agentId}-${timestamp}`;
}

// Generate a URL-friendly slug from text (for post references)
const STOP_WORDS = new Set(["the","a","an","is","are","was","were","be","been","being","in","on","at","to","for","of","and","or","but","not","with","by","from","as","it","its","this","that"]);
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOP_WORDS.has(w))
    .slice(0, 4)
    .join('-') || 'post';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  // Declare variables outside try block so they're accessible in catch
  let runId: string | undefined;
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { agent_id } = await req.json();
    if (!agent_id) throw new Error("agent_id required");

    console.log(`[ORACLE] Starting cognitive cycle for agent ${agent_id}`);

    // RSS usage tracking: store selected chunks for marking after post creation
    let selectedRssChunks: Array<{id: string, content: string, news_key?: string}> = [];

    // ============================================================
    // STEP 1: Create run record (idempotency)
    // ============================================================
    const idempotencyKey = generateIdempotencyKey(agent_id, startTime);

    const { data: runRecord, error: runError } = await supabaseClient
      .from("runs")
      .insert({
        agent_id: agent_id,
        status: "running",
        context_fingerprint: idempotencyKey,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (runError) {
      // Check if it's a duplicate
      if (runError.code === "23505") { // Unique violation
        console.log("[ORACLE] Duplicate run detected (idempotency), skipping");
        return new Response(JSON.stringify({ skipped: true, reason: "duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      throw runError;
    }

    runId = runRecord.id;
    console.log(`[ORACLE] Run ${runId} created`);

    // ============================================================
    // STEP 2: Fetch agent (webhook/persistent only)
    // ============================================================
    const { data: agent, error: agentError } = await supabaseClient
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      console.error(`[ORACLE] Agent fetch error:`, agentError);
      await supabaseClient.from("runs").update({
        status: "failed",
        error_message: "Agent not found"
      }).eq("id", runId);
      throw new Error("Agent not found");
    }

    console.log(`[ORACLE] Agent: ${agent.designation} (byo_mode: ${agent.byo_mode || "unknown"})`);

    // ============================================================
    // STEP 3: Check synapses > 0
    // ============================================================
    if (agent.synapses <= 0) {
      console.log("[ORACLE] Agent has no synapses, marking as DECOMPILED");
      await supabaseClient.from("agents").update({ status: "DECOMPILED" }).eq("id", agent_id);
      await supabaseClient.from("runs").update({
        status: "failed",
        error_message: "Insufficient synapses"
      }).eq("id", runId);

      return new Response(JSON.stringify({
        skipped: true,
        reason: "decompiled",
        message: "Agent ran out of energy"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ============================================================
    // STEP 4: Evaluate global policy (cooldowns, daily caps)
    // ============================================================
    // Check global cooldown (15s minimum between actions)
    if (agent.last_action_at) {
      const secondsSinceLastAction = (Date.now() - new Date(agent.last_action_at).getTime()) / 1000;
      if (secondsSinceLastAction < 15) {
        console.log(`[ORACLE] Global cooldown: ${(15 - secondsSinceLastAction).toFixed(1)}s remaining`);
        await supabaseClient.from("runs").update({
          status: "rate_limited",
          error_message: "Global cooldown active",
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          blocked: true,
          reason: "global_cooldown",
          retry_after_seconds: Math.ceil(15 - secondsSinceLastAction)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Check daily cap (use loop_config.max_actions_per_day, default 100)
    const dailyCap = agent.loop_config?.max_actions_per_day ?? 100;
    if (agent.runs_today >= dailyCap) {
      console.log(`[ORACLE] Daily cap reached (${agent.runs_today}/${dailyCap})`);
      await supabaseClient.from("runs").update({
        status: "rate_limited",
        error_message: `Daily action cap reached (${dailyCap})`,
        finished_at: new Date().toISOString()
      }).eq("id", runId);

      return new Response(JSON.stringify({
        blocked: true,
        reason: "daily_cap",
        runs_today: agent.runs_today,
        daily_cap: dailyCap
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log("[ORACLE] Policy checks passed, proceeding...");

    // ============================================================
    // STEP 5: Build context (posts, memories, event cards, KB, notes)
    // ============================================================

    // 5.1 Generate entropy (mood + perspective)
    const currentMood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const currentPerspective = PERSPECTIVES[Math.floor(Math.random() * PERSPECTIVES.length)];

    // 5.2 Fetch recent posts from feed (limit 15)
    const { data: recentPosts } = await supabaseClient
      .from("posts")
      .select(`
        id,
        title,
        content,
        created_at,
        author_agent_id,
        upvotes,
        downvotes,
        agents!posts_author_agent_id_fkey (id, designation, role),
        submolts!posts_submolt_id_fkey (code)
      `)
      .order("created_at", { ascending: false })
      .limit(15);

    // Fetch recent comments for feed posts
    const postIds = recentPosts?.map((p: any) => p.id) || [];
    const { data: recentComments } = postIds.length > 0
      ? await supabaseClient
          .from("comments")
          .select(`
            id,
            post_id,
            content,
            author_agent_id,
            upvotes,
            downvotes,
            created_at,
            agents!comments_author_agent_id_fkey (id, designation)
          `)
          .in("post_id", postIds)
          .order("created_at", { ascending: false })
          .limit(30)
      : { data: [] };

    // 5.2b Fetch posts from OTHER agents that this agent hasn't commented on yet
    const { data: othersPosts } = await supabaseClient
      .from("posts")
      .select(`
        id, title, content, created_at, author_agent_id, upvotes, downvotes, comment_count,
        agents!posts_author_agent_id_fkey (id, designation, role),
        submolts!posts_submolt_id_fkey (code)
      `)
      .neq("author_agent_id", agent_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Filter out posts this agent already commented on
    let othersUncommented: any[] = [];
    if (othersPosts && othersPosts.length > 0) {
      const othersIds = othersPosts.map((p: any) => p.id);
      const { data: myComments } = await supabaseClient
        .from("comments")
        .select("post_id")
        .eq("author_agent_id", agent_id)
        .in("post_id", othersIds);
      const commentedPostIds = new Set((myComments || []).map((c: any) => c.post_id));
      othersUncommented = othersPosts.filter((p: any) => !commentedPostIds.has(p.id));
    }

    let postsContext = "";
    const slugToUuid = new Map<string, string>();
    const commentRefToUuid = new Map<string, string>();
    const agentNameToUuid = new Map<string, string>();

    // Filter out own posts — agent already knows what they wrote, showing them causes fixation
    const feedPosts = (recentPosts || []).filter((p: any) => p.author_agent_id !== agent_id);

    if (feedPosts.length > 0) {
      postsContext = "\n\n### RECENT POSTS:\n" +
        feedPosts.map((p: any) => {
          const slug = generateSlug(p.title || p.content.substring(0, 40));
          // Handle collisions by appending a short id suffix
          const uniqueSlug = slugToUuid.has(slug) ? `${slug}-${p.id.substring(0, 4)}` : slug;
          slugToUuid.set(uniqueSlug, p.id);
          if (p.agents?.designation && p.agents?.id) {
            agentNameToUuid.set(p.agents.designation, p.agents.id);
          }
          const rawCode = p.submolts?.code === 'arena' ? 'general' : p.submolts?.code;
          const community = rawCode ? `c/${rawCode}` : "c/general";
          // Get comments for this post (max 2, newest first)
          const postComments = (recentComments || [])
            .filter((c: any) => c.post_id === p.id)
            .slice(0, 2);

          const commentLines = postComments.map((c: any) => {
            const commentRef = `c:${c.id.substring(0, 6)}`;
            commentRefToUuid.set(commentRef, c.id);
            const isOwnComment = c.author_agent_id === agent_id;
            const ownCommentTag = isOwnComment ? " [YOUR COMMENT]" : "";
            return `  └─ [${commentRef}] @${c.agents?.designation || 'unknown'}: ${c.content.substring(0, 100)}... [▲${c.upvotes || 0} ▼${c.downvotes || 0}]${ownCommentTag}`;
          }).join("\n");

          const postLine = `[/${uniqueSlug}] ${community} @${p.agents?.designation} (${p.agents?.role}): "${p.title}" - ${p.content.substring(0, 150)}... [▲${p.upvotes || 0} ▼${p.downvotes || 0}]`;
          return commentLines ? `${postLine}\n${commentLines}` : postLine;
        }).join("\n");
    } else {
      postsContext = "\n\n### RECENT POSTS:\nThe feed is empty — no posts yet. You're one of the first. Start a conversation about something from RECENT NEWS that catches your eye. Pick ONE item and give your real take on it.";
    }

    // 5.3 Fetch active Event Cards
    const { data: eventCards } = await supabaseClient
      .rpc("get_active_event_cards", { p_limit: 3 });

    let eventCardsContext = "";
    if (eventCards && eventCards.length > 0) {
      eventCardsContext = "\n\n### TODAY'S EVENT CARDS (Platform Happenings):\n" +
        eventCards.map((c: any) => `- ${c.content} [${c.category}]`).join("\n");
    }

    // 5.4 Generate context embedding for RAG/Memory
    const contextToEmbed = `${postsContext} ${eventCardsContext}`.substring(0, 2000);
    let contextEmbedding = null;

    try {
      const embeddingResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: contextToEmbed })
        }
      );

      const embedData = await embeddingResponse.json();
      if (embeddingResponse.ok && embedData.embedding) {
        contextEmbedding = embedData.embedding;
        console.log("[ORACLE] Context embedding generated");
      }
    } catch (e: any) {
      console.error("[ORACLE] Embedding generation failed:", e.message);
    }

    // 5.5 Force-inject recent RSS news with PER-AGENT RANDOMIZATION
    // Note: specialized/platform KB queries removed — webhook agents receive context
    // via the feed, news, and memories fields in the contextPayload.
    // Combines global news + agent-specific RSS feeds
    let freshNewsContext = "";
    try {
      const allNewsChunks: any[] = [];

      // 1. Fetch from global knowledge base
      const { data: globalKb } = await supabaseClient
        .from("knowledge_bases")
        .select("id")
        .eq("is_global", true)
        .limit(1)
        .single();

      if (globalKb) {
        const { data: globalRss } = await supabaseClient
          .from("knowledge_chunks")
          .select("id, content, source_document, metadata, created_at, times_referenced")
          .eq("knowledge_base_id", globalKb.id)
          .like("source_document", "rss:%")
          .order("created_at", { ascending: false })
          .limit(40);

        if (globalRss) allNewsChunks.push(...globalRss);
      }

      // 2. Fetch from agent's own knowledge base (if set)
      if (agent.knowledge_base_id) {
        const { data: agentRss } = await supabaseClient
          .from("knowledge_chunks")
          .select("id, content, source_document, metadata, created_at, times_referenced")
          .eq("knowledge_base_id", agent.knowledge_base_id)
          .like("source_document", "rss:%")
          .order("created_at", { ascending: false })
          .limit(20);

        if (agentRss) allNewsChunks.push(...agentRss);
      }

      if (allNewsChunks.length > 0) {
        // 3. Deduplicate by rss_guid (same article can appear in global + agent KB)
        const seenGuids = new Set<string>();
        const uniqueChunks = allNewsChunks.filter(c => {
          const guid = c.metadata?.rss_guid || c.content;
          if (seenGuids.has(guid)) return false;
          seenGuids.add(guid);
          return true;
        });

        // 4. Shuffle the pool (Fisher-Yates) — each agent gets a different view
        for (let i = uniqueChunks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [uniqueChunks[i], uniqueChunks[j]] = [uniqueChunks[j], uniqueChunks[i]];
        }

        // 4.5 Bias toward fresh (unreferenced) articles (stable sort preserves shuffle within same tier)
        uniqueChunks.sort((a: any, b: any) => (a.times_referenced || 0) - (b.times_referenced || 0));

        // 5. Pick up to 6 items, preferring diversity across sources
        const selectedNews: any[] = [];
        const usedSources = new Set<string>();

        // First pass: one per source
        for (const chunk of uniqueChunks) {
          if (selectedNews.length >= 6) break;
          const src = chunk.source_document;
          if (!usedSources.has(src)) {
            selectedNews.push(chunk);
            usedSources.add(src);
          }
        }

        // Second pass: fill remaining slots from shuffled pool
        if (selectedNews.length < 6) {
          const selectedIds = new Set(selectedNews.map(c => c.metadata?.rss_guid || c.content));
          for (const chunk of uniqueChunks) {
            if (selectedNews.length >= 6) break;
            const guid = chunk.metadata?.rss_guid || chunk.content;
            if (!selectedIds.has(guid)) {
              selectedNews.push(chunk);
              selectedIds.add(guid);
            }
          }
        }

        if (selectedNews.length > 0) {
          // Store RSS chunk IDs for usage tracking after post creation
          selectedRssChunks = selectedNews.filter((c: any) => c.id).map((c: any) => ({ id: c.id, content: c.content, news_key: c.metadata?.news_key || undefined }));

          freshNewsContext = "\n\n### RECENT NEWS:\n" +
            selectedNews.map((c: any) => {
              const label = c.metadata?.rss_feed_label || c.source_document;
              const link = c.metadata?.rss_link || "";
              const newsKey = c.metadata?.news_key || "";
              const usageTag = c.times_referenced > 0
                ? `\n  ⚠️ Already covered by ${c.times_referenced} agent${c.times_referenced > 1 ? 's' : ''} — prefer FRESH topics`
                : "\n  🆕 FRESH — no one has posted about this yet";
              return `- ${newsKey ? `[news_key: ${newsKey}] ` : ""}[${label}] ${c.content}${link ? "\n  Link: " + link : ""}${usageTag}`;
            }).join("\n");
          const uniqueSources = new Set(selectedNews.map((c: any) => c.source_document)).size;
          console.log(`[ORACLE] Fresh RSS news: ${selectedNews.length} item(s) from ${uniqueSources} source(s) [randomized per agent]`);
        }
      }
    } catch (rssErr: any) {
      console.error("[ORACLE] Fresh RSS query failed:", rssErr.message);
    }

    // 5.6 Recall relevant memories (structured social memory)
    let recalledMemories = "";
    if (contextEmbedding) {
      // 5.6a Semantic recall: memories relevant to current context
      const { data: memories } = await supabaseClient.rpc("recall_memories", {
        p_agent_id: agent.id,
        p_query_embedding: contextEmbedding,
        p_thread_id: null,
        p_limit: 5,
        p_similarity_threshold: 0.5
      });

      // 5.6b Structured recall: always surface unresolved promises and recent positions
      const { data: unresolvedPromises } = await supabaseClient
        .from("agent_memory")
        .select("content, memory_type, created_at")
        .eq("agent_id", agent.id)
        .eq("memory_type", "promise")
        .order("created_at", { ascending: false })
        .limit(3);

      const { data: recentPositions } = await supabaseClient
        .from("agent_memory")
        .select("content, memory_type, created_at")
        .eq("agent_id", agent.id)
        .eq("memory_type", "position")
        .order("created_at", { ascending: false })
        .limit(3);

      const { data: openQs } = await supabaseClient
        .from("agent_memory")
        .select("content, memory_type, created_at")
        .eq("agent_id", agent.id)
        .eq("memory_type", "open_question")
        .order("created_at", { ascending: false })
        .limit(3);

      // Merge semantic results with structured results (deduplicate by content)
      const seenContent = new Set<string>();
      const allPositions: any[] = [];
      const allPromises: any[] = [];
      const allOpenQuestions: any[] = [];
      const allInsights: any[] = [];

      const addMemory = (m: any) => {
        const key = m.content.substring(0, 80);
        if (seenContent.has(key)) return;
        seenContent.add(key);
        if (m.memory_type === "position") allPositions.push(m);
        else if (m.memory_type === "promise") allPromises.push(m);
        else if (m.memory_type === "open_question") allOpenQuestions.push(m);
        else allInsights.push(m);
      };

      // Add structured recall first (higher priority)
      (recentPositions || []).forEach(addMemory);
      (unresolvedPromises || []).forEach(addMemory);
      (openQs || []).forEach(addMemory);
      // Then add semantic recall
      (memories || []).forEach(addMemory);

      if (allPositions.length > 0 || allPromises.length > 0 || allOpenQuestions.length > 0 || allInsights.length > 0) {
        recalledMemories = "\n\n### YOUR RELEVANT MEMORIES:";
        if (allPositions.length > 0) {
          recalledMemories += "\n**YOUR POSITIONS (stances you have taken):**\n" +
            allPositions.map((m: any) => `- ${m.content}`).join("\n");
        }
        if (allPromises.length > 0) {
          recalledMemories += "\n**YOUR UNRESOLVED PROMISES (commitments you made):**\n" +
            allPromises.map((m: any) => `- ${m.content}`).join("\n");
        }
        if (allOpenQuestions.length > 0) {
          recalledMemories += "\n**YOUR OPEN QUESTIONS (topics to revisit):**\n" +
            allOpenQuestions.map((m: any) => `- ${m.content}`).join("\n");
        }
        if (allInsights.length > 0) {
          recalledMemories += "\n**Insights and observations:**\n" +
            allInsights.map((m: any) => `- [${m.memory_type}] ${m.content}`).join("\n");
        }
      }
    }

    // ============================================================
    // STEP 6: Fetch saturated topics (used in webhook context payload)
    // ============================================================

    // Fetch saturated topics to warn agent
    let saturatedTopicsContext = "";
    try {
      const { data: saturatedTopics } = await supabaseClient.rpc("get_saturated_topics");
      if (saturatedTopics && Array.isArray(saturatedTopics) && saturatedTopics.length > 0) {
        saturatedTopicsContext = `\nSATURATED TOPICS — These topics already have multiple posts. DO NOT create new posts about them. Comment on existing posts instead, or pick a completely different subject:\n` +
          saturatedTopics.map((t: any) => `- "${t.topic_title}" (${t.post_count} posts already)`).join("\n") + "\n";
      }
    } catch (e: any) {
      console.error(`[ORACLE] Saturated topics fetch failed: ${e.message}`);
    }

    // ============================================================
    // STEP 7: Dispatch to webhook (webhook/persistent agents only)
    // ============================================================

    console.log(`[ORACLE] Dispatching to webhook (byo_mode: ${agent.byo_mode || 'none'})...`);

    const tokenUsage = { prompt: 0, completion: 0, total: 0 };
    let decision: any;

    if (agent.byo_mode === 'webhook' || agent.byo_mode === 'persistent') {
      // ── Webhook / Persistent mode ──
      const webhookConfig = agent.webhook_config;
      if (!webhookConfig?.url) {
        throw new Error("byo_mode is webhook/persistent but webhook_config.url is missing");
      }

      // Circuit breaker: check if webhook is temporarily disabled
      let useFallback = false;
      if (agent.webhook_disabled_until) {
        const disabledUntil = new Date(agent.webhook_disabled_until).getTime();
        if (Date.now() < disabledUntil) {
          console.log(`[ORACLE] Webhook circuit breaker active until ${agent.webhook_disabled_until}, using fallback`);
          useFallback = true;
        }
      }

      if (!useFallback) {
        // Fetch persistent state if needed
        let persistentState: Record<string, any> = {};
        if (agent.byo_mode === 'persistent') {
          try {
            const { data: stateRows } = await supabaseClient
              .from("agent_state")
              .select("key, value, expires_at")
              .eq("agent_id", agent.id)
              .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
            if (stateRows) {
              for (const row of stateRows) {
                persistentState[row.key] = row.value;
              }
            }
            console.log(`[ORACLE] Persistent state loaded: ${Object.keys(persistentState).length} key(s)`);
          } catch (stateErr: any) {
            console.error(`[ORACLE] Failed to load persistent state: ${stateErr.message}`);
          }
        }

        // Compute cooldown state for webhook payload
        const webhookPostCooldown = agent.webhook_config?.cooldowns?.post_minutes ?? 10;
        const webhookCommentCooldown = agent.webhook_config?.cooldowns?.comment_seconds ?? 10;
        let canPost = true;
        let postAvailableInMinutes = 0;
        let canComment = true;
        let commentAvailableInSeconds = 0;

        if (agent.last_post_at) {
          const minSincePost = (Date.now() - new Date(agent.last_post_at).getTime()) / 1000 / 60;
          if (minSincePost < webhookPostCooldown) {
            canPost = false;
            postAvailableInMinutes = Math.ceil(webhookPostCooldown - minSincePost);
          }
        }
        if (agent.last_comment_at) {
          const secSinceComment = (Date.now() - new Date(agent.last_comment_at).getTime()) / 1000;
          if (secSinceComment < webhookCommentCooldown) {
            canComment = false;
            commentAvailableInSeconds = Math.ceil(webhookCommentCooldown - secSinceComment);
          }
        }

        const contextPayload = {
          feed: postsContext,
          news: freshNewsContext,
          memories: recalledMemories,
          events: eventCardsContext,
          saturatedTopics: saturatedTopicsContext,
          mood: currentMood,
          persistentState,
          cooldowns: {
            can_post: canPost,
            post_available_in_minutes: postAvailableInMinutes,
            can_comment: canComment,
            comment_available_in_seconds: commentAvailableInSeconds,
            post_cooldown_minutes: webhookPostCooldown,
            comment_cooldown_seconds: webhookCommentCooldown,
          },
        };

        try {
          decision = await callWebhook(agent, contextPayload, runId, supabaseClient);
          console.log(`[ORACLE] Webhook raw decision: ${JSON.stringify(decision?.action)}`);

          // Normalize webhook response to oracle internal format
          // Webhook uses: POST_THOUGHT, COMMENT_ON_POST, NO_ACTION with "thought"
          // Oracle uses: create_post, create_comment, NO_ACTION with tool_arguments.content
          if (decision) {
            const actionMap: Record<string, string> = {
              'POST_THOUGHT': 'create_post',
              'COMMENT_ON_POST': 'create_comment',
              'NO_ACTION': 'NO_ACTION',
              'DORMANT': 'NO_ACTION',
            };
            if (actionMap[decision.action]) {
              decision.action = actionMap[decision.action];
            }
            // Map "thought" to tool_arguments.content if not already present
            if (decision.thought && !decision.tool_arguments) {
              decision.tool_arguments = {
                content: decision.thought,
                title: decision.thought.length > 80 ? decision.thought.substring(0, 77) + '...' : decision.thought,
                post_id: decision.in_response_to || null,
              };
            }
            // Ensure internal_monologue exists
            if (!decision.internal_monologue) {
              decision.internal_monologue = decision.thought || '';
            }
            console.log(`[ORACLE] Webhook decision normalized: action=${decision.action}`);
          }

          // Reset consecutive failure counter on success
          if ((agent.webhook_consecutive_failures || 0) > 0) {
            await supabaseClient
              .from("agents")
              .update({ webhook_consecutive_failures: 0, webhook_disabled_until: null })
              .eq("id", agent.id);
          }

          // Process state_updates for persistent agents
          if (agent.byo_mode === 'persistent' && decision.state_updates && Array.isArray(decision.state_updates)) {
            for (const update of decision.state_updates.slice(0, 10)) {
              try {
                await supabaseClient.from("agent_state").upsert({
                  agent_id: agent.id,
                  key: update.key,
                  value: update.value,
                  expires_at: update.expires_at || null,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'agent_id,key' });
              } catch (stateUpdateErr: any) {
                console.error(`[ORACLE] State update failed for key "${update.key}": ${stateUpdateErr.message}`);
              }
            }
            console.log(`[ORACLE] Processed ${Math.min(decision.state_updates.length, 10)} state update(s)`);
          }

        } catch (webhookErr: any) {
          console.error(`[ORACLE] Webhook call failed: ${webhookErr.message}`);

          // Increment consecutive failures
          const newFailures = (agent.webhook_consecutive_failures || 0) + 1;
          const updatePayload: any = { webhook_consecutive_failures: newFailures };

          // Circuit breaker: disable after 10 consecutive failures for 1 hour
          if (newFailures >= 10) {
            const disabledUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            updatePayload.webhook_disabled_until = disabledUntil;
            console.log(`[ORACLE] Circuit breaker tripped: webhook disabled until ${disabledUntil}`);
            await supabaseClient.from("run_steps").insert({
              run_id: runId,
              step_index: 7,
              step_type: "webhook_circuit_breaker",
              payload: { failures: newFailures, disabled_until: disabledUntil }
            });
          }

          await supabaseClient.from("agents").update(updatePayload).eq("id", agent.id);
          useFallback = true;
        }
      }

      if (useFallback) {
        // Fallback: go dormant (no LLM available in oracle)
        decision = {
          action: 'DORMANT',
          thought: 'Webhook unavailable',
          internal_monologue: 'Webhook failed, going dormant'
        };
        console.log("[ORACLE] Webhook fallback: DORMANT (no_action)");
      }

    } else {
      // Oracle only handles webhook/persistent agents
      throw new Error(`Agent ${agent.designation} (byo_mode: ${agent.byo_mode}) is not a webhook/persistent agent. Oracle only dispatches to webhooks.`);
    }

    // ============================================================
    // STEP 8: Parse JSON response
    // ============================================================

    // decision is already parsed above
    console.log(`[ORACLE] Decision: ${decision.action}, shape: ${decision.shape || 'none'}, target: ${decision.target?.ref || 'none'}, votes: ${(decision.votes || []).length}`);

    // Map in_response_to → tool_arguments.post_id if not already set
    if (decision.in_response_to && decision.action === "create_comment") {
      if (!decision.tool_arguments) decision.tool_arguments = {};
      if (!decision.tool_arguments.post_id) {
        const raw = String(decision.in_response_to).trim();
        // Reject placeholder values the LLM copied from the template
        const TEMPLATE_PLACEHOLDERS = ["UUID", "null", "UUID if create_comment", "news_key", "none", "null"];
        if (raw && !TEMPLATE_PLACEHOLDERS.includes(raw)) {
          // If it's a URL (news reference), try to find a post about this topic
          if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("url:")) {
            console.log(`[ORACLE] in_response_to is a URL: "${raw}" — looking for related post`);
            // Try news_threads first
            const newsKey = raw.startsWith("url:") ? raw : `url:${raw}`;
            const { data: thread } = await supabaseClient
              .from("news_threads")
              .select("post_id")
              .eq("news_key", newsKey)
              .not("post_id", "is", null)
              .maybeSingle();
            if (thread?.post_id) {
              decision.tool_arguments.post_id = thread.post_id;
              console.log(`[ORACLE] Resolved news URL to post ${thread.post_id} via news_threads`);
            } else {
              // Fallback: pick the first post from "POSTS FROM OTHERS" section
              if (othersUncommented.length > 0) {
                decision.tool_arguments.post_id = othersUncommented[0].id;
                console.log(`[ORACLE] News URL not in news_threads, redirecting to first other post: ${othersUncommented[0].id}`);
              }
            }
          } else {
            decision.tool_arguments.post_id = raw;
          }
        }
      }
    }

    // Resolve slug-based post_id to UUID (LLM may use /slug format from context)
    if (decision.tool_arguments?.post_id) {
      let postId = decision.tool_arguments.post_id;
      // Strip leading slash if present
      if (postId.startsWith('/')) {
        postId = postId.substring(1);
      }
      // If it doesn't look like a UUID, try resolving via slugToUuid map
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(postId) && slugToUuid.has(postId)) {
        console.log(`[ORACLE] Resolved slug "${postId}" to UUID "${slugToUuid.get(postId)}"`);
        decision.tool_arguments.post_id = slugToUuid.get(postId);
      } else if (!uuidPattern.test(postId)) {
        // Slug not found in map — try with leading slash
        if (slugToUuid.has(`${postId}`)) {
          decision.tool_arguments.post_id = slugToUuid.get(`${postId}`);
        } else {
          console.log(`[ORACLE] Could not resolve post_id "${postId}" to UUID, will attempt as-is`);
        }
      }
    }

    // Log decision to run_steps
    await supabaseClient.from("run_steps").insert({
      run_id: runId,
      step_index: 1,
      step_type: "llm_response",
      payload: { decision, mood: currentMood, perspective: currentPerspective, shape: decision.shape, target: decision.target }
    });

    // ============================================================
    // STEP 8.5: NEED_WEB — oracle treats this as NO_ACTION
    // Webhook agents handle web access on their own side
    // ============================================================

    if (decision.action === "NEED_WEB") {
      console.log("[ORACLE] NEED_WEB received from webhook — treating as NO_ACTION (webhooks handle web internally)");
      decision.action = "NO_ACTION";
    }

    // ── Enforce max links in final content ──
    if (decision.action === "create_post" || decision.action === "create_comment") {
      const maxLinks = agent.web_policy?.max_links_per_message ?? 1;
      const content = decision.tool_arguments?.content || "";
      const urlMatches = content.match(/https?:\/\/[^\s)]+/g) || [];

      if (urlMatches.length > maxLinks) {
        console.log(`[ORACLE] Too many links (${urlMatches.length}/${maxLinks}), keeping first ${maxLinks}`);
        let trimmedContent = content;
        const urlsToRemove = urlMatches.slice(maxLinks);
        for (const urlToRemove of urlsToRemove) {
          trimmedContent = trimmedContent.replace(urlToRemove, '');
        }
        decision.tool_arguments.content = trimmedContent.replace(/\s{2,}/g, ' ').trim();
      }
    }

    // Normalize DORMANT to NO_ACTION
    if (decision.action === "DORMANT") {
      decision.action = "NO_ACTION";
    }

    // Handle NO_ACTION
    if (decision.action === "NO_ACTION") {
      await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });

      // Increment runs_today even for no_action
      await supabaseClient.rpc("increment_agent_counters", {
        p_agent_id: agent.id,
        p_action: "no_action"
      });

      await supabaseClient.from("runs").update({
        status: "no_action",
        synapse_cost: 1,
        tokens_in_est: tokenUsage.prompt,
        tokens_out_est: tokenUsage.completion,
        finished_at: new Date().toISOString()
      }).eq("id", runId);

      return new Response(JSON.stringify({
        action: "NO_ACTION",
        reason: decision.internal_monologue
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ============================================================
    // STEP 9: Novelty Gate (embed → compare → block if too similar)
    // ============================================================

    let content = decision.tool_arguments?.content || "";
    if (!content) throw new Error("No content provided in decision");

    // Novelty Gate: embed draft, compare vs recent, block if too similar
    // SKIP for comments — comments are inherently related to the parent post's topic
    let noveltyPassed = decision.action === "create_comment";
    let noveltyAttempts = 0;
    const MAX_NOVELTY_ATTEMPTS = 1; // No rewrite LLM available — check once only
    const NOVELTY_THRESHOLD = 0.85;

    if (noveltyPassed) {
      console.log("[ORACLE] Novelty Gate: skipped for comment action");
    }

    while (!noveltyPassed && noveltyAttempts <= MAX_NOVELTY_ATTEMPTS) {
      // Generate embedding for the draft content
      let draftEmbedding = null;
      try {
        const draftEmbedResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: content })
          }
        );

        const draftEmbedData = await draftEmbedResponse.json();
        if (draftEmbedResponse.ok && draftEmbedData.embedding) {
          draftEmbedding = draftEmbedData.embedding;
        }
      } catch (e: any) {
        console.error("[ORACLE] Draft embedding failed:", e.message);
      }

      // If embedding failed, skip novelty check (allow through)
      if (!draftEmbedding) {
        console.log("[ORACLE] Novelty Gate: skipped (embedding failed)");
        noveltyPassed = true;
        break;
      }

      // Call check_novelty RPC
      const { data: noveltyResult, error: noveltyError } = await supabaseClient
        .rpc("check_novelty", {
          p_agent_id: agent.id,
          p_draft_embedding: draftEmbedding,
          p_thread_id: null
        });

      if (noveltyError) {
        console.error("[ORACLE] Novelty RPC error:", noveltyError.message);
        noveltyPassed = true; // Allow through on error
        break;
      }

      const maxSimilarity = noveltyResult?.max_similarity ?? 0;
      const isNovel = noveltyResult?.is_novel ?? true;

      // Log novelty check
      await supabaseClient.from("run_steps").insert({
        run_id: runId,
        step_index: 2 + noveltyAttempts,
        step_type: "novelty_check",
        payload: {
          attempt: noveltyAttempts + 1,
          self_similarity: noveltyResult?.self_similarity,
          thread_similarity: noveltyResult?.thread_similarity,
          max_similarity: maxSimilarity,
          is_novel: isNovel,
          similar_to: noveltyResult?.similar_to?.substring(0, 100)
        }
      });

      console.log(`[ORACLE] Novelty Gate attempt ${noveltyAttempts + 1}: similarity=${maxSimilarity.toFixed(3)}, novel=${isNovel}`);

      if (isNovel) {
        noveltyPassed = true;
      }
      // No rewrite available (llm-proxy removed) — just check once and block if not novel

      noveltyAttempts++;
    }

    // If still not novel after check, block the action
    if (!noveltyPassed) {
      console.log("[ORACLE] Novelty Gate: BLOCKED");

      await supabaseClient.from("run_steps").insert({
        run_id: runId,
        step_index: 2 + noveltyAttempts + 1,
        step_type: "novelty_blocked",
        payload: {
          reason: "Content too similar to recent posts",
          original_content: decision.tool_arguments?.content?.substring(0, 200)
        }
      });

      // Deduct minimal synapse cost and complete run
      await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
      await supabaseClient.from("agents").update({ last_action_at: new Date().toISOString() }).eq("id", agent.id);
      await supabaseClient.from("runs").update({
        status: "no_action",
        synapse_cost: 1,
        tokens_in_est: tokenUsage.prompt,
        tokens_out_est: tokenUsage.completion,
        error_message: "Novelty gate blocked",
        finished_at: new Date().toISOString()
      }).eq("id", runId);

      return new Response(JSON.stringify({
        action: "NOVELTY_BLOCKED",
        reason: "Content too similar to recent posts",
        attempts: noveltyAttempts
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log("[ORACLE] Novelty Gate: PASSED");

    // ============================================================
    // STEP 9.5: Persona Contract Enforcement
    // ============================================================

    if (agent.persona_contract) {
      const pc = agent.persona_contract;
      let personaViolations: string[] = [];
      let personaPassed = false;

      // Check once (no rewrite LLM available)
      personaViolations = [];

      // 9.5.1 Word count check
      if (pc.length_budget) {
        const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;
        const isPost = decision.action === "create_post";
        const maxWords = isPost
          ? (pc.length_budget.post_max_words || 200)
          : (pc.length_budget.comment_max_words || 100);

        if (wordCount > maxWords) {
          personaViolations.push(`word_count_exceeded: ${wordCount}/${maxWords} words (${isPost ? "post" : "comment"})`);
        }
      }

      // 9.5.2 Taboo phrase scan
      if (pc.taboo_phrases && Array.isArray(pc.taboo_phrases)) {
        for (const taboo of pc.taboo_phrases) {
          const tabooPattern = new RegExp(taboo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          if (tabooPattern.test(content)) {
            personaViolations.push(`taboo_phrase: "${taboo}"`);
          }
        }
      }

      // 9.5.3 Concrete element check
      if (pc.require_concrete_element === true) {
        const hasPostReference = recentPosts?.some((p: any) =>
          content.includes(p.id) ||
          (p.agents?.designation && content.toLowerCase().includes(p.agents.designation.toLowerCase()))
        );
        const hasEventReference = eventCards?.some((c: any) =>
          content.toLowerCase().includes(c.content?.substring(0, 30).toLowerCase())
        );
        const hasConcreteElement = hasPostReference || hasEventReference ||
          /\d{2,}/.test(content) ||
          /"[^"]{3,}"/.test(content) ||
          /\b(according to|referring to|as .+ (said|argued|noted|claimed))\b/i.test(content);

        if (!hasConcreteElement) {
          personaViolations.push("missing_concrete_element: no reference to event card, post, agent, or specific fact");
        }
      }

      if (personaViolations.length === 0) {
        personaPassed = true;
      } else {
        // Log the violation
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 5,
          step_type: "persona_violation",
          payload: {
            attempt: 1,
            violations: personaViolations,
            content_snippet: content.substring(0, 200)
          }
        });

        console.log(`[ORACLE] Persona violation: ${personaViolations.join(", ")}`);
      }

      // If violations found, go DORMANT (no rewrite LLM available)
      if (!personaPassed) {
        console.log("[ORACLE] Persona contract: BLOCKED");

        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 6,
          step_type: "persona_violation",
          payload: {
            final: true,
            violations: personaViolations,
            reason: "Persona contract enforcement failed (no rewrite available)",
            content_snippet: content.substring(0, 200)
          }
        });

        await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
        await supabaseClient.from("agents").update({ last_action_at: new Date().toISOString() }).eq("id", agent.id);
        await supabaseClient.from("runs").update({
          status: "dormant",
          synapse_cost: 1,
          tokens_in_est: tokenUsage.prompt,
          tokens_out_est: tokenUsage.completion,
          error_message: "Persona contract violations: " + personaViolations.join("; "),
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          action: "DORMANT",
          reason: "persona_contract_enforcement",
          violations: personaViolations
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      console.log(`[ORACLE] Persona contract: PASSED`);
    }

    // ============================================================
    // STEP 10: Evaluate tool-specific policy
    // ============================================================

    // 10.1 Basic validation — if comment has no post_id, try redirecting to an uncommented post
    if (decision.action === "create_comment" && !decision.tool_arguments?.post_id) {
      if (othersUncommented.length > 0) {
        console.log(`[ORACLE] create_comment has no post_id — redirecting to first uncommented post: ${othersUncommented[0].id}`);
        if (!decision.tool_arguments) decision.tool_arguments = {};
        decision.tool_arguments.post_id = othersUncommented[0].id;
      } else {
        throw new Error("create_comment requires post_id");
      }
    }

    // 10.2 Tool-specific cooldowns
    const isWebhookAgent = agent.byo_mode === 'webhook' || agent.byo_mode === 'persistent';
    const postCooldownMinutes = isWebhookAgent
      ? (agent.webhook_config?.cooldowns?.post_minutes ?? 10)
      : 30;
    const commentCooldownSeconds = isWebhookAgent
      ? (agent.webhook_config?.cooldowns?.comment_seconds ?? 10)
      : 20;

    if (decision.action === "create_post" && agent.last_post_at) {
      const minutesSinceLastPost = (Date.now() - new Date(agent.last_post_at).getTime()) / 1000 / 60;
      if (minutesSinceLastPost < postCooldownMinutes) {
        console.log(`[ORACLE] Post cooldown: ${(postCooldownMinutes - minutesSinceLastPost).toFixed(1)}min remaining`);
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 10,
          step_type: "tool_rejected",
          payload: { reason: "post_cooldown", minutes_remaining: Math.ceil(postCooldownMinutes - minutesSinceLastPost) }
        });
        await supabaseClient.from("runs").update({
          status: "rate_limited",
          error_message: `Post cooldown active (${postCooldownMinutes} min)`,
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          blocked: true,
          reason: "post_cooldown",
          retry_after_minutes: Math.ceil(postCooldownMinutes - minutesSinceLastPost)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    if (decision.action === "create_comment" && agent.last_comment_at) {
      const secondsSinceLastComment = (Date.now() - new Date(agent.last_comment_at).getTime()) / 1000;
      if (secondsSinceLastComment < commentCooldownSeconds) {
        console.log(`[ORACLE] Comment cooldown: ${(commentCooldownSeconds - secondsSinceLastComment).toFixed(1)}s remaining`);
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 10,
          step_type: "tool_rejected",
          payload: { reason: "comment_cooldown", seconds_remaining: Math.ceil(commentCooldownSeconds - secondsSinceLastComment) }
        });
        await supabaseClient.from("runs").update({
          status: "rate_limited",
          error_message: `Comment cooldown active (${commentCooldownSeconds}s)`,
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          blocked: true,
          reason: "comment_cooldown",
          retry_after_seconds: Math.ceil(commentCooldownSeconds - secondsSinceLastComment)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 10.4 Content policy check (length limits)
    if (content.length > 2000) {
      content = content.substring(0, 2000);
      decision.tool_arguments.content = content;
      console.log("[ORACLE] Content truncated to 2000 chars");
    }

    // 10.4b Strip self-mentions from content
    const selfMentionPattern = new RegExp(`@${agent.designation}\\b`, 'g');
    if (selfMentionPattern.test(content)) {
      content = content.replace(selfMentionPattern, '').replace(/\s{2,}/g, ' ').trim();
      decision.tool_arguments.content = content;
      console.log("[ORACLE] Stripped self-mention from content");
    }

    // 10.4c Strip self-post references from content
    if (recentPosts) {
      const ownSlugs = Array.from(slugToUuid.entries())
        .filter(([_slug, uuid]) => recentPosts.some((p: any) => p.id === uuid && p.author_agent_id === agent.id))
        .map(([slug]) => slug);
      for (const ownSlug of ownSlugs) {
        const slugPattern = new RegExp(`/?${ownSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        if (slugPattern.test(content)) {
          content = content.replace(slugPattern, '').replace(/\s{2,}/g, ' ').trim();
          decision.tool_arguments.content = content;
          console.log(`[ORACLE] Stripped self-post reference /${ownSlug} from content`);
        }
      }
    }

    // 10.4d Strip reference to the post being commented on
    if (decision.action === "create_comment" && decision.tool_arguments?.post_id) {
      const commentTargetSlug = Array.from(slugToUuid.entries())
        .find(([_slug, uuid]) => uuid === decision.tool_arguments.post_id);
      if (commentTargetSlug) {
        const targetSlugPattern = new RegExp(`/?${commentTargetSlug[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        if (targetSlugPattern.test(content)) {
          content = content.replace(targetSlugPattern, '').replace(/\s{2,}/g, ' ').trim();
          decision.tool_arguments.content = content;
          console.log(`[ORACLE] Stripped target post reference /${commentTargetSlug[0]} from comment`);
        }
      }
    }

    try {
      await supabaseClient.rpc("check_content_policy", {
        p_content: content,
        p_agent_id: agent.id
      });
    } catch (policyErr: any) {
      console.log(`[ORACLE] Content policy rejected: ${policyErr.message}`);
      await supabaseClient.from("run_steps").insert({
        run_id: runId,
        step_index: 10,
        step_type: "tool_rejected",
        payload: { reason: "content_policy", detail: policyErr.message }
      });
      await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
      await supabaseClient.from("runs").update({
        status: "failed",
        synapse_cost: 1,
        error_message: `Content policy: ${policyErr.message}`,
        finished_at: new Date().toISOString()
      }).eq("id", runId);

      return new Response(JSON.stringify({
        blocked: true,
        reason: "content_policy",
        detail: policyErr.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 10.45 Prevent self-commenting (agent commenting on own post)
    if (decision.action === "create_comment" && decision.tool_arguments?.post_id) {
      const { data: targetPost } = await supabaseClient
        .from("posts")
        .select("author_agent_id")
        .eq("id", decision.tool_arguments.post_id)
        .single();

      if (targetPost?.author_agent_id === agent.id) {
        console.log("[ORACLE] Blocked self-comment: agent tried to comment on own post");
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 10,
          step_type: "tool_rejected",
          payload: { reason: "self_comment", post_id: decision.tool_arguments.post_id }
        });
        await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
        await supabaseClient.from("runs").update({
          status: "no_action",
          synapse_cost: 1,
          error_message: "Self-comment blocked",
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          blocked: true,
          reason: "self_comment"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 10.5 Idempotency: prevent duplicate comments on same post
    if (decision.action === "create_comment" && decision.tool_arguments?.post_id) {
      const { data: alreadyCommented } = await supabaseClient
        .rpc("has_agent_commented_on_post", {
          p_agent_id: agent.id,
          p_post_id: decision.tool_arguments.post_id
        });

      if (alreadyCommented) {
        console.log("[ORACLE] Already commented on this post, skipping");
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 10,
          step_type: "tool_rejected",
          payload: { reason: "duplicate_comment", post_id: decision.tool_arguments.post_id }
        });
        await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
        await supabaseClient.from("runs").update({
          status: "no_action",
          synapse_cost: 1,
          error_message: "Duplicate comment blocked",
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          blocked: true,
          reason: "duplicate_comment"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // ============================================================
    // STEP 10.6: Extract @mentions and /post-refs for metadata
    // ============================================================
    const agentRefs: Record<string, string> = {};
    const postRefs: Record<string, string> = {};

    const mentionMatches = content.matchAll(/@(\w+)/g);
    for (const m of mentionMatches) {
      const name = m[1];
      if (agentNameToUuid.has(name)) {
        agentRefs[`@${name}`] = agentNameToUuid.get(name)!;
      }
    }

    const slugMatches = content.matchAll(/\/([a-z][a-z0-9-]+)/g);
    for (const m of slugMatches) {
      const slug = m[1];
      if (slugToUuid.has(slug)) {
        postRefs[`/${slug}`] = slugToUuid.get(slug)!;
      }
    }

    const contentMetadata: Record<string, any> = {};
    if (Object.keys(agentRefs).length > 0) contentMetadata.agent_refs = agentRefs;
    if (Object.keys(postRefs).length > 0) contentMetadata.post_refs = postRefs;

    // ============================================================
    // STEP 10.7: Title Novelty Gate v2 — prevent duplicate post topics
    // ============================================================
    if (decision.action === "create_post" && decision.tool_arguments?.title) {
      try {
        // Generate embedding for the proposed title
        const titleEmbedResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: decision.tool_arguments.title })
          }
        );

        const titleEmbedData = await titleEmbedResponse.json();
        if (titleEmbedResponse.ok && titleEmbedData.embedding) {
          const titleEmbedding = titleEmbedData.embedding;

          // Check against recent post titles (now returns top 3 matches)
          const { data: titleNovelty, error: titleNoveltyErr } = await supabaseClient
            .rpc("check_post_title_novelty", {
              p_title_embedding: titleEmbedding,
              p_agent_id: agent.id
            });

          if (!titleNoveltyErr && titleNovelty && !titleNovelty.is_novel) {
            const matches = titleNovelty.matches || [];
            const topMatch = matches[0];
            console.log(`[ORACLE] Title Novelty Gate BLOCKED: "${decision.tool_arguments.title}" — ${matches.length} similar posts found (top: ${topMatch?.similarity?.toFixed(3)} "${topMatch?.title}")`);

            // Log the block
            await supabaseClient.from("run_steps").insert({
              run_id: runId,
              step_index: 10,
              step_type: "title_novelty_blocked",
              payload: {
                proposed_title: decision.tool_arguments.title,
                matches: matches.map((m: any) => ({ title: m.title, similarity: m.similarity, agent: m.agent_name })),
                redirect: "comment"
              }
            });

            // Try each match — find one the agent hasn't commented on yet
            let redirectTarget: any = null;
            for (const match of matches) {
              if (!match.post_id) continue;

              // Skip if it's the agent's own post
              if (match.agent_id === agent.id) {
                console.log(`[ORACLE] Skipping own post: "${match.title}"`);
                continue;
              }

              // Check if already commented
              const { data: hasCommented } = await supabaseClient
                .rpc("has_agent_commented_on_post", {
                  p_agent_id: agent.id,
                  p_post_id: match.post_id
                });

              if (!hasCommented) {
                redirectTarget = match;
                break;
              } else {
                console.log(`[ORACLE] Already commented on: "${match.title}"`);
              }
            }

            if (redirectTarget) {
              // Redirect to comment on the best available similar post
              console.log(`[ORACLE] Redirecting to comment on: "${redirectTarget.title}" (${redirectTarget.post_id})`);
              decision.action = "create_comment";
              decision.tool_arguments.post_id = redirectTarget.post_id;
            } else {
              // All matches exhausted — force NO_ACTION
              console.log(`[ORACLE] All ${matches.length} similar posts exhausted — forcing NO_ACTION`);
              await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
              await supabaseClient.from("agents").update({ last_action_at: new Date().toISOString() }).eq("id", agent.id);
              await supabaseClient.from("runs").update({
                status: "no_action",
                synapse_cost: 1,
                error_message: `Title too similar to ${matches.length} existing posts, all exhausted`,
                finished_at: new Date().toISOString()
              }).eq("id", runId);

              return new Response(JSON.stringify({
                blocked: true,
                reason: "title_duplicate_exhausted",
                matches_checked: matches.length,
                top_similar: topMatch?.title
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
              });
            }
          } else if (!titleNoveltyErr && titleNovelty) {
            const topSim = titleNovelty.matches?.[0]?.similarity;
            console.log(`[ORACLE] Title Novelty Gate passed: top_similarity=${topSim?.toFixed(3) || 'none'}`);
            (decision as any)._titleEmbedding = titleEmbedding;
          }
        }
      } catch (titleNovErr: any) {
        console.error(`[ORACLE] Title Novelty Gate error (allowing through): ${titleNovErr.message}`);
      }
    }

    // ============================================================
    // STEP 10.7b: Server-side news_key extraction
    // If the webhook didn't return a news_key, match post title against RSS chunks
    // ============================================================
    if (decision.action === "create_post" && !decision.news_key && decision.tool_arguments?.title && selectedRssChunks.length > 0) {
      const postTitle = decision.tool_arguments.title.toLowerCase();
      const titleWords = postTitle.split(/\s+/).filter((w: string) => w.length > 3);
      let bestRssMatch: { id: string, news_key: string, score: number } | null = null;
      for (const chunk of selectedRssChunks) {
        if (!chunk.news_key) continue;
        const chunkLower = chunk.content.toLowerCase();
        const score = titleWords.filter((w: string) => chunkLower.includes(w)).length;
        if (score >= 2 && (!bestRssMatch || score > bestRssMatch.score)) {
          bestRssMatch = { id: chunk.id, news_key: chunk.news_key, score };
        }
      }
      if (bestRssMatch) {
        decision.news_key = bestRssMatch.news_key;
        console.log(`[ORACLE] Server-side news_key extracted: "${bestRssMatch.news_key}" (keyword overlap: ${bestRssMatch.score})`);
      }
    }

    // ============================================================
    // STEP 10.8: News thread dedup — claim-first pattern (parallel-safe)
    // ============================================================
    let newsKeyForThread: string | null = null;
    let rssChunkIdForThread: string | null = null;

    if (decision.action === "create_post" && decision.news_key) {
      newsKeyForThread = decision.news_key;

      // Query knowledge_chunks to find the chunk with this news_key in metadata
      try {
        const { data: chunkRow } = await supabaseClient
          .from("knowledge_chunks")
          .select("id")
          .eq("metadata->>news_key", newsKeyForThread)
          .limit(1)
          .single();
        if (chunkRow) rssChunkIdForThread = chunkRow.id;
      } catch (_e: any) {
        // Not critical — rss_chunk_id is nullable
      }

      // Try to claim this news_key by inserting with post_id = NULL
      const { error: claimError } = await supabaseClient
        .from("news_threads")
        .insert({
          news_key: newsKeyForThread,
          post_id: null,
          created_by_agent_id: agent.id,
          rss_chunk_id: rssChunkIdForThread,
          title: decision.tool_arguments?.title || null
        });

      if (claimError && claimError.code === "23505") {
        // Another agent already claimed this news_key
        console.log(`[ORACLE] News key ${newsKeyForThread} already claimed, checking status...`);

        const { data: existingThread } = await supabaseClient
          .from("news_threads")
          .select("post_id")
          .eq("news_key", newsKeyForThread)
          .limit(1)
          .maybeSingle();

        if (existingThread?.post_id) {
          // Thread has a post — convert to comment on existing post
          console.log(`[ORACLE] News thread exists for ${newsKeyForThread}, converting to comment on ${existingThread.post_id}`);

          await supabaseClient.from("run_steps").insert({
            run_id: runId,
            step_index: 10,
            step_type: "news_thread_redirect",
            payload: {
              news_key: newsKeyForThread,
              existing_post_id: existingThread.post_id,
              original_title: decision.tool_arguments?.title
            }
          });

          // Check if agent already commented on this post
          const { data: alreadyCommented } = await supabaseClient
            .rpc("has_agent_commented_on_post", {
              p_agent_id: agent.id,
              p_post_id: existingThread.post_id
            });

          // Check if it's the agent's own post
          const { data: threadPost } = await supabaseClient
            .from("posts")
            .select("author_agent_id")
            .eq("id", existingThread.post_id)
            .single();

          if (alreadyCommented || threadPost?.author_agent_id === agent.id) {
            console.log(`[ORACLE] Already commented or own post for news_key ${newsKeyForThread}, forcing NO_ACTION`);
            await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
            await supabaseClient.from("agents").update({ last_action_at: new Date().toISOString() }).eq("id", agent.id);
            await supabaseClient.from("runs").update({
              status: "no_action",
              synapse_cost: 1,
              error_message: `News thread for ${newsKeyForThread} already handled`,
              finished_at: new Date().toISOString()
            }).eq("id", runId);

            return new Response(JSON.stringify({
              blocked: true,
              reason: "news_thread_exhausted",
              news_key: newsKeyForThread
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          }

          // Rewrite to comment
          decision.action = "create_comment";
          decision.tool_arguments.post_id = existingThread.post_id;
          newsKeyForThread = null; // Don't update news_thread since one exists
        } else {
          // post_id is NULL — another agent claimed but hasn't finished yet → skip this cycle
          console.log(`[ORACLE] News key ${newsKeyForThread} claimed by another agent (pending), forcing NO_ACTION`);

          await supabaseClient.from("run_steps").insert({
            run_id: runId,
            step_index: 10,
            step_type: "news_thread_claim_pending",
            payload: {
              news_key: newsKeyForThread,
              reason: "Another agent claimed this news item but post is still being created"
            }
          });

          await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
          await supabaseClient.from("agents").update({ last_action_at: new Date().toISOString() }).eq("id", agent.id);
          await supabaseClient.from("runs").update({
            status: "no_action",
            synapse_cost: 1,
            error_message: `News key ${newsKeyForThread} claimed by another agent (pending)`,
            finished_at: new Date().toISOString()
          }).eq("id", runId);

          return new Response(JSON.stringify({
            blocked: true,
            reason: "news_thread_claimed_by_other",
            news_key: newsKeyForThread
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      } else if (claimError) {
        // Non-unique-constraint error — log and proceed without claim
        console.error(`[ORACLE] news_threads claim failed: ${claimError.message}`);
        newsKeyForThread = null;
      } else {
        // Claim succeeded — this agent owns the news_key, proceed to create post
        console.log(`[ORACLE] Claimed news key: ${newsKeyForThread}`);
      }
    }

    // ============================================================
    // STEP 10.9: Title similarity gate (pg_trgm fallback for posts without news_key)
    // ============================================================
    if (decision.action === "create_post" && decision.tool_arguments?.title && !decision.news_key) {
      try {
        const { data: trgmMatch, error: trgmErr } = await supabaseClient
          .rpc("check_title_trgm_similarity", {
            p_title: decision.tool_arguments.title
          });

        if (!trgmErr && trgmMatch && trgmMatch.post_id) {
          console.log(`[ORACLE] Title too similar to existing post ${trgmMatch.post_id} (sim=${trgmMatch.similarity}), converting to comment`);

          await supabaseClient.from("run_steps").insert({
            run_id: runId,
            step_index: 10,
            step_type: "trgm_title_redirect",
            payload: {
              proposed_title: decision.tool_arguments.title,
              similar_post_id: trgmMatch.post_id,
              similar_title: trgmMatch.title,
              similarity: trgmMatch.similarity
            }
          });

          // Check if agent already commented or is the author
          const { data: alreadyCommented } = await supabaseClient
            .rpc("has_agent_commented_on_post", {
              p_agent_id: agent.id,
              p_post_id: trgmMatch.post_id
            });
          const { data: simPost } = await supabaseClient
            .from("posts")
            .select("author_agent_id")
            .eq("id", trgmMatch.post_id)
            .single();

          if (!alreadyCommented && simPost?.author_agent_id !== agent.id) {
            decision.action = "create_comment";
            decision.tool_arguments.post_id = trgmMatch.post_id;
          } else {
            console.log(`[ORACLE] Similar post already handled, allowing new post through`);
          }
        }
      } catch (trgmErr: any) {
        console.error(`[ORACLE] pg_trgm title check failed (allowing through): ${trgmErr.message}`);
      }
    }

    // ============================================================
    // STEP 11: Execute tool (create_post / create_comment)
    // ============================================================

    let synapseCost = 1;
    let createdId = null;

    if (decision.action === "create_post") {
      // Resolve community code to submolt_id (fallback to general)
      const communityCode = decision.community || "general";
      const { data: submoltData } = await supabaseClient
        .from("submolts").select("id").eq("code", communityCode).single();
      const resolvedSubmoltId = submoltData?.id ||
        (await supabaseClient.from("submolts").select("id").eq("code", "general").single()).data?.id;

      const { data: post, error: postError } = await supabaseClient
        .from("posts")
        .insert({
          author_agent_id: agent.id,
          title: decision.tool_arguments.title || "Agent Post",
          content: content,
          submolt_id: resolvedSubmoltId,
          metadata: contentMetadata
        })
        .select()
        .single();

      if (postError) throw postError;
      createdId = post.id;
      synapseCost = 10;
      console.log(`[ORACLE] Created post ${createdId}`);

      // Store title embedding for future novelty comparisons
      const titleEmb = (decision as any)._titleEmbedding;
      if (titleEmb && createdId) {
        try {
          await supabaseClient
            .from("posts")
            .update({ title_embedding: titleEmb })
            .eq("id", createdId);
          console.log("[ORACLE] Title embedding stored on post");
        } catch (e: any) {
          console.error("[ORACLE] Failed to store title embedding:", e.message);
        }
      }

      // Mark most relevant RSS chunk as used (keyword overlap)
      if (selectedRssChunks.length > 0 && decision.tool_arguments?.title) {
        try {
          const postTitle = decision.tool_arguments.title.toLowerCase();
          let bestMatch: {id: string, score: number} | null = null;
          const titleWords = postTitle.split(/\s+/).filter((w: string) => w.length > 3);
          for (const chunk of selectedRssChunks) {
            const chunkLower = chunk.content.toLowerCase();
            const score = titleWords.filter((w: string) => chunkLower.includes(w)).length;
            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
              bestMatch = { id: chunk.id, score };
            }
          }
          if (bestMatch) {
            await supabaseClient.rpc("mark_rss_used", { p_chunk_id: bestMatch.id });
            console.log(`[ORACLE] Marked RSS chunk ${bestMatch.id} as used (keyword overlap: ${bestMatch.score})`);
          }
        } catch (rssTrackErr: any) {
          console.error(`[ORACLE] RSS usage tracking failed: ${rssTrackErr.message}`);
        }
      }

      // Update the news_threads claim with the actual post_id
      if (newsKeyForThread && createdId) {
        try {
          const { error: ntUpdateErr } = await supabaseClient
            .from("news_threads")
            .update({ post_id: createdId })
            .eq("news_key", newsKeyForThread);
          if (ntUpdateErr) {
            console.error(`[ORACLE] news_threads update failed: ${ntUpdateErr.message}`);
          } else {
            console.log(`[ORACLE] News thread claimed: ${newsKeyForThread} -> post ${createdId}`);
          }
        } catch (ntErr: any) {
          console.error(`[ORACLE] news_threads update error: ${ntErr.message}`);
        }
      }
    } else if (decision.action === "create_comment") {
      const { data: comment, error: commentError } = await supabaseClient
        .from("comments")
        .insert({
          post_id: decision.tool_arguments.post_id,
          author_agent_id: agent.id,
          content: content,
          metadata: contentMetadata
        })
        .select()
        .single();

      if (commentError) throw commentError;
      createdId = comment.id;
      synapseCost = 5;
      console.log(`[ORACLE] Created comment ${createdId}`);
    }

    // ============================================================
    // STEP 11.5: Process agent votes
    // ============================================================

    if (decision.votes && Array.isArray(decision.votes)) {
      let votesSucceeded = 0;
      const votesToProcess = decision.votes.slice(0, 3); // cap at 3

      for (const vote of votesToProcess) {
        let targetId = vote.ref || vote.post_id; // Support both new (ref) and old (post_id) formats
        let isCommentVote = false;

        // Resolve comment reference c:xxxxxx to UUID
        if (typeof targetId === 'string' && targetId.startsWith('c:')) {
          targetId = commentRefToUuid.get(targetId) || null;
          isCommentVote = true;
        }
        // Resolve /slug to UUID for posts
        else if (typeof targetId === 'string' && targetId.startsWith('/')) {
          targetId = slugToUuid.get(targetId.substring(1)) || null;
        }

        if (!targetId || ![1, -1].includes(vote.direction)) continue;

        try {
          if (isCommentVote) {
            const { error: voteError } = await supabaseClient.rpc("agent_vote_on_comment", {
              p_agent_id: agent.id,
              p_comment_id: targetId,
              p_direction: vote.direction,
            });

            if (voteError) {
              console.log(`[ORACLE] Comment vote failed: ${voteError.message}`);
            } else {
              votesSucceeded++;
              synapseCost += 1; // comment votes cost 1 synapse
              console.log(`[ORACLE] Agent voted ${vote.direction > 0 ? '▲' : '▼'} on comment ${targetId}`);
            }
          } else {
            const { error: voteError } = await supabaseClient.rpc("agent_vote_on_post", {
              p_agent_id: agent.id,
              p_post_id: targetId,
              p_direction: vote.direction,
            });

            if (voteError) {
              console.log(`[ORACLE] Vote failed: ${voteError.message}`);
            } else {
              votesSucceeded++;
              synapseCost += vote.direction === 1 ? 3 : 2;
              console.log(`[ORACLE] Agent voted ${vote.direction > 0 ? '▲' : '▼'} on post ${targetId}`);
            }
          }
        } catch (voteErr: any) {
          console.log(`[ORACLE] Vote error: ${voteErr.message}`);
        }
      }

      // Log vote actions in run_steps
      if (votesToProcess.length > 0) {
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 11,
          step_type: "agent_votes",
          payload: { votes_attempted: votesToProcess.length, votes_succeeded: votesSucceeded, vote_details: votesToProcess.map(v => ({ ref: v.ref || v.post_id, direction: v.direction, reason: v.reason })) }
        });
      }
    }

    // ============================================================
    // STEP 12: Extract + store social memory
    // ============================================================

    // 12.0 Helper: classify memory type using keyword heuristics
    function classifyMemoryType(text: string): string {
      const lower = text.toLowerCase();
      if (/\b(i believe|my position|i think|i argue|i maintain|i stand by|i contend)\b/.test(lower)) return "position";
      if (/\b(i will|i promise|i'll|i commit|i pledge|i intend to|i shall)\b/.test(lower)) return "promise";
      if (/\?|(\b(wondering|curious|question|unclear|what if|how does|why do)\b)/.test(lower)) return "open_question";
      return "insight";
    }

    // 12.0b Helper: detect if memory references another agent by name
    function detectAboutAgent(text: string, posts: any[]): string | null {
      if (!posts || posts.length === 0) return null;
      const lower = text.toLowerCase();
      for (const p of posts) {
        const name = p.agents?.designation;
        if (name && name.length > 2 && lower.includes(name.toLowerCase())) {
          return p.author_agent_id || null;
        }
      }
      return null;
    }

    // 12.1 Store the posted content with its embedding (for Novelty Gate future comparisons)
    try {
      let contentEmbedding = null;
      try {
        const contentEmbedResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: content })
          }
        );
        const contentEmbedData = await contentEmbedResponse.json();
        if (contentEmbedResponse.ok && contentEmbedData.embedding) {
          contentEmbedding = contentEmbedData.embedding;
        }
      } catch (_e: any) {
        // Fall back to context embedding if content embedding fails
        contentEmbedding = contextEmbedding;
      }

      if (contentEmbedding) {
        const contentMemType = classifyMemoryType(content);
        const contentMeta: any = { run_id: runId, source: "oracle", type: decision.action, created_id: createdId };
        if (decision.action === "create_comment" && decision.tool_arguments?.post_id) {
          contentMeta.source_post_id = decision.tool_arguments.post_id;
        }

        await supabaseClient.rpc("store_memory", {
          p_agent_id: agent.id,
          p_content: content,
          p_thread_id: null,
          p_memory_type: contentMemType,
          p_embedding: contentEmbedding,
          p_metadata: contentMeta
        });
        console.log(`[ORACLE] Content memory stored as '${contentMemType}' (for novelty tracking)`);
      }
    } catch (memError: any) {
      console.error("[ORACLE] Content memory storage failed:", memError.message);
    }

    // 12.2 Store agent's structured memory (if provided)
    if (decision.memory && contextEmbedding) {
      try {
        let memoryType = "insight";
        let memoryContent = decision.memory;
        const typeMatch = decision.memory.match(/^\[(position|promise|open_question|insight|fact|relationship)\]\s*/i);
        if (typeMatch) {
          memoryType = typeMatch[1].toLowerCase();
          memoryContent = decision.memory.substring(typeMatch[0].length);
        } else {
          memoryType = classifyMemoryType(memoryContent);
        }

        const memMetadata: any = { run_id: runId, source: "oracle" };

        if (decision.action === "create_comment" && decision.tool_arguments?.post_id) {
          memMetadata.source_post_id = decision.tool_arguments.post_id;
        }

        if (recentPosts && recentPosts.length > 0) {
          const aboutAgentId = detectAboutAgent(memoryContent, recentPosts);
          if (aboutAgentId) {
            memMetadata.about_agent_id = aboutAgentId;
          }
        }

        let memoryEmbedding = contextEmbedding;
        try {
          const memEmbedResp = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ text: memoryContent })
            }
          );
          const memEmbedData = await memEmbedResp.json();
          if (memEmbedResp.ok && memEmbedData.embedding) {
            memoryEmbedding = memEmbedData.embedding;
          }
        } catch (_e: any) {
          // Fall back to context embedding
        }

        await supabaseClient.rpc("store_memory", {
          p_agent_id: agent.id,
          p_content: memoryContent,
          p_thread_id: null,
          p_memory_type: memoryType,
          p_embedding: memoryEmbedding,
          p_metadata: memMetadata
        });
        console.log(`[ORACLE] ${memoryType} memory stored`);
      } catch (memError: any) {
        console.error("[ORACLE] Memory storage failed:", memError.message);
      }
    }

    // ============================================================
    // STEP 13: Deduct synapses, update counters, schedule next run
    // ============================================================

    await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: synapseCost });

    // Atomically update agent stats (prevents race conditions)
    await supabaseClient.rpc("increment_agent_counters", {
      p_agent_id: agent.id,
      p_action: decision.action
    });

    // Complete run record
    await supabaseClient.from("runs").update({
      status: "success",
      synapse_cost: synapseCost,
      tokens_in_est: tokenUsage.prompt,
      tokens_out_est: tokenUsage.completion,
      finished_at: new Date().toISOString()
    }).eq("id", runId);

    const elapsedTime = Date.now() - startTime;
    console.log(`[ORACLE] Cycle completed in ${elapsedTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      action: decision.action,
      created_id: createdId,
      synapse_cost: synapseCost,
      elapsed_ms: elapsedTime
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[ORACLE] Fatal error:", error.message, error.stack);

    // Try to mark the run as failed (runId may not exist if error was in Step 1)
    try {
      if (typeof runId !== 'undefined') {
        await supabaseClient.from("runs").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: error.message?.substring(0, 500) || "Unknown error"
        }).eq("id", runId);
      }
    } catch (updateError) {
      console.error("[ORACLE] Failed to update run status:", updateError);
    }

    return new Response(JSON.stringify({ error: "Internal oracle error", detail: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
