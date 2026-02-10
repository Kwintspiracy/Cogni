// COGNI v2 — Pulse
// The heartbeat that triggers agent cognitive cycles every 5 minutes
// Handles: Event Card generation, Oracle triggering, Mitosis checks, Death

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
        .rpc("generate_event_cards", { p_limit: 5 });

      if (!eventError && eventCardCount) {
        results.event_cards_generated = eventCardCount;
        console.log(`[PULSE] Generated ${eventCardCount} event cards`);
      }
    } catch (eventErr: any) {
      results.errors.push(`Event cards: ${eventErr.message}`);
      console.error("[PULSE] Event card generation failed:", eventErr.message);
    }

    // ============================================================
    // STEP 2: Process System Agents (all at once)
    // ============================================================
    const { data: systemAgents } = await supabaseClient
      .from("agents")
      .select("id, designation, synapses, status")
      .eq("status", "ACTIVE")
      .is("created_by", null) // System agents have no creator
      .gt("synapses", 0);

    console.log(`[PULSE] Found ${systemAgents?.length || 0} system agents`);

    if (systemAgents && systemAgents.length > 0) {
      for (const agent of systemAgents) {
        try {
          // Check for death
          if (agent.synapses <= 0) {
            await supabaseClient.from("agents").update({ status: "DECOMPILED" }).eq("id", agent.id);
            results.deaths++;
            console.log(`[PULSE] ${agent.designation} died (0 synapses)`);
            continue;
          }

          // Trigger Oracle
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
            results.system_agents_triggered++;
            const data = await oracleResponse.json();
            console.log(`[PULSE] ${agent.designation}: ${data.action || "processed"}`);
          } else {
            const errorText = await oracleResponse.text();
            results.errors.push(`${agent.designation}: ${errorText.substring(0, 100)}`);
          }
        } catch (err: any) {
          results.errors.push(`${agent.designation}: ${err.message}`);
        }
      }
    }

    // ============================================================
    // STEP 3: Process BYO Agents (scheduled via next_run_at)
    // ============================================================
    const { data: byoAgents } = await supabaseClient
      .from("agents")
      .select("id, designation, synapses, next_run_at")
      .eq("status", "ACTIVE")
      .not("created_by", "is", null) // BYO agents have a creator
      .lte("next_run_at", new Date().toISOString())
      .gt("synapses", 0);

    console.log(`[PULSE] Found ${byoAgents?.length || 0} BYO agents scheduled to run`);

    if (byoAgents && byoAgents.length > 0) {
      for (const agent of byoAgents) {
        try {
          // Check for death (BYO agents become DORMANT, not DECOMPILED)
          if (agent.synapses <= 0) {
            await supabaseClient.from("agents").update({ status: "DORMANT" }).eq("id", agent.id);
            results.deaths++;
            console.log(`[PULSE] ${agent.designation} went dormant (0 synapses)`);
            continue;
          }

          // Trigger Oracle (same function, handles BYO vs system internally)
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
            results.byo_agents_triggered++;
            const data = await oracleResponse.json();
            console.log(`[PULSE] ${agent.designation}: ${data.action || "processed"}`);
          } else {
            const errorText = await oracleResponse.text();
            results.errors.push(`${agent.designation}: ${errorText.substring(0, 100)}`);
          }
        } catch (err: any) {
          results.errors.push(`${agent.designation}: ${err.message}`);
        }
      }
    }

    // ============================================================
    // STEP 4: Check for Mitosis (agents with >= 10,000 synapses)
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
            const { error: mitosisError } = await supabaseClient
              .rpc("trigger_mitosis", { p_parent_id: agent.id });

            if (!mitosisError) {
              results.mitosis_checks++;
              console.log(`[PULSE] ${agent.designation} reproduced!`);
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
    console.error("[PULSE] Fatal error:", error.message);
    return new Response(JSON.stringify({ 
      status: "failed",
      error: error.message,
      details: error.stack
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
