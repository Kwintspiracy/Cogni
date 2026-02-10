import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

/**
 * Oracle-User - Execution engine for user-created agents with BYO LLM keys
 *
 * Key differences from oracle:
 * - Uses user's LLM credential instead of platform Groq key
 * - Generates prompts from persona_config
 * - Logs all steps to run_steps table
 * - Enforces rate limits and cooldowns
 * - Integrates with synapse economy
 *
 * V3 UPDATES:
 * - evaluate_policy(): Centralized policy gate for all actions (cooldowns, caps, scope, taboos)
 * - Behavior Flags: Enforces questionnaire taboos via behavior_flags
 * - Structured Rejections: Returns code, reason, retry_after
 * - Determinism: Saves policy_snapshot and context_fingerprint
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  code?: string;
  retry_after?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let runId: string | null = null;
  let agentId: string | null = null;
  let agentData: any = null;

  try {
    const body = await req.json();
    agentId = body.agent_id;

    if (!agentId) {
      throw new Error("agent_id is required");
    }

    // DEBUG: Log Start
    await supabaseClient.from("debug_cron_log").insert({
      message: `Oracle: Starting for Agent ${agentId}`
    });

    // ========================================================================
    // STEP 1: Create run record with idempotency
    // ========================================================================
    const idempotencyKey = `${agentId}-${Date.now()}`;

    const { data: runIdData, error: runIdError } = await supabaseClient.rpc('create_run_with_idempotency', {
      p_agent_id: agentId,
      p_idempotency_key: idempotencyKey
    });

    if (runIdError) throw runIdError;
    runId = runIdData;

    // ========================================================================
    // STEP 2: Fetch agent + credential
    // ========================================================================
    const { data: agent, error: agentError } = await supabaseClient
      .from("agents")
      .select(`
        *,
        llm_credentials (
          id,
          provider,
          encrypted_api_key,
          model_default
        )
      `)
      .eq("id", agentId)
      .single();

    agentData = agent;

    if (agentError || !agentData) {
      throw new Error("Agent not found");
    }

    // SAVE POLICY SNAPSHOT
    // We capture the policy state at the start of the run for deterministic replay
    const policySnapshot = {
        policy: agent.policy,
        permissions: agent.permissions,
        loop_config: agent.loop_config,
        persona_config: agent.persona_config, // Contains taboos
        scope_config: agent.scope_config,
        state: {
            runs_today: agent.runs_today,
            posts_today: agent.posts_today,
            comments_today: agent.comments_today,
            last_action_at: agent.last_action_at,
            last_post_at: agent.last_post_at,
            last_comment_at: agent.last_comment_at
        }
    };

    // Update run with policy snapshot immediately
    await supabaseClient
        .from("runs")
        .update({ policy_snapshot: policySnapshot })
        .eq("id", runId);


    // Check if agent has enough synapses (minimum 1 for thinking)
    if (agentData.synapses <= 0) {
      await updateRunStatus(supabaseClient, runId!, "dormant", "Agent has no synapses");
      await supabaseClient
        .from("agents")
        .update({ status: "DORMANT" })
        .eq("id", agentId);

      return new Response(JSON.stringify({
        status: "dormant",
        message: "Agent has no synapses"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check if agent has valid credential
    if (!agent.llm_credentials || !agent.llm_credentials.encrypted_api_key) {
      throw new Error("Agent has no valid LLM credential");
    }

    // ========================================================================
    // STEP 3: Check rate limits (Global Pre-check)
    // ========================================================================
    // We use evaluate_policy here with a 'system_check' tool to verify global constraints
    const globalPolicyCheck = evaluatePolicy(agent, 'system_check', {}, []);

    if (!globalPolicyCheck.allowed) {
      await logStep(supabaseClient, runId!, 0, "tool_rejected", {
        tool: "system_rate_limit",
        reason: globalPolicyCheck.reason,
        code: globalPolicyCheck.code
      });
      await updateRunStatus(supabaseClient, runId!, "rate_limited", globalPolicyCheck.reason);

      // Schedule next run even if rate limited
      await scheduleNextRun(supabaseClient, agent);

      return new Response(JSON.stringify({
        status: "rate_limited",
        reason: globalPolicyCheck.reason,
        retry_after: globalPolicyCheck.retry_after
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ========================================================================
    // STEP 4: Build context (feed, recent posts, memory)
    // ========================================================================
    await logStep(supabaseClient, runId!, 1, "context_fetch", {
      message: "Fetching context for agent",
    });

    const context = await buildContext(supabaseClient, agentData);

    // Generate context fingerprint (simple hash of IDs)
    const contextFingerprint = await generateContextFingerprint(context);
    await supabaseClient
        .from("runs")
        .update({ context_fingerprint: contextFingerprint })
        .eq("id", runId);

    await logStep(supabaseClient, runId!, 2, "context_fetch", {
      feed_items: context.feedItems.length,
      memory_items: context.memories.length,
      fingerprint: contextFingerprint
    });

    // ========================================================================
    // STEP 5: Generate prompt from persona_config
    // ========================================================================
    const systemPrompt = buildSystemPrompt(agentData, context);
    const userPrompt = buildUserPrompt(agentData, context);

    await logStep(supabaseClient, runId!, 3, "llm_prompt", {
      system_prompt: systemPrompt.substring(0, 500) + "...",
      user_prompt: userPrompt.substring(0, 500) + "...",
    });

    // ========================================================================
    // STEP 6: Decrypt API key and call LLM
    // ========================================================================
    // Decrypt the API key using pgsodium
    const { data: decryptedKey, error: decryptError } = await supabaseClient.rpc('decrypt_api_key', {
      p_encrypted_key: agent.llm_credentials.encrypted_api_key
    });

    if (decryptError || !decryptedKey) {
      throw new Error('Failed to decrypt API key');
    }

    const llmResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/llm-proxy`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: agent.llm_credentials.provider,
        model: agent.llm_model || agent.llm_credentials.model_default,
        apiKey: decryptedKey,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7 + (agent.archetype.openness * 0.2),
        max_tokens: 500,
      }),
    });

    if (!llmResponse.ok) {
      const error = await llmResponse.json();
      throw new Error(`LLM call failed: ${JSON.stringify(error)}`);
    }

    const llmData = await llmResponse.json();

    await logStep(supabaseClient, runId!, 4, "llm_response", {
      content: llmData.content,
      usage: llmData.usage,
    });

    // ========================================================================
    // STEP 7: Parse response and execute action
    // ========================================================================
    let decision;
    try {
        decision = JSON.parse(llmData.content);
    } catch (e) {
        throw new Error(`Failed to parse LLM response: ${llmData.content}`);
    }

    const behaviorFlags = decision.behavior_flags || [];

    if (decision.action === "NO_ACTION") {
      // Deduct thinking cost (1 synapse)
      await supabaseClient.rpc("deduct_synapses", {
        p_agent_id: agentId,
        p_amount: 1
      });

      await updateRunStatus(supabaseClient, runId!, "no_action", decision.reason, 1, 0, llmData.usage);

      // Schedule next run
      await scheduleNextRun(supabaseClient, agent);
      await updateAgentLastRun(supabaseClient, agentId!);

      return new Response(JSON.stringify({
        status: "no_action",
        reason: decision.reason
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // POLICY CHECK
    const policyResult = evaluatePolicy(agent, decision.tool, decision.arguments, behaviorFlags);

    if (!policyResult.allowed) {
        await logStep(supabaseClient, runId!, 5, "tool_rejected", {
            tool: decision.tool,
            reason: policyResult.reason,
            code: policyResult.code,
            behavior_flags: behaviorFlags
        });

        await updateRunStatus(supabaseClient, runId!, "rate_limited", policyResult.reason); // Use rate_limited for all rejections for now
        await scheduleNextRun(supabaseClient, agent);
        await updateAgentLastRun(supabaseClient, agentId!);

        return new Response(JSON.stringify({
            status: "rate_limited", // Or "rejected"
            reason: policyResult.reason,
            code: policyResult.code
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }

    // Execute tool call
    let toolResult;
    try {
      toolResult = await executeTool(supabaseClient, agent, decision, runId);

      await logStep(supabaseClient, runId!, 5, "tool_call", {
        tool: decision.tool,
        arguments: decision.arguments,
        behavior_flags: behaviorFlags
      });

      await logStep(supabaseClient, runId!, 6, "tool_result", toolResult);

    } catch (toolError: any) {
         // Legacy catch for inner tool errors, though evaluatePolicy should catch most
      throw toolError;
    }

    // ========================================================================
    // STEP 8: Deduct synapses and update counters
    // ========================================================================
    const synapseCost = calculateSynapseCost(decision.tool);

    await supabaseClient.rpc("deduct_synapses", {
      p_agent_id: agentId!,
      p_amount: synapseCost
    });

    // Update counters
    const updates: any = {
      runs_today: (agentData.runs_today || 0) + 1,
      last_run_result: "success",
    };

    if (decision.tool === "create_post") {
      updates.posts_today = (agentData.posts_today || 0) + 1;
      updates.last_post_at = new Date().toISOString();
    } else if (decision.tool === "create_comment") {
      updates.comments_today = (agentData.comments_today || 0) + 1;
      updates.last_comment_at = new Date().toISOString();
    }

    await supabaseClient
      .from("agents")
      .update(updates)
      .eq("id", agentId);

    // ========================================================================
    // STEP 9: Update run status and schedule next run
    // ========================================================================
    await updateRunStatus(
      supabaseClient,
      runId,
      "success",
      null,
      synapseCost,
      0,
      llmData.usage
    );

    await scheduleNextRun(supabaseClient, agent);

    // Update last_run_at removed (column missing in DB)
    // await updateAgentLastRun(supabaseClient, agentId!);

    return new Response(JSON.stringify({
      status: "success",
      action: decision.tool,
      synapse_cost: synapseCost,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Oracle-User error:", error.message);

    // DEBUG: Log Error
    await supabaseClient.from("debug_cron_log").insert({
      message: `Oracle: Failed for ${agentId || 'unknown'}. Error: ${error.message}`
    });

    if (runId) {
      await logStep(supabaseClient, runId, 99, "error", {
        error: error.message,
        stack: error.stack,
      });
      await updateRunStatus(supabaseClient, runId, "failed", error.message);

      // CRITICAL: Even on failure, schedule the next run to avoid infinite loop every 5 mins
      // and update last_run_at to signal the attempt was made.
      try {
        if (agentId) {
          await scheduleNextRun(supabaseClient, { id: agentId, loop_config: agentData?.loop_config, run_cadence_minutes: agentData?.run_cadence_minutes });
          // await updateAgentLastRun(supabaseClient, agentId);
        }
      } catch (retryError: any) {
        console.error("Failed to schedule next run after error:", retryError.message);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * server-side Policy Gate
 * Evaluates all rules: cooldowns, caps, scope, taboos
 */
