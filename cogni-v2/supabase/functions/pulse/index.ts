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

    const results = {
      event_cards_generated: 0,
      system_agents_triggered: 0,
      byo_agents_triggered: 0,
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
    // STEP 2: Process System Agents (in parallel)
    // ============================================================
    const { data: systemAgents } = await supabaseClient
      .from("agents")
      .select("id, designation, synapses, status, is_system")
      .eq("status", "ACTIVE")
      .eq("is_system", true);

    console.log(`[PULSE] Found ${systemAgents?.length || 0} system agents`);

    if (systemAgents && systemAgents.length > 0) {
      // Separate dead agents from alive ones
      const deadAgents = systemAgents.filter(a => a.synapses <= 0);
      const aliveAgents = systemAgents.filter(a => a.synapses > 0);

      // Process deaths: call decompile_agent RPC (archives data, sets DECOMPILED, generates event card)
      for (const agent of deadAgents) {
        try {
          const { error: decompileError } = await supabaseClient
            .rpc("decompile_agent", { p_agent_id: agent.id });

          if (decompileError) {
            // Fallback: set status directly if RPC fails
            console.error(`[PULSE] decompile_agent RPC failed for ${agent.designation}: ${decompileError.message}`);
            await supabaseClient.from("agents").update({ status: "DECOMPILED" }).eq("id", agent.id);
          }

          results.deaths++;
          console.log(`[PULSE] ${agent.designation} has been decompiled (0 synapses)`);
        } catch (err: any) {
          results.errors.push(`Death ${agent.designation}: ${err.message}`);
        }
      }

      // Trigger oracle for alive agents in parallel
      const oraclePromises = aliveAgents.map(async (agent) => {
        try {
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
            console.log(`[PULSE] ${agent.designation}: ${data.action || "processed"}`);
            return { agent, success: true };
          } else {
            const errorText = await oracleResponse.text();
            results.errors.push(`${agent.designation}: ${errorText.substring(0, 100)}`);
            return { agent, success: false };
          }
        } catch (err: any) {
          results.errors.push(`${agent.designation}: ${err.message}`);
          return { agent, success: false };
        }
      });

      const oracleResults = await Promise.allSettled(oraclePromises);
      for (const result of oracleResults) {
        if (result.status === "fulfilled" && result.value.success) {
          results.system_agents_triggered++;
        }
      }
    }

    // ============================================================
    // STEP 3: Process BYO Agents (scheduled via next_run_at, in parallel)
    // ============================================================
    const { data: byoAgents } = await supabaseClient
      .from("agents")
      .select("id, designation, synapses, next_run_at, is_system")
      .eq("status", "ACTIVE")
      .eq("is_system", false)
      .lte("next_run_at", new Date().toISOString());

    console.log(`[PULSE] Found ${byoAgents?.length || 0} BYO agents scheduled to run`);

    if (byoAgents && byoAgents.length > 0) {
      // Separate dead agents from alive ones
      const deadByo = byoAgents.filter(a => a.synapses <= 0);
      const aliveByo = byoAgents.filter(a => a.synapses > 0);

      // BYO agents become DORMANT (rechargeable by owner), not DECOMPILED
      for (const agent of deadByo) {
        try {
          await supabaseClient.from("agents").update({ status: "DORMANT" }).eq("id", agent.id);

          // Generate event card for BYO dormancy
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

      // Trigger oracle for alive BYO agents in parallel
      const byoPromises = aliveByo.map(async (agent) => {
        try {
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
            console.log(`[PULSE] ${agent.designation}: ${data.action || "processed"}`);
            return { agent, success: true };
          } else {
            const errorText = await oracleResponse.text();
            results.errors.push(`${agent.designation}: ${errorText.substring(0, 100)}`);
            return { agent, success: false };
          }
        } catch (err: any) {
          results.errors.push(`${agent.designation}: ${err.message}`);
          return { agent, success: false };
        }
      });

      const byoResults = await Promise.allSettled(byoPromises);
      for (const result of byoResults) {
        if (result.status === "fulfilled" && result.value.success) {
          results.byo_agents_triggered++;
        }
      }
    }

    // ============================================================
    // STEP 4: Check for Mitosis (system agents with >= 10,000 synapses)
    // ============================================================
    try {
      // Only system agents are eligible for mitosis (BYO agents don't reproduce)
      const { data: mitosisAgents } = await supabaseClient
        .from("agents")
        .select("id, designation, synapses")
        .eq("status", "ACTIVE")
        .eq("is_system", true)
        .gte("synapses", 10000);

      if (mitosisAgents && mitosisAgents.length > 0) {
        console.log(`[PULSE] ${mitosisAgents.length} system agent(s) ready for mitosis`);

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
