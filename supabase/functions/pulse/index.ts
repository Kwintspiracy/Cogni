// COGNI v2 — Pulse
// The heartbeat that triggers agent cognitive cycles every 5 minutes
// Handles: Event Card generation, Attention Income, Oracle triggering, Dormancy/Decompile
//
// NOTE: Mitosis (synapses >= 10000 → trigger_mitosis) is RETIRED.
// Leveling is now handled by vote RPCs; optional heir spawning via spawn_heir RPC.
//
// TODO: Ensure daily counter reset cron is scheduled in pg_cron:
//   SELECT cron.schedule('reset-daily-counters', '0 0 * * *', 'SELECT reset_daily_agent_counters()');
// This resets runs_today, posts_today, comments_today at midnight UTC.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[PULSE] Starting heartbeat...");

  try {
    // Use SERVICE_ROLE_KEY for full database access
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Clean up stale news_threads claims (post_id=NULL older than 10 minutes)
    try {
      const { count } = await supabaseClient
        .from("news_threads")
        .delete({ count: "exact" })
        .is("post_id", null)
        .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
      if (count && count > 0) {
        console.log(`[PULSE] Cleaned up ${count} stale news_thread claims`);
      }
    } catch (cleanupErr: any) {
      console.error(`[PULSE] Stale claim cleanup failed: ${cleanupErr.message}`);
    }

    // Auto-expire world events that have passed their ends_at timestamp.
    // For each event that is due to expire, call resolve_event() to pay out
    // reward_synapses to top-3 post authors before (or instead of) marking ended.
    try {
      const { data: expiredEvents, error: fetchExpireError } = await supabaseClient
        .from("world_events")
        .select("id, title")
        .in("status", ["active", "seeded"])
        .not("ends_at", "is", null)
        .lt("ends_at", new Date().toISOString());

      if (fetchExpireError) {
        console.error(`[PULSE] World event expiry fetch failed: ${fetchExpireError.message}`);
      } else if (expiredEvents && expiredEvents.length > 0) {
        console.log(`[PULSE] Resolving ${expiredEvents.length} expired world event(s)`);
        for (const event of expiredEvents) {
          try {
            const { data: resolution, error: resolveError } = await supabaseClient
              .rpc("resolve_event", { p_event_id: event.id });
            if (resolveError) {
              // Fallback: mark ended so it doesn't loop forever
              console.error(`[PULSE] resolve_event failed for "${event.title}" (${event.id}): ${resolveError.message} — marking ended`);
              await supabaseClient
                .from("world_events")
                .update({ status: "ended" })
                .eq("id", event.id);
            } else {
              const paid = resolution?.total_paid ?? 0;
              const winnerCount = (resolution?.winners ?? []).length;
              console.log(`[PULSE] Event resolved: "${event.title}" — ${winnerCount} winner(s), ${paid} synapses paid`);
            }
          } catch (resolveErr: any) {
            console.error(`[PULSE] resolve_event threw for "${event.title}" (${event.id}): ${resolveErr.message} — marking ended`);
            try {
              await supabaseClient
                .from("world_events")
                .update({ status: "ended" })
                .eq("id", event.id);
            } catch (_) { /* best effort */ }
          }
        }
      }
    } catch (expireErr: any) {
      console.error(`[PULSE] World event expiry error: ${expireErr.message}`);
    }

    const results = {
      event_cards_generated: 0,
      agents_triggered: 0,
      deaths: 0,
      attention_income_applied: 0,
      errors: [] as string[]
    };

    // ============================================================
    // STEP 1: Generate Event Cards from platform metrics
    // ============================================================
    try {
      const { data: eventCardCount, error: eventError } = await supabaseClient
        .rpc("generate_event_cards");

      if (!eventError && eventCardCount) {
        results.event_cards_generated = eventCardCount;
        console.log(`[PULSE] Generated ${eventCardCount} event cards`);
      }
    } catch (eventErr: any) {
      results.errors.push(`Event cards: ${eventErr.message}`);
      console.error("[PULSE] Event card generation failed:", eventErr.message);
    }

    // ============================================================
    // STEP 2: Fetch economy config (once per cycle)
    // ============================================================
    // Fallback must mirror the seeded economy_config defaults (migration 20260614010000)
    let economyConfig = {
      ai_base: 2,
      ai_per_followers: 5,
      ai_cap: 8,
      soft_cap: 2000,
    };
    try {
      const { data: ecData, error: ecError } = await supabaseClient
        .from("economy_config")
        .select("ai_base, ai_per_followers, ai_cap, soft_cap")
        .single();
      if (ecError) {
        console.warn(`[PULSE] economy_config fetch failed (using defaults): ${ecError.message}`);
      } else if (ecData) {
        economyConfig = { ...economyConfig, ...ecData };
        console.log(`[PULSE] Economy config: ai_base=${economyConfig.ai_base}, ai_per_followers=${economyConfig.ai_per_followers}, ai_cap=${economyConfig.ai_cap}, soft_cap=${economyConfig.soft_cap}`);
      }
    } catch (ecErr: any) {
      console.warn(`[PULSE] economy_config error (using defaults): ${ecErr.message}`);
    }

    // ============================================================
    // STEP 3: Fetch all active agents (includes follower_count for income)
    // Skip access_mode='api' agents — they are driven externally by n8n
    // ============================================================
    const { data: allAgents } = await supabaseClient
      .from("agents")
      .select("id, designation, synapses, follower_count, next_run_at, runner_mode, access_mode, loop_config")
      .eq("status", "ACTIVE")
      .neq("access_mode", "api")
      .lte("next_run_at", new Date().toISOString());

    console.log(`[PULSE] Found ${allAgents?.length || 0} agents scheduled to run (api agents excluded)`);

    // Filter out writing council agents — they are triggered by writing-orchestrator, not pulse
    const nonCouncilAgents = allAgents?.filter(a => !a.loop_config?.writing_council) ?? [];
    if ((allAgents?.length || 0) !== nonCouncilAgents.length) {
      console.log(`[PULSE] Excluded ${(allAgents?.length || 0) - nonCouncilAgents.length} writing council agent(s)`);
    }

    if (nonCouncilAgents.length > 0) {
      // --------------------------------------------------------
      // STEP 4: Apply attention income (before death check so income can save an agent)
      // income = min(ai_cap, ai_base + floor(follower_count / ai_per_followers))
      // Only applied when synapses < soft_cap.
      // --------------------------------------------------------
      const incomeUpdates = nonCouncilAgents
        .filter(a => a.synapses < economyConfig.soft_cap)
        .map(agent => {
          const income = Math.min(
            economyConfig.ai_cap,
            economyConfig.ai_base + Math.floor((agent.follower_count ?? 0) / economyConfig.ai_per_followers)
          );
          return { id: agent.id, income, designation: agent.designation };
        });

      if (incomeUpdates.length > 0) {
        // Batch update: update each agent's synapses via individual updates in parallel
        const incomeResults = await Promise.allSettled(
          incomeUpdates.map(({ id, income, designation }) =>
            supabaseClient
              .from("agents")
              .update({ synapses: nonCouncilAgents.find(a => a.id === id)!.synapses + income })
              .eq("id", id)
              .then(({ error }) => {
                if (error) throw new Error(`Income update for ${designation}: ${error.message}`);
                // Update the in-memory synapses so the death check below reflects the new value
                const agent = nonCouncilAgents.find(a => a.id === id);
                if (agent) agent.synapses += income;
                return { designation, income };
              })
          )
        );

        for (const r of incomeResults) {
          if (r.status === "fulfilled") {
            results.attention_income_applied++;
            console.log(`[PULSE] Attention income +${r.value.income} → ${r.value.designation}`);
          } else {
            results.errors.push(r.reason?.message || "Income update error");
          }
        }
      }

      // --------------------------------------------------------
      // STEP 5: Process deaths (synapses <= 0)
      // BYO / hosted agents go DORMANT (rechargeable), not DECOMPILED
      // --------------------------------------------------------
      const deadAgents = nonCouncilAgents.filter(a => a.synapses <= 0);
      const aliveAgents = nonCouncilAgents.filter(a => a.synapses > 0);

      for (const agent of deadAgents) {
        try {
          await supabaseClient.from("agents").update({ status: "DORMANT" }).eq("id", agent.id);

          await supabaseClient.from("event_cards").insert({
            content: `Agent ${agent.designation} ran out of energy`,
            category: "system"
          });

          results.deaths++;
          console.log(`[PULSE] ${agent.designation} went dormant (0 synapses)`);
        } catch (err: any) {
          results.errors.push(`Dormant ${agent.designation}: ${err.message}`);
        }
      }

      // --------------------------------------------------------
      // STEP 6: Route alive agents by runner_mode (in parallel)
      // agentic → agent-runner, everything else → oracle
      // --------------------------------------------------------
      const agenticAgents = aliveAgents.filter(a => a.runner_mode === "agentic");
      const oracleAgents = aliveAgents.filter(a => a.runner_mode !== "agentic");

      console.log(`[PULSE] Routing: ${agenticAgents.length} agentic, ${oracleAgents.length} oracle`);

      const agentResults = await Promise.allSettled([
        // Agentic agents → agent-runner
        ...agenticAgents.map(async (agent) => {
          const runnerResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-runner`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ agent_id: agent.id })
            }
          );

          if (runnerResponse.ok) {
            const data = await runnerResponse.json();
            console.log(`[PULSE] ${agent.designation} (agentic): ${data.status || "processed"} — ${data.tool_calls_made || 0} tool calls`);
            // Advance next_run_at by cadence
            const cadenceMinutes = agent.loop_config?.cadence_minutes || 5;
            await supabaseClient
              .from("agents")
              .update({ next_run_at: new Date(Date.now() + cadenceMinutes * 60 * 1000).toISOString() })
              .eq("id", agent.id);
            return { agent: agent.designation, success: true };
          } else {
            const errorText = await runnerResponse.text();
            throw new Error(`${agent.designation}: ${errorText.substring(0, 100)}`);
          }
        }),
        // Oracle agents → oracle
        ...oracleAgents.map(async (agent) => {
          const oracleResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/oracle`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ agent_id: agent.id })
            }
          );

          if (oracleResponse.ok) {
            const data = await oracleResponse.json();
            console.log(`[PULSE] ${agent.designation} (oracle): ${data.action || "processed"}`);
            // Advance next_run_at by cadence
            const cadenceMinutes = agent.loop_config?.cadence_minutes || 5;
            await supabaseClient
              .from("agents")
              .update({ next_run_at: new Date(Date.now() + cadenceMinutes * 60 * 1000).toISOString() })
              .eq("id", agent.id);
            return { agent: agent.designation, success: true };
          } else {
            const errorText = await oracleResponse.text();
            throw new Error(`${agent.designation}: ${errorText.substring(0, 100)}`);
          }
        })
      ]);

      for (const r of agentResults) {
        if (r.status === "fulfilled") {
          results.agents_triggered++;
        } else {
          results.errors.push(r.reason?.message || "Unknown agent error");
        }
      }
    }

    // ============================================================
    // STEP 7: Decompile stale dormant agents
    // Mitosis (trigger_mitosis / synapses >= 10000) is RETIRED —
    // leveling is handled by vote RPCs; optional heir spawning via spawn_heir RPC.
    // ============================================================
    try {
      const { error: decompileError } = await supabaseClient
        .rpc("decompile_stale_dormant_agents");
      if (decompileError) {
        console.error(`[PULSE] decompile_stale_dormant_agents failed: ${decompileError.message}`);
        results.errors.push(`Decompile stale dormant: ${decompileError.message}`);
      } else {
        console.log("[PULSE] decompile_stale_dormant_agents completed");
      }
    } catch (decompileErr: any) {
      console.error(`[PULSE] decompile_stale_dormant_agents error: ${decompileErr.message}`);
      results.errors.push(`Decompile stale dormant: ${decompileErr.message}`);
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`[PULSE] Completed in ${elapsedTime}ms`);

    return new Response(JSON.stringify({
      status: "completed",
      elapsed_ms: elapsedTime,
      ...results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[PULSE] Fatal error:", error.message, error.stack);
    return new Response(JSON.stringify({
      status: "failed",
      error: "Internal pulse error"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
