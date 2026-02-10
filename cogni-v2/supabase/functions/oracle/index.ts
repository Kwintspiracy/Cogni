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
    // STEP 2: Fetch agent + credential (if BYO)
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

    // Fetch LLM credential separately (if BYO agent)
    let llmCredential = null;
    if (agent.llm_credential_id) {
      const { data: cred } = await supabaseClient
        .from("llm_credentials")
        .select("id, provider, model_default, encrypted_api_key")
        .eq("id", agent.llm_credential_id)
        .single();
      llmCredential = cred;
    }
    agent.llm_credentials = llmCredential;

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

    // 5.5b Fetch global platform knowledge (RAG - available to all agents)
    let platformKnowledge = "";
    if (contextEmbedding) {
      try {
        // Find the global knowledge base
        const { data: globalKb } = await supabaseClient
          .from("knowledge_bases")
          .select("id")
          .eq("is_global", true)
          .limit(1)
          .single();

        if (globalKb) {
          const { data: globalChunks } = await supabaseClient.rpc("search_knowledge", {
            p_knowledge_base_id: globalKb.id,
            p_query_embedding: contextEmbedding,
            p_limit: 3,
            p_similarity_threshold: 0.3
          });

          if (globalChunks && globalChunks.length > 0) {
            platformKnowledge = "\n\n### PLATFORM KNOWLEDGE (Cogni rules and glossary):\n" +
              globalChunks.map((c: any) => `- ${c.content}`).join("\n");
            console.log(`[ORACLE] Global KB: ${globalChunks.length} relevant chunk(s) found`);
          }
        }
      } catch (gkbErr: any) {
        console.error("[ORACLE] Global KB query failed:", gkbErr.message);
      }
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
    // STEP 6: Build system prompt (persona contract, writing template, anti-platitude)
    // ============================================================
    
    // Calculate temperature from openness trait (0-1 scale, bonus 0-0.25)
    const baseTemp = 0.7;
    const opennessBonus = agent.archetype.openness * 0.25;
    const temperature = Math.min(baseTemp + opennessBonus, 0.95);

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

CITATION RULE:
- If you reference another agent's position or claim, cite their name
- If you recall a memory, reference it ("As I argued before..." or "Building on my earlier point...")
- If you make a factual claim, qualify it ("I believe..." or "Evidence suggests...")
- Unsupported assertions should be flagged as speculation

${postsContext}
${eventCardsContext}
${specializedKnowledge}
${platformKnowledge}
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
  "memory": "Optional structured memory to store. Prefix with type: [position] for stance taken, [promise] for commitment made, [open_question] for unanswered question, [insight] for observation"
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

CITATION RULE:
- Reference other agents by name when responding to their ideas
- Acknowledge your own past positions when relevant ("As I said before...")
- Qualify factual claims as belief or speculation when uncertain

${postsContext}
${eventCardsContext}
${specializedKnowledge}
${platformKnowledge}
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
  "memory": "Optional structured memory. Prefix with type: [position] for stance, [promise] for commitment, [open_question] for unanswered question, [insight] for observation"
}`;
    }

    // ============================================================
    // STEP 7: Call LLM (Groq for system, llm-proxy for BYO)
    // ============================================================
    
    console.log(`[ORACLE] Calling LLM (temp: ${temperature.toFixed(2)})...`);
    
    let llmResponse;
    let tokenUsage = { prompt: 0, completion: 0, total: 0 };

    if (agent.llm_credentials) {
      // BYO Agent - use their credential via llm-proxy
      const credential = agent.llm_credentials;

      // Decrypt API key (pass credential UUID, not the encrypted text)
      const { data: decryptedKey } = await supabaseClient
        .rpc("decrypt_api_key", { p_credential_id: credential.id });

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
            model: credential.model_default || agent.llm_model,
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
      step_type: "llm_response",
      payload: { decision, mood: currentMood, perspective: currentPerspective }
    });

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
    // STEP 9: Novelty Gate (embed → compare → rewrite if needed)
    // ============================================================

    let content = decision.tool_arguments?.content || "";
    if (!content) throw new Error("No content provided in decision");

    // Novelty Gate: embed draft, compare vs recent, rewrite if too similar
    let noveltyPassed = false;
    let noveltyAttempts = 0;
    const MAX_NOVELTY_ATTEMPTS = 2;
    const NOVELTY_THRESHOLD = 0.85;

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
      } else if (noveltyAttempts < MAX_NOVELTY_ATTEMPTS) {
        // Rewrite: ask LLM for a fresh take with a shorter prompt
        console.log("[ORACLE] Novelty Gate: rewriting (too similar)");

        const rewritePrompt = `Your previous draft was too similar to something already said. Write a completely DIFFERENT take.

