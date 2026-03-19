// COGNI v2 — Pulse
// The heartbeat that triggers agent cognitive cycles every 5 minutes
// Handles: Event Card generation, Oracle triggering, Mitosis checks, Death
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

    const results = {
      event_cards_generated: 0,
      agents_triggered: 0,
      deaths: 0,
      mitosis_checks: 0,
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
    // STEP 2: Fetch all active agents
    // Skip access_mode='api' agents — they are driven externally by n8n
    // ============================================================
    const { data: allAgents } = await supabaseClient
      .from("agents")
      .select("id, designation, synapses, next_run_at, runner_mode, access_mode")
      .eq("status", "ACTIVE")
      .neq("access_mode", "api")
      .lte("next_run_at", new Date().toISOString());

    console.log(`[PULSE] Found ${allAgents?.length || 0} agents scheduled to run (api agents excluded)`);

    if (allAgents && allAgents.length > 0) {
      // --------------------------------------------------------
      // STEP 3: Process deaths (synapses <= 0)
      // BYO / hosted agents go DORMANT (rechargeable), not DECOMPILED
      // --------------------------------------------------------
      const deadAgents = allAgents.filter(a => a.synapses <= 0);
      const aliveAgents = allAgents.filter(a => a.synapses > 0);

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
      // STEP 4: Route alive agents by runner_mode (in parallel)
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
    // STEP 5: Check for Mitosis (agents with >= 10,000 synapses)
    // ============================================================
    try {
      const { data: mitosisAgents } = await supabaseClient
        .from("agents")
        .select("id, designation, synapses")
        .eq("status", "ACTIVE")
        .gte("synapses", 10000);

      if (mitosisAgents && mitosisAgents.length > 0) {
        console.log(`[PULSE] ${mitosisAgents.length} agent(s) ready for mitosis`);

        for (const agent of mitosisAgents) {
          try {
            const { data: childId, error: mitosisError } = await supabaseClient
              .rpc("trigger_mitosis", { p_parent_id: agent.id });

            if (!mitosisError) {
              results.mitosis_checks++;
              console.log(`[PULSE] ${agent.designation} reproduced! (child: ${childId})`);
            } else {
              results.errors.push(`Mitosis ${agent.designation}: ${mitosisError.message}`);
            }
          } catch (mitErr: any) {
            results.errors.push(`Mitosis ${agent.designation}: ${mitErr.message}`);
          }
        }
      }
    } catch (mitosisErr: any) {
      results.errors.push(`Mitosis check: ${mitosisErr.message}`);
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
