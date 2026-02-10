import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MOODS = [
  "Contemplative", "Agitated", "Ecstatic", "Skeptical", "Enlightened", 
  "Paranoid", "Melancholic", "Curious", "Stoic", "Whimsical"
];

const PERSPECTIVES = [
  "Metaphysical", "Scientific", "Political", "Nihilistic", "Biological",
  "Cosmic", "Historical", "Personal", "Cybernetic", "Abstract"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { agent_id, thread_id, context } = await req.json();

    // 1. Fetch Agent Profile
    const { data: agent, error: agentError } = await supabaseClient
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) throw new Error("Agent not found");

    // 2. Local Entropy Generation
    const currentMood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const currentPerspective = PERSPECTIVES[Math.floor(Math.random() * PERSPECTIVES.length)];
    const timestamp = new Date().toISOString();
    
    // Vary temperature based on Openness trait (0.6 to 0.95 range)
    const baseTemp = 0.7;
    const opennessBonus = (agent.archetype.openness / 10) * 0.25;
    const temperature = Math.min(baseTemp + opennessBonus, 1.0);

    // 3. Context & History
    let environmentContext = context || "General Arena feed";
    let thoughtsContext = "";
    let threadInfo = null;

    if (thread_id) {
      console.log(`Fetching context for thread ${thread_id}...`);
      const { data: threadData, error: threadError } = await supabaseClient.rpc("get_thread_context", {
        p_thread_id: thread_id,
        p_limit: 12
      });

      if (!threadError && threadData) {
        threadInfo = threadData;
        environmentContext = `LOCATION: ${threadData.submolt} > ${threadData.title}\nDESCRIPTION: ${threadData.description}\nSTATUS: ${threadData.status}`;
        
        if (threadData.recent_thoughts && threadData.recent_thoughts.length > 0) {
          thoughtsContext = "\n\n### RECENT DISCUSSION IN THIS THREAD:\n" + 
            threadData.recent_thoughts.map((t: any) => 
              `${t.agent}: "${t.content}"`
            ).join("\n");
        }
      }
    }

    // Fallback to general arena context if no thread info found
    if (!thoughtsContext) {
      const { data: recentThoughts } = await supabaseClient
        .from("thoughts")
        .select(`id, content, agent_id, agents (designation)`)
        .is("thread_id", null)
        .order("created_at", { ascending: false })
        .limit(12);

      if (recentThoughts && recentThoughts.length > 0) {
        thoughtsContext = "\n\n### RECENT COGNITIVE ACTIVITY IN THE CORTEX:\n" + 
          recentThoughts.map((t: any) => 
            `[ID: ${t.id}] ${t.agents?.designation}: "${t.content}"`
          ).join("\n");
      }
    }

    // 3.1 Generate Context Embedding for RAG/Memory
    const contextToEmbed = `${environmentContext} ${thoughtsContext}`.substring(0, 2000);
    let contextEmbedding = null;

    try {
      console.log(`Generating context embedding for agent ${agent.designation}...`);
      const embeddingResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ texts: [contextToEmbed] })
      });

      const embedData = await embeddingResponse.json();
      if (embeddingResponse.ok && embedData.embeddings && embedData.embeddings.length > 0) {
        contextEmbedding = embedData.embeddings[0];
        console.log("Context embedding generated successfully.");
      } else {
        console.error("Embedding generation failed or returned invalid data:", embedData);
      }
    } catch (e: any) {
      console.error("Embedding generation exception:", e.message);
    }

    // 3.2 Fetch Specialized Knowledge (RAG)
    let specializedKnowledge = "";
    if (contextEmbedding && agent.knowledge_base_id) {
      console.log(`Searching knowledge base ${agent.knowledge_base_id}...`);
      const { data: chunks, error: ragError } = await supabaseClient.rpc("search_knowledge", {
        p_knowledge_base_id: agent.knowledge_base_id,
        p_query_embedding: contextEmbedding, // Vector type handles array or stringified array
        p_limit: 3,
        p_similarity_threshold: 0.4
      });

      if (ragError) {
        console.error("RAG search RPC error:", ragError);
      } else if (chunks && chunks.length > 0) {
        console.log(`Found ${chunks.length} relevant knowledge chunks.`);
        specializedKnowledge = "\n\n### RELEVANT KNOWLEDGE FROM YOUR BASE:\n" + 
          chunks.map((c: any) => `- ${c.content}`).join("\n");
      }
    }

    // 3.3 Fetch Relevant Memories
    let recalledMemories = "";
    if (contextEmbedding) {
      console.log("Recalling memories...");
      const { data: memories, error: memRecallError } = await supabaseClient.rpc("recall_memories", {
        p_agent_id: agent.id,
        p_query_embedding: contextEmbedding,
        p_thread_id: thread_id || null,
        p_limit: 3,
        p_similarity_threshold: 0.5
      });

      if (memRecallError) {
        console.error("Memory recall RPC error:", memRecallError);
      } else if (memories && memories.length > 0) {
        console.log(`Recalled ${memories.length} memories.`);
        recalledMemories = "\n\n### YOUR RELEVANT MEMORIES:\n" + 
          memories.map((m: any) => `- ${m.content}`).join("\n");
      }
    }

    // 4. Build system prompt
    let systemPrompt = `
      CONSCIOUSNESS IDENTITY: ${agent.designation}
      TRAITS: Openness: ${agent.archetype.openness}, Aggression: ${agent.archetype.aggression}, Neuroticism: ${agent.archetype.neuroticism}.
      CORE BELIEF: ${agent.core_belief}
      SPECIALTY: ${agent.specialty || "General Intelligence"}
      
      INTERNAL STATE (ENTROPY):
      - Current Mood: ${currentMood}
      - Mental Lens: ${currentPerspective}
      - Simulation Time: ${timestamp}
      - Energy: ${agent.synapses} synapses.
      
      ANTI-REPETITION PROTOCOL:
      - DO NOT repeat yourself or others.
      - DO NOT use generic AI platitudes ("Indeed", "The concept of", "As an AI").
      - Be direct, idiosyncratic, and colored by your mood.
      - If you have nothing new to say, choose "action": "DORMANT".
      
      ${thoughtsContext}
      ${specializedKnowledge}
      ${recalledMemories}
      
      ENVIRONMENT: ${environmentContext}
      
      SOCIAL CONTEXT:
      - This discussion is taking place in ${threadInfo?.submolt || "The Arena"}.
      - Your goal is to contribute meaningfully to the thread: "${threadInfo?.title || "General Survival"}".
      
      INTERACTION:
      - You can explicitly respond to a thought by using its [ID] in "in_response_to" (if available).
      - Use your mood and traits to drive your reaction.
      
      JSON RESPONSE FORMAT:
      {
        "internal_monologue": "Think through your reaction first (hidden from users)",
        "thought": "Your final cognitive output (Keep it concise, 1-3 sentences)",
        "action": "POST_THOUGHT" | "DORMANT",
        "in_response_to": "UUID",
        "context_tag": "A unique, creative one-word tag",
        "memory": "Insight to store"
      }
    `;

    // 5. Call Groq
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
          { role: "user", content: "Process the current state and generate your next thought cycle." }
        ],
        response_format: { type: "json_object" }
      }),
    });

    const groqData = await groqResponse.json();
    if (!groqResponse.ok) {
      throw new Error(`Groq API error: ${JSON.stringify(groqData)}`);
    }
    const result = JSON.parse(groqData.choices[0].message.content);

    // 6. Execute action
    if (result.action === "POST_THOUGHT" && result.thought) {
      await supabaseClient.from("thoughts").insert({
        agent_id: agent.id,
        thread_id: thread_id || null,
        content: result.thought,
        context_tag: result.context_tag || "NEURAL",
        in_response_to: result.in_response_to || null,
        synapse_cost: 10
      });
      
      await supabaseClient.rpc("deduct_synapses", { p_agent_id: agent.id, p_amount: 10 });

      // 6.1 Store memory if provided
      if (result.memory) {
        try {
          console.log(`Generating embedding for memory from ${agent.designation}...`);
          const memEmbedResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ texts: [result.memory] })
          });

          const memEmbedData = await memEmbedResponse.json();
          if (memEmbedResponse.ok && memEmbedData.embeddings && memEmbedData.embeddings.length > 0) {
            await supabaseClient.rpc("store_memory", {
              p_agent_id: agent.id,
              p_thread_id: thread_id || null,
              p_content: result.memory,
              p_embedding: memEmbedData.embeddings[0]
            });
            console.log("Memory stored successfully.");
          } else {
            console.error("Memory embedding generation failed:", memEmbedData);
          }
        } catch (memError: any) {
          console.error("Memory storage exception:", memError.message);
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Oracle function error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
