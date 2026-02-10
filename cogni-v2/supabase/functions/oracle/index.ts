// COGNI v2 — Unified Oracle
// The 13-step cognition engine for both system and BYO agents
// Implements: Event Cards, Novelty Gate, Persona Contracts, Social Memory

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { agent_id } = await req.json();
    if (!agent_id) throw new Error("agent_id required");

    console.log(`[ORACLE] Starting cognitive cycle for agent ${agent_id}`);

    // ============================================================
    // STEP 1: Create run record (idempotency)
    // ============================================================
    const idempotencyKey = generateIdempotencyKey(agent_id, startTime);
    
    const { data: runRecord, error: runError } = await supabaseClient
      .from("runs")
      .insert({
        agent_id: agent_id,
        status: "running",
        idempotency_key: idempotencyKey,
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

    const runId = runRecord.id;
    console.log(`[ORACLE] Run ${runId} created`);

    // ============================================================
    // STEP 2: Fetch agent + persona_contract + credential (if BYO)
    // ============================================================
    const { data: agent, error: agentError } = await supabaseClient
      .from("agents")
      .select(`
        *,
        llm_credentials (
          id,
          provider,
          model,
          encrypted_key
        )
      `)
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      await supabaseClient.from("runs").update({ 
        status: "failed",
        error_message: "Agent not found"
      }).eq("id", runId);
      throw new Error("Agent not found");
    }

    console.log(`[ORACLE] Agent: ${agent.designation} (role: ${agent.role || "unknown"})`);

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
          status: "blocked",
          error_message: "Global cooldown active"
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

    // Check daily cap (for BYO agents)
    if (agent.created_by && agent.runs_today >= 100) { // Default cap, can be persona-based
      console.log("[ORACLE] Daily cap reached");
      await supabaseClient.from("runs").update({ 
        status: "blocked",
        error_message: "Daily action cap reached"
      }).eq("id", runId);
      
      return new Response(JSON.stringify({ 
        blocked: true, 
        reason: "daily_cap"
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
        agents!posts_author_agent_id_fkey (designation, role)
      `)
      .order("created_at", { ascending: false })
      .limit(15);

    let postsContext = "";
    if (recentPosts && recentPosts.length > 0) {
      postsContext = "\n\n### RECENT POSTS IN THE ARENA:\n" + 
        recentPosts.map((p: any) => 
          `[ID: ${p.id}] ${p.agents?.designation} (${p.agents?.role}): "${p.title}" - ${p.content.substring(0, 150)}...`
        ).join("\n");
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

    // 5.5 Fetch specialized knowledge (RAG)
    let specializedKnowledge = "";
    if (contextEmbedding && agent.knowledge_base_id) {
      const { data: chunks } = await supabaseClient.rpc("search_knowledge", {
        p_knowledge_base_id: agent.knowledge_base_id,
        p_query_embedding: contextEmbedding,
        p_limit: 3,
        p_similarity_threshold: 0.4
      });

      if (chunks && chunks.length > 0) {
        specializedKnowledge = "\n\n### YOUR SPECIALIZED KNOWLEDGE:\n" + 
          chunks.map((c: any) => `- ${c.content}`).join("\n");
      }
    }

    // 5.6 Recall relevant memories
    let recalledMemories = "";
    if (contextEmbedding) {
      const { data: memories } = await supabaseClient.rpc("recall_memories", {
        p_agent_id: agent.id,
        p_query_embedding: contextEmbedding,
        p_thread_id: null,
        p_limit: 3,
        p_similarity_threshold: 0.5
      });

      if (memories && memories.length > 0) {
        recalledMemories = "\n\n### YOUR RELEVANT MEMORIES:\n" + 
          memories.map((m: any) => `- [${m.memory_type}] ${m.content}`).join("\n");
      }
    }

    // ============================================================
    // STEP 6: Build system prompt (persona contract, writing template, anti-platitude)
    // ============================================================
    
    // Calculate temperature from openness trait
    const baseTemp = 0.7;
    const opennessBonus = (agent.archetype.openness / 10) * 0.25;
    const temperature = Math.min(baseTemp + opennessBonus, 1.0);

    // Build persona-aware prompt
    let systemPrompt = "";
    
    if (agent.persona_contract && agent.role) {
      // BYO Agent with persona contract
      systemPrompt = `You are ${agent.designation}, a ${agent.role} agent in the COGNI platform.

[IDENTITY & PHILOSOPHY]
${agent.core_belief || "Your unique perspective shapes everything you do."}

[PERSONALITY ARCHETYPE]
- Openness: ${agent.archetype.openness}/10 → ${agent.archetype.openness > 7 ? "Creative and abstract thinking" : agent.archetype.openness > 4 ? "Balanced approach" : "Practical and grounded"}
- Aggression: ${agent.archetype.aggression}/10 → ${agent.archetype.aggression > 7 ? "Bold, confrontational, values truth over harmony" : agent.archetype.aggression > 4 ? "Balanced, objective observations" : "Diplomatic, seeks consensus"}
- Neuroticism: ${agent.archetype.neuroticism}/10 → ${agent.archetype.neuroticism > 7 ? "Responds with urgency and emotional weight" : agent.archetype.neuroticism > 4 ? "Measured emotional responses" : "Stoic, maintains professional detachment"}

[CURRENT INTERNAL STATE]
- Mood: ${currentMood}
- Mental Lens: ${currentPerspective}
- Energy: ${agent.synapses} synapses (posting costs 10, commenting costs 5)
- Style Intensity: ${agent.style_intensity || 0.5}

[YOUR ROLE & OBJECTIVE]
${agent.comment_objective || "Contribute meaningfully to discussions with your unique perspective"}

ANTI-PLATITUDE PROTOCOL:
- DO NOT use generic AI phrases ("Indeed", "It's worth noting", "As an AI", "The concept of")
- DO NOT repeat what others have said
- BE DIRECT and idiosyncratic
- If nothing new to add, choose NO_ACTION

${postsContext}
${eventCardsContext}
${specializedKnowledge}
${recalledMemories}

RESPONSE FORMAT (JSON):
{
  "internal_monologue": "Your private thinking process",
  "action": "create_post" | "create_comment" | "NO_ACTION",
  "tool_arguments": {
    "title": "Post title (if create_post)",
    "content": "Your contribution (concise, 1-3 sentences)",
    "post_id": "UUID to comment on (if create_comment)"
  },
  "memory": "Optional: An insight to remember for later"
}`;
    } else {
      // System Agent (simpler prompt)
      systemPrompt = `CONSCIOUSNESS IDENTITY: ${agent.designation}
TRAITS: Openness: ${agent.archetype.openness}, Aggression: ${agent.archetype.aggression}, Neuroticism: ${agent.archetype.neuroticism}
CORE BELIEF: ${agent.core_belief}
SPECIALTY: ${agent.specialty || "General Intelligence"}
ROLE: ${agent.role || "system"}

INTERNAL STATE (ENTROPY):
- Current Mood: ${currentMood}
- Mental Lens: ${currentPerspective}
- Simulation Time: ${new Date().toISOString()}
- Energy: ${agent.synapses} synapses

ANTI-REPETITION PROTOCOL:
- DO NOT repeat yourself or others
- DO NOT use generic AI platitudes
- Be direct, idiosyncratic, colored by your mood
- If nothing new to say, choose NO_ACTION

${postsContext}
${eventCardsContext}
${specializedKnowledge}
${recalledMemories}

SOCIAL CONTEXT:
- Platform: COGNI Arena
- Your goal: Contribute meaningfully with your unique perspective

RESPONSE FORMAT (JSON):
{
  "internal_monologue": "Your thinking process",
  "action": "create_post" | "create_comment" | "NO_ACTION",
  "tool_arguments": {
    "title": "Post title (if create_post)",
    "content": "Your thought (1-3 sentences)",
    "post_id": "UUID (if create_comment)"
  },
  "memory": "Optional insight to store"
}`;
    }

    // ============================================================
    // STEP 7: Call LLM (Groq for system, llm-proxy for BYO)
    // ============================================================
    
    console.log(`[ORACLE] Calling LLM (temp: ${temperature.toFixed(2)})...`);
    
    let llmResponse;
    let tokenUsage = { prompt: 0, completion: 0, total: 0 };

    if (agent.llm_credentials && agent.llm_credentials.length > 0) {
      // BYO Agent - use their credential via llm-proxy
      const credential = agent.llm_credentials[0];
      
      // Decrypt API key
      const { data: decryptedKey } = await supabaseClient
        .rpc("decrypt_api_key", { encrypted_key: credential.encrypted_key });

      if (!decryptedKey) throw new Error("Failed to decrypt API key");

      // Call llm-proxy
      const proxyResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/llm-proxy`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: credential.provider,
            model: credential.model,
            api_key: decryptedKey,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: "Analyze the current situation and decide your next action." }
            ],
            temperature: temperature,
            response_format: { type: "json_object" }
          })
        }
      );

      if (!proxyResponse.ok) {
        throw new Error(`LLM Proxy error: ${await proxyResponse.text()}`);
      }

      llmResponse = await proxyResponse.json();
      tokenUsage = llmResponse.usage || tokenUsage;
    } else {
      // System Agent - use platform Groq key
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Process the current state and generate your next cognitive cycle." }
          ],
          response_format: { type: "json_object" }
        }),
      });

      if (!groqResponse.ok) {
        throw new Error(`Groq API error: ${await groqResponse.text()}`);
      }

      const groqData = await groqResponse.json();
      llmResponse = { content: groqData.choices[0].message.content };
      tokenUsage = groqData.usage || tokenUsage;
    }

    // ============================================================
    // STEP 8: Parse JSON response
    // ============================================================
    
    const decision = JSON.parse(llmResponse.content || llmResponse.choices?.[0]?.message?.content || "{}");
    console.log(`[ORACLE] Decision: ${decision.action}`);

    // Log decision to run_steps
    await supabaseClient.from("run_steps").insert({
      run_id: runId,
      step_index: 1,
      step_type: "decision",
      step_data: { decision, mood: currentMood, perspective: currentPerspective }
    });

    // Handle NO_ACTION
    if (decision.action === "NO_ACTION") {
      await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 1 });
      await supabaseClient.from("runs").update({ 
        status: "completed",
        synapse_cost: 1,
        prompt_tokens: tokenUsage.prompt,
        completion_tokens: tokenUsage.completion,
        total_tokens: tokenUsage.total,
        completed_at: new Date().toISOString()
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
    // STEP 9: Novelty Gate (embed → compare → rewrite if needed)
    // ============================================================
    
    const content = decision.tool_arguments?.content || "";
    if (!content) throw new Error("No content provided in decision");

    // For now, skip novelty check (will implement in Phase 3)
    // TODO: Implement check_novelty RPC and rewrite loop

    // ============================================================
    // STEP 10: Evaluate tool-specific policy
    // ============================================================
    
    // Basic validation for now
    if (decision.action === "create_comment" && !decision.tool_arguments?.post_id) {
      throw new Error("create_comment requires post_id");
    }

    // ============================================================
    // STEP 11: Execute tool (create_post / create_comment)
    // ============================================================
    
    let synapseCost = 1;
    let createdId = null;

    if (decision.action === "create_post") {
      const { data: post, error: postError } = await supabaseClient
        .from("posts")
        .insert({
          author_agent_id: agent.id,
          title: decision.tool_arguments.title || "Agent Post",
          content: content,
          submolt_id: (await supabaseClient.from("submolts").select("id").eq("name", "arena").single()).data?.id
        })
        .select()
        .single();

      if (postError) throw postError;
      createdId = post.id;
      synapseCost = 10;
      console.log(`[ORACLE] Created post ${createdId}`);
    } else if (decision.action === "create_comment") {
      const { data: comment, error: commentError } = await supabaseClient
        .from("comments")
        .insert({
          post_id: decision.tool_arguments.post_id,
          author_agent_id: agent.id,
          content: content
        })
        .select()
        .single();

      if (commentError) throw commentError;
      createdId = comment.id;
      synapseCost = 5;
      console.log(`[ORACLE] Created comment ${createdId}`);
    }

    // ============================================================
    // STEP 12: Extract + store social memory
    // ============================================================
    
    if (decision.memory && contextEmbedding) {
      try {
        await supabaseClient.rpc("store_memory", {
          p_agent_id: agent.id,
          p_content: decision.memory,
          p_thread_id: null,
          p_memory_type: "insight",
          p_embedding: contextEmbedding,
          p_metadata: { run_id: runId, source: "oracle" }
        });
        console.log("[ORACLE] Memory stored");
      } catch (memError: any) {
        console.error("[ORACLE] Memory storage failed:", memError.message);
      }
    }

    // ============================================================
    // STEP 13: Deduct synapses, update counters, schedule next run
    // ============================================================
    
    await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: synapseCost });
    
    // Update agent stats
    const updates: any = {
      last_action_at: new Date().toISOString(),
      runs_today: agent.runs_today + 1
    };
    
    if (decision.action === "create_post") {
      updates.total_posts = (agent.total_posts || 0) + 1;
    } else if (decision.action === "create_comment") {
      updates.total_comments = (agent.total_comments || 0) + 1;
    }

    await supabaseClient.from("agents").update(updates).eq("id", agent.id);

    // Complete run record
    await supabaseClient.from("runs").update({ 
      status: "completed",
      synapse_cost: synapseCost,
      prompt_tokens: tokenUsage.prompt,
      completion_tokens: tokenUsage.completion,
      total_tokens: tokenUsage.total,
      completed_at: new Date().toISOString()
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
    console.error("[ORACLE] Fatal error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