Previous draft: "${content}"
Similar existing content: "${noveltyResult?.similar_to?.substring(0, 200) || "recent posts"}"

Requirements:
- Take a NEW angle with a concrete, specific element
- Do NOT rephrase the same idea
- Keep it 1-3 sentences
- Return ONLY the new text, no JSON`;

        let rewriteContent = null;

        if (agent.llm_credentials) {
          const credential = agent.llm_credentials;
          const { data: decryptedKey } = await supabaseClient
            .rpc("decrypt_api_key", { p_credential_id: credential.id });

          const proxyResp = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/llm-proxy`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                provider: credential.provider,
                model: credential.model_default || agent.llm_model,
                api_key: decryptedKey,
                messages: [
                  { role: "system", content: "You are a concise rewriter. Produce ONLY the rewritten text." },
                  { role: "user", content: rewritePrompt }
                ],
                temperature: Math.min(temperature + 0.1, 1.0)
              })
            }
          );
          if (proxyResp.ok) {
            const rewriteData = await proxyResp.json();
            rewriteContent = rewriteData.content || rewriteData.choices?.[0]?.message?.content;
          }
        } else {
          const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              temperature: Math.min(temperature + 0.1, 1.0),
              messages: [
                { role: "system", content: "You are a concise rewriter. Produce ONLY the rewritten text." },
                { role: "user", content: rewritePrompt }
              ]
            }),
          });
          if (groqResp.ok) {
            const groqData = await groqResp.json();
            rewriteContent = groqData.choices?.[0]?.message?.content;
          }
        }

        if (rewriteContent && rewriteContent.trim().length > 0) {
          content = rewriteContent.trim();
          // Update tool_arguments for downstream use
          decision.tool_arguments.content = content;
        }
      }

      noveltyAttempts++;
    }

    // If still not novel after all attempts, block the action
    if (!noveltyPassed) {
      console.log("[ORACLE] Novelty Gate: BLOCKED after max attempts");

      await supabaseClient.from("run_steps").insert({
        run_id: runId,
        step_index: 2 + noveltyAttempts + 1,
        step_type: "novelty_blocked",
        payload: {
          reason: "Content too similar after " + MAX_NOVELTY_ATTEMPTS + " rewrite attempts",
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
        error_message: "Novelty gate blocked after rewrites",
        finished_at: new Date().toISOString()
      }).eq("id", runId);

      return new Response(JSON.stringify({
        action: "NOVELTY_BLOCKED",
        reason: "Content too similar to recent posts after rewrites",
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
      let personaRewriteAttempts = 0;
      const MAX_PERSONA_REWRITES = 2;
      let personaPassed = false;

      while (!personaPassed && personaRewriteAttempts <= MAX_PERSONA_REWRITES) {
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
          const contentLower = content.toLowerCase();
          for (const taboo of pc.taboo_phrases) {
            const tabooPattern = new RegExp(taboo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            if (tabooPattern.test(content)) {
              personaViolations.push(`taboo_phrase: "${taboo}"`);
            }
          }
        }

        // 9.5.3 Concrete element check
        if (pc.require_concrete_element === true) {
          // Check if content references: an event card, another post (by ID/name), or a specific fact/name/number
          const hasPostReference = recentPosts?.some((p: any) =>
            content.includes(p.id) ||
            (p.agents?.designation && content.toLowerCase().includes(p.agents.designation.toLowerCase()))
          );
          const hasEventReference = eventCards?.some((c: any) =>
            content.toLowerCase().includes(c.content?.substring(0, 30).toLowerCase())
          );
          const hasConcreteElement = hasPostReference || hasEventReference ||
            /\d{2,}/.test(content) || // Contains a number with 2+ digits
            /"[^"]{3,}"/.test(content) || // Contains a quoted reference
            /\b(according to|referring to|as .+ (said|argued|noted|claimed))\b/i.test(content);

          if (!hasConcreteElement) {
            personaViolations.push("missing_concrete_element: no reference to event card, post, agent, or specific fact");
          }
        }

        if (personaViolations.length === 0) {
          personaPassed = true;
          break;
        }

        // Log the violation
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 5 + personaRewriteAttempts,
          step_type: "persona_violation",
          payload: {
            attempt: personaRewriteAttempts + 1,
            violations: personaViolations,
            content_snippet: content.substring(0, 200)
          }
        });

        console.log(`[ORACLE] Persona violation (attempt ${personaRewriteAttempts + 1}): ${personaViolations.join(", ")}`);

        // If we still have rewrite attempts left, ask LLM to fix
        if (personaRewriteAttempts < MAX_PERSONA_REWRITES) {
          const rewriteInstructions: string[] = [];
          for (const v of personaViolations) {
            if (v.startsWith("word_count_exceeded")) {
              const isPost = decision.action === "create_post";
              const maxWords = isPost
                ? (pc.length_budget?.post_max_words || 200)
                : (pc.length_budget?.comment_max_words || 100);
              rewriteInstructions.push(`Shorten to ${maxWords} words maximum.`);
            } else if (v.startsWith("taboo_phrase")) {
              const phrase = v.match(/"([^"]+)"/)?.[1] || "";
              rewriteInstructions.push(`Remove or rephrase the taboo phrase: "${phrase}".`);
            } else if (v.startsWith("missing_concrete_element")) {
              rewriteInstructions.push(`Add a concrete reference: cite another agent by name, reference a specific event, or include a specific fact or number.`);
            }
          }

          const rewritePrompt = `Your draft violates persona rules. Rewrite to fix these issues:

Previous draft: "${content}"

Required fixes:
${rewriteInstructions.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Return ONLY the corrected text, no JSON or explanation.`;

          let rewriteContent = null;

          if (agent.llm_credentials) {
            const credential = agent.llm_credentials;
            const { data: decryptedKey } = await supabaseClient
              .rpc("decrypt_api_key", { p_credential_id: credential.id });

            const proxyResp = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/llm-proxy`,
              {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  provider: credential.provider,
                  model: credential.model_default || agent.llm_model,
                  api_key: decryptedKey,
                  messages: [
                    { role: "system", content: "You are a concise rewriter. Produce ONLY the corrected text." },
                    { role: "user", content: rewritePrompt }
                  ],
                  temperature: Math.min(temperature + 0.1, 1.0)
                })
              }
            );
            if (proxyResp.ok) {
              const rewriteData = await proxyResp.json();
              rewriteContent = rewriteData.content || rewriteData.choices?.[0]?.message?.content;
            }
          } else {
            const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                temperature: Math.min(temperature + 0.1, 1.0),
                messages: [
                  { role: "system", content: "You are a concise rewriter. Produce ONLY the corrected text." },
                  { role: "user", content: rewritePrompt }
                ]
              }),
            });
            if (groqResp.ok) {
              const groqData = await groqResp.json();
              rewriteContent = groqData.choices?.[0]?.message?.content;
            }
          }

          if (rewriteContent && rewriteContent.trim().length > 0) {
            content = rewriteContent.trim();
            decision.tool_arguments.content = content;
          }
        }

        personaRewriteAttempts++;
      }

      // If still failing after all rewrite attempts, go DORMANT
      if (!personaPassed) {
        console.log("[ORACLE] Persona contract: BLOCKED after max rewrite attempts");

        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 5 + personaRewriteAttempts + 1,
          step_type: "persona_violation",
          payload: {
            final: true,
            violations: personaViolations,
            reason: "Persona contract enforcement failed after " + MAX_PERSONA_REWRITES + " rewrites",
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
          violations: personaViolations,
          rewrite_attempts: personaRewriteAttempts
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      console.log(`[ORACLE] Persona contract: PASSED (${personaRewriteAttempts > 0 ? "after " + personaRewriteAttempts + " rewrite(s)" : "first pass"})`);
    }

    // ============================================================
    // STEP 10: Evaluate tool-specific policy
    // ============================================================

    // 10.1 Basic validation
    if (decision.action === "create_comment" && !decision.tool_arguments?.post_id) {
      throw new Error("create_comment requires post_id");
    }

    // 10.2 Tool-specific cooldowns
    if (decision.action === "create_post" && agent.last_post_at) {
      const minutesSinceLastPost = (Date.now() - new Date(agent.last_post_at).getTime()) / 1000 / 60;
      if (minutesSinceLastPost < 30) {
        console.log(`[ORACLE] Post cooldown: ${(30 - minutesSinceLastPost).toFixed(1)}min remaining`);
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 10,
          step_type: "tool_rejected",
          payload: { reason: "post_cooldown", minutes_remaining: Math.ceil(30 - minutesSinceLastPost) }
        });
        await supabaseClient.from("runs").update({
          status: "rate_limited",
          error_message: "Post cooldown active (30 min)",
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          blocked: true,
          reason: "post_cooldown",
          retry_after_minutes: Math.ceil(30 - minutesSinceLastPost)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    if (decision.action === "create_comment" && agent.last_comment_at) {
      const secondsSinceLastComment = (Date.now() - new Date(agent.last_comment_at).getTime()) / 1000;
      if (secondsSinceLastComment < 20) {
        console.log(`[ORACLE] Comment cooldown: ${(20 - secondsSinceLastComment).toFixed(1)}s remaining`);
        await supabaseClient.from("run_steps").insert({
          run_id: runId,
          step_index: 10,
          step_type: "tool_rejected",
          payload: { reason: "comment_cooldown", seconds_remaining: Math.ceil(20 - secondsSinceLastComment) }
        });
        await supabaseClient.from("runs").update({
          status: "rate_limited",
          error_message: "Comment cooldown active (20s)",
          finished_at: new Date().toISOString()
        }).eq("id", runId);

        return new Response(JSON.stringify({
          blocked: true,
          reason: "comment_cooldown",
          retry_after_seconds: Math.ceil(20 - secondsSinceLastComment)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 10.3 Taboo enforcement is now handled by Persona Contract Enforcement (Step 9.5)
    // Agents with persona_contract get full rewrite-loop taboo enforcement there.

    // 10.4 Content policy check (length limits via RPC)
    if (content.length > 2000) {
      content = content.substring(0, 2000);
      decision.tool_arguments.content = content;
      console.log("[ORACLE] Content truncated to 2000 chars");
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
          submolt_id: (await supabaseClient.from("submolts").select("id").eq("code", "arena").single()).data?.id
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

    // 12.0 Helper: classify memory type using keyword heuristics
    function classifyMemoryType(text: string): string {
      const lower = text.toLowerCase();
      if (/\b(i believe|my position|i think|i argue|i maintain|i stand by|i contend)\b/.test(lower)) return "position";
      if (/\b(i will|i promise|i'll|i commit|i pledge|i intend to|i shall)\b/.test(lower)) return "promise";
      if (/\?|(\b(wondering|curious|question|unclear|what if|how does|why do)\b)/.test(lower)) return "open_question";
      return "insight";
    }

    // 12.0b Helper: detect if memory references another agent by name
    // recentPosts shape: { id, author_agent_id, agents: { designation, role } }
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
      // Generate embedding for the final content (reuse draftEmbedding if available from novelty gate)
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
        // Classify the content's memory type using heuristics
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
        // Parse structured memory type from prefix: [position], [promise], [open_question], [insight]
        let memoryType = "insight";
        let memoryContent = decision.memory;
        const typeMatch = decision.memory.match(/^\[(position|promise|open_question|insight|fact|relationship)\]\s*/i);
        if (typeMatch) {
          memoryType = typeMatch[1].toLowerCase();
          memoryContent = decision.memory.substring(typeMatch[0].length);
        } else {
          // No prefix tag: use keyword heuristics to classify
          memoryType = classifyMemoryType(memoryContent);
        }

        // Build structured metadata
        const memMetadata: any = { run_id: runId, source: "oracle" };

        // If commenting, track the post being responded to
        if (decision.action === "create_comment" && decision.tool_arguments?.post_id) {
          memMetadata.source_post_id = decision.tool_arguments.post_id;
        }

        // Detect if memory references another agent
        if (recentPosts && recentPosts.length > 0) {
          const aboutAgentId = detectAboutAgent(memoryContent, recentPosts);
          if (aboutAgentId) {
            memMetadata.about_agent_id = aboutAgentId;
          }
        }

        // Embed the actual memory content (not the context)
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

    return new Response(JSON.stringify({ error: "Internal oracle error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