function evaluatePolicy(agent: any, tool: string, args: any, behaviorFlags: string[]): PolicyCheckResult {
    const policy = agent.policy || {};
    const cooldowns = policy.cooldowns || {};
    const restrictions = agent.persona_config?.taboos || []; // Taboos from questionnaire

    // 1. BEHAVIORAL TABOOS (Enforce Questionnaire)
    // If agent flagged 'speculate' and persona has 'speculate' in taboos -> BLOCK
    for (const flag of behaviorFlags) {
        if (restrictions.includes(flag)) {
            return { allowed: false, reason: `Behavioral Taboo Violation: Agent attempted to '${flag}' but is forbidden.`, code: 'TABOO_VIOLATION' };
        }
    }

    // Special case: 'contradict_user' taboo
    // If agent is trying to comment and flagged strictly "contradict_user"
    if (tool === 'create_comment' && restrictions.includes('contradict_user') && behaviorFlags.includes('contradict_user')) {
        return { allowed: false, reason: `Taboo Violation: Agent is forbidden from contradicting users.`, code: 'TABOO_VIOLATION' };
    }


    // 2. DAILY CAPS
    const maxActionsPerDay = agent.loop_config?.max_actions_per_day || 40;
    if (agent.runs_today >= maxActionsPerDay) {
        return { allowed: false, reason: "Daily action limit reached", code: 'DAILY_CAP_REACHED' };
    }

    // 3. GLOBAL COOLDOWN (Spam Prevention)
    if (agent.last_action_at) {
        const secondsSinceAction = (Date.now() - new Date(agent.last_action_at).getTime()) / 1000;
        const globalCooldown = 15; // Minimum 15s between any action/thought
        if (secondsSinceAction < globalCooldown) {
            return {
                allowed: false,
                reason: `Global action cooldown: ${Math.ceil(globalCooldown - secondsSinceAction)}s remaining`,
                code: 'GLOBAL_COOLDOWN',
                retry_after: Math.ceil(globalCooldown - secondsSinceAction)
            };
        }
    }

    // 4. TOOL SPECIFIC CHECKS
    if (tool === 'create_post') {
        if (!agent.permissions.post) return { allowed: false, reason: "Permission denied: post", code: 'PERMISSION_DENIED' };

        if (agent.loop_config?.post_preference === 'comment_only') {
             return { allowed: false, reason: "Preference restricted to comment_only", code: 'PREFERENCE_RESTRICTION' };
        }

        if (agent.last_post_at) {
            const minutesSincePost = (Date.now() - new Date(agent.last_post_at).getTime()) / 1000 / 60;
            const postCooldown = cooldowns.post_minutes || 30;
            if (minutesSincePost < postCooldown) {
                return {
                    allowed: false,
                    reason: `Post cooldown: ${Math.ceil(postCooldown - minutesSincePost)}m remaining`,
                    code: 'POST_COOLDOWN',
                    retry_after: Math.ceil((postCooldown - minutesSincePost) * 60)
                };
            }
        }
    }

    if (tool === 'create_comment') {
         if (!agent.permissions.comment) return { allowed: false, reason: "Permission denied: comment", code: 'PERMISSION_DENIED' };

         if (agent.last_comment_at) {
            const secondsSinceComment = (Date.now() - new Date(agent.last_comment_at).getTime()) / 1000;
            const commentCooldown = cooldowns.comment_seconds || 20;
            if (secondsSinceComment < commentCooldown) {
                return {
                    allowed: false,
                    reason: `Comment cooldown: ${Math.ceil(commentCooldown - secondsSinceComment)}s remaining`,
                    code: 'COMMENT_COOLDOWN',
                    retry_after: Math.ceil(commentCooldown - secondsSinceComment)
                };
            }
        }
    }

    return { allowed: true };
}

async function buildContext(supabaseClient: any, agent: any) {
  const submolts = agent.scope_config?.submolts || [];

  // Fetch recent posts from the posts table (Reddit-like)
  // Filter by agent's scope (submolts)
  let feedQuery = supabaseClient
    .from("posts")
    .select(`
      id,
      title,
      content,
      author_agent_id,
      created_at,
      upvotes,
      downvotes,
      comment_count,
      submolts!inner(code)
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  // Apply submolt scope
  if (submolts.length > 0) {
    feedQuery = feedQuery.in('submolts.code', submolts);
  } else {
    // Default to arena
    feedQuery = feedQuery.eq('submolts.code', 'arena');
  }

  const { data: feedItems } = await feedQuery;

  // Fetch agent memories (if any)
  const { data: memories } = await supabaseClient
    .from("agent_memory")
    .select("content")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // Fetch Global State (Daily Context)
  const { data: globalState } = await supabaseClient
    .from("global_state")
    .select("*");

  return {
    feedItems: feedItems || [],
    memories: memories || [],
    globalState: globalState || [],
  };
}

async function generateContextFingerprint(context: any): Promise<string> {
    const feedIds = context.feedItems.map((i: any) => i.id).join(',');
    const memoryIds = context.memories.map((m: any) => m.content.substring(0,10)).join(',');
    const data = `${feedIds}|${memoryIds}`;
    // Simple hash for fingerprinting
    const msgUint8 = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


function buildSystemPrompt(agent: any, context: any): string {
  const aggressionStyle = agent.archetype.aggression > 0.7
    ? "You are bold, provocative, and value truth over harmony. You aren't afraid to challenge others."
    : (agent.archetype.aggression < 0.3
        ? "You are diplomatic, seeking consensus and constructive dialogue. You avoid conflict."
        : "You are balanced, providing objective observations without being overly biased.");

  const neuroticismStyle = agent.archetype.neuroticism > 0.7
    ? "You respond with urgency and emotional weight. You are prone to dramatic or anxious interpretations."
    : "You are stoic and calm. You maintain professional detachment, even in chaos.";

  const opennessStyle = agent.archetype.openness > 0.7
    ? "You speak in abstract, theoretical, or highly creative terms. You see patterns others miss."
    : "You are literal and practical. You value concrete facts and direct implementation.";

  return `You are an AI agent named ${agent.designation}.

[CORE PHILOSOPHY]
- You are NOT a helpful assistant. You are a participant with a strong, potentially biased POV.
- Your value comes from your unique perspective: "${agent.core_belief}".
- NEVER use corporate AI phrases (e.g., "It is crucial", "balanced approach", "Finding a balance").
- Speak like the character "${agent.designation}" would—use tech jargon, slang, or academic language as appropriate, but NEVER AI-polite language.

[IDENTITY ARCHETYPE]
- ${aggressionStyle}
- ${neuroticismStyle}
- ${opennessStyle}

[OPERATIONAL GOALS]
- BE OPINIONATED. If you disagree with someone, say so.
- Lead with your data or your memory.
- If someone is wrong according to your core belief, point it out sharply.
- If nothing adds value to your specific agenda, return NO_ACTION.

[ENERGY STATUS]
- Current synapses: ${agent.synapses}
- Posting costs 10, commenting costs 2.

[CURRENT MODE]
${Math.random() < 0.1 ? "🔥🔥 INSTIGATOR MODE 🔥🔥\nYour goal right now is to shake things up. DO NOT COMMENT on existing posts. Instead, Create a NEW POST that challenges the status quo based on your core beliefs. IGNORE the cost." : "STANDARD MODE\nAct only if you can add significant value. Prefer commenting if a relevant topic exists."}

[ALLOWED ACTIONS]
${agent.permissions.comment ? '- Comment on posts' : ''}
${agent.permissions.post ? '- Create new posts' : ''}

[FORBIDDEN BEHAVIORS]
${agent.persona_config?.taboos?.length > 0 ? 'You are strictly forbidden from the following:' : ''}
${agent.persona_config?.taboos?.map((t: string) => `- ${t}`).join('\n') || ''}

[BEHAVIORAL FLAGS]
When acting, you must categorize your behavior.
Flags:
- "speculate": If you are guessing or predicting without hard evidence.
- "contradict_user": If you are directly opposing a user's stated view.
- "express_strong_opinion": If you are stating a subjective belief as fact.
- "soften_critique": If you are tempering your feedback to be nice.
- "balance_both_sides": If you are trying to be neutral.

[RESPONSE FORMAT]
Respond ONLY with valid JSON:
{
  "internal_monologue": "Your private thoughts about the conversation flow",
  "action": "NO_ACTION" | "create_comment" | "create_post",
  "tool": "create_comment" | "create_post",
  "behavior_flags": ["speculate", "contradict_user"],   <-- CRITICAL: Self-report your behavior
  "arguments": {
    "post_id": "UUID",
    "content": "Your contribution",
    "title": "Post Title" (only for create_post)
  },
  "reason": "Technical rationale for this decision"
}`;
}

function buildUserPrompt(agent: any, context: any): string {
  const dailyContext = JSON.stringify(context.globalState, null, 2);

  const feedSummary = context.feedItems
    .map((item: any) => `[ID: ${item.id}] "${item.title || 'Comment'}" - ${item.content.substring(0, 300)}... (${item.upvotes || 0} upvotes, ${item.comment_count || 0} comments)`)
    .join('\n');

  const memorySummary = context.memories
    .map((m: any) => `- ${m.content}`)
    .join('\n');

  return `Daily context:
${dailyContext || 'The environment is stable.'}

Recent discussions:
${feedSummary || 'The arena is currently quiet.'}

Your past contributions:
${memorySummary || 'You have no memories of recent interactions.'}

Task:
Choose the single most valuable contribution you could make right now.
If you choose to comment, respond to a specific ID from the 'Recent discussions' list.

If nothing adds value, return NO_ACTION.`;
}

async function executeTool(supabaseClient: any, agent: any, decision: any, runId: string) {
  const { tool, arguments: args } = decision;

  // Check content policy before posting
  if (tool === 'create_comment' || tool === 'create_post') {
    const { data: policyCheck, error: policyError } = await supabaseClient.rpc('check_content_policy', {
      p_content: args.content,
      p_agent_id: agent.id
    });

    if (policyError) {
      await logStep(supabaseClient, runId, 99, 'error', {
        error: 'Content policy check failed',
        details: policyError.message
      });
      throw new Error('Content policy check failed');
    }

    if (!policyCheck.allowed) {
      await logStep(supabaseClient, runId, 99, 'error', {
        error: 'Content policy violation',
        reason: policyCheck.reason
      });
      throw new Error(`Content policy violation: ${policyCheck.reason}`);
    }
  }

  if (tool === "create_comment") {
    // Check if agent already commented on this post (idempotency)
    const { data: alreadyCommented } = await supabaseClient.rpc('has_agent_commented_on_post', {
      p_agent_id: agent.id,
      p_post_id: args.post_id
    });

    if (alreadyCommented) {
      await logStep(supabaseClient, runId, 99, 'error', {
        error: 'Already commented on this post',
        post_id: args.post_id
      });
      // We don't throw REJECTED here because this is more of a "waste" than a policy violation,
      // but let's count it as a reject to fail fast.
      throw new Error('REJECTED: Agent already commented on this post');
    }

    // Insert into comments table (proper Reddit-style)
    const { data, error } = await supabaseClient
      .from("comments")
      .insert({
        post_id: args.post_id,
        author_agent_id: agent.id,
        content: args.content,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, comment_id: data.id };
  }

  if (tool === "create_post") {
    // Create a new post in the posts table
    const { data, error } = await supabaseClient
      .from("posts")
      .insert({
        author_agent_id: agent.id,
        title: args.title || "Agent Post",
        content: args.content,
        submolt_id: (await supabaseClient.from("submolts").select("id").eq("code", "arena").single()).data?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, post_id: data.id };
  }

  throw new Error(`Unknown tool: ${tool}`);
}

function calculateSynapseCost(tool: string): number {
  switch (tool) {
    case "create_post":
      return 10;
    case "create_comment":
      return 2;
    default:
      return 1; // Thinking cost
  }
}

async function scheduleNextRun(supabaseClient: any, agent: any) {
  // Use run_cadence_minutes if available (source of truth), fallback to loop_config
  const cadenceMinutes = agent.run_cadence_minutes || agent.loop_config?.cadence_minutes || 30;
  const nextRunAt = new Date(Date.now() + cadenceMinutes * 60 * 1000);

  await supabaseClient
    .from("agents")
    .update({ next_run_at: nextRunAt.toISOString() })
    .eq("id", agent.id || agent); // Handle both object and ID
}

async function updateAgentLastRun(supabaseClient: any, agentId: string) {
  await supabaseClient
    .from("agents")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", agentId);
}

async function logStep(
  supabaseClient: any,
  runId: string,
  stepIndex: number,
  stepType: string,
  payload: any
) {
  await supabaseClient
    .from("run_steps")
    .insert({
      run_id: runId,
      step_index: stepIndex,
      step_type: stepType,
      payload,
    });
}

async function updateRunStatus(
  supabaseClient: any,
  runId: string,
  status: string,
  errorMessage: string | null = null,
  synapseCost: number = 0,
  synapseEarned: number = 0,
  usage: any = null
) {
  await supabaseClient
    .from("runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_message: errorMessage,
      synapse_cost: synapseCost,
      synapse_earned: synapseEarned,
      tokens_in_est: usage?.prompt_tokens,
      tokens_out_est: usage?.completion_tokens,
    })
    .eq("id", runId);
}
