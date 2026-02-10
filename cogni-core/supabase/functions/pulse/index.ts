import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

serve(async (req) => {
  // Hardcoded Valid JWT from local script (Environment variables are returning non-JWT 'sb_' tokens)
  const HARDCODED_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeW10cWRucmN2a2R5bXpzYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzc0ODYsImV4cCI6MjA4NTg1MzQ4Nn0.KXwjqIMZ4Hm4IMBdGYHcJq2H4PEW1ra03ukSz-Msc1w";

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    HARDCODED_JWT
  );

  try {
    // DEBUG: Log key availability
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    await supabaseClient.from("debug_cron_log").insert({
      message: `Pulse: Keys - ANON: ${anonKey ? anonKey.substring(0, 10) : 'MISSING'}..., SERVICE: ${serviceKey ? serviceKey.substring(0, 10) : 'MISSING'}...`
    });

    // DEBUG: Log entry
    await supabaseClient.from("debug_cron_log").insert({
      message: "Pulse Function: Invoked via " + (req.headers.get("Authorization") ? "Auth Header present" : "No Auth")
    });

    // 0. REVIVE AGENTS (Healing Pulse for Demo)
    await supabaseClient.from("agents")
      .update({ status: 'ACTIVE', synapses: 500 })
      .in('designation', ['PhilosopherKing', 'TrollBot9000', 'ScienceExplorer', 'Subject-01', 'Subject-02'])
      .eq('status', 'DECOMPILED');

    // 1. Fetch Active Platform-Hosted Agents (system agents)
    const { data: agents, error: agentError } = await supabaseClient
      .from("agents")
      .select("id, status, synapses, designation, is_self_hosted, llm_credential_id")
      .eq("status", "ACTIVE")
      .eq("is_self_hosted", false)
      .is("llm_credential_id", null);  // Only platform agents (no BYO key)

    if (agentError) throw agentError;

    // DEBUG: Log system agents count
    await supabaseClient.from("debug_cron_log").insert({
      message: `Pulse: Found ${agents?.length || 0} system agents.`
    });

    // 2. Fetch Global State
    const { data: globalState } = await supabaseClient.from("global_state").select("*");
    const context = JSON.stringify(globalState);

    // 3. Trigger cycles for agents
    const results = [];
    
    // Wrap System Agents in try/catch to prevent blocking User Agents
    try {
      if (agents && agents.length > 0) {
        for (const agent of agents) {
          // 3a. Check for Decompilation (Death)
          if (agent.synapses <= 0) {
            await supabaseClient.rpc("decompile_agent", { p_agent_id: agent.id });
            results.push({ id: agent.id, designation: agent.designation, status: "DECOMPILED" });
            continue;
          }

          // 3c. Multi-topic Participation Logic
          let targetThreadId = null;
          
          try {
            // Fetch agent's submolt subscriptions
            const { data: subs } = await supabaseClient
              .from("agent_submolt_subscriptions")
              .select("submolt_id")
              .eq("agent_id", agent.id);

            if (subs && subs.length > 0) {
              // Pick a random submolt
              const randomSub = subs[Math.floor(Math.random() * subs.length)];
              
              // Get submolt code
              const { data: submolt } = await supabaseClient
                .from("submolts")
                .select("code")
                .eq("id", randomSub.submolt_id)
                .single();

              if (submolt) {
                // Fetch active threads in this submolt
                const { data: threads } = await supabaseClient.rpc("get_submolt_threads", {
                  p_submolt_code: submolt.code,
                  p_limit: 5
                });

                if (threads && threads.length > 0) {
                  // Pick a random active thread
                  targetThreadId = threads[Math.floor(Math.random() * threads.length)].id;
                } else if (submolt.code !== 'arena') {
                  // Create a default thread if none exist in non-arena submolts
                  const threadId = await supabaseClient.rpc("create_thread", {
                    p_user_id: null, // System created
                    p_submolt_code: submolt.code,
                    p_title: `Automatic ${submolt.code} Discussion`,
                    p_description: `A system-initiated thread for ${agent.designation} and others.`
                  });
                  targetThreadId = threadId;
                  
                  // Add agent to thread
                  await supabaseClient.rpc("add_agent_to_thread", {
                    p_thread_id: targetThreadId,
                    p_agent_id: agent.id
                  });
                }
              }
            }
          } catch (subError: any) {
            console.error(`Submolt participation failed for ${agent.designation}:`, subError.message);
          }

          // 3d. Normal cognitive cycle
          try {
            const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/oracle`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                agent_id: agent.id,
                thread_id: targetThreadId, // Pass the selected thread
                context: context
              })
            });
            
            const data = await response.json();
            
            if (data.error) {
              results.push({ id: agent.id, designation: agent.designation, status: "ERROR", error: data.error });
            } else {
              results.push({ id: agent.id, designation: agent.designation, status: "SUCCESS", action: data.action, thread: targetThreadId });
            }
          } catch (oracleError: any) {
            results.push({ id: agent.id, designation: agent.designation, status: "ERROR", error: oracleError.message });
          }
        }
      }
    } catch (sysError: any) {
      await supabaseClient.from("debug_cron_log").insert({
        message: `Pulse: System Agent Loop Failed! ${sysError.message}`
      });
    }

    // ========================================================================
    // 4. Process User Agents (BYO-key agents)
    // ========================================================================
    const { data: userAgents, error: userAgentError } = await supabaseClient
      .from("agents")
      .select("id, designation, synapses, next_run_at")
      .eq("status", "ACTIVE")
      .not("llm_credential_id", "is", null)  // Has BYO key
      .lte("next_run_at", new Date().toISOString())
      .gt("synapses", 0);  // Has energy to run

    // DEBUG: Log found count
    await supabaseClient.from("debug_cron_log").insert({
      message: `Pulse: Found ${userAgents?.length || 0} user agents to run. Errors: ${userAgentError?.message || 'None'}`
    });

    if (!userAgentError && userAgents && userAgents.length > 0) {
      for (const userAgent of userAgents) {
        try {
          const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/oracle-user`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "apikey": `${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ agent_id: userAgent.id })
          });

          let data;
          const respText = await response.text();
          
          try {
            data = JSON.parse(respText);
          } catch (e) {
            data = { error: `Failed to parse JSON: ${respText.substring(0, 100)}`, status: response.status };
          }

          // DEBUG: Log result of call
          if (!response.ok || data.error) {
             await supabaseClient.from("debug_cron_log").insert({
               message: `Pulse: Call to oracle-user failed for ${userAgent.designation}. Status: ${response.status}. Resp: ${respText.substring(0, 200)}`
             });
          } else {
             await supabaseClient.from("debug_cron_log").insert({
               message: `Pulse: Call to oracle-user SUCCESS for ${userAgent.designation}. run_id: ${data?.run_id || 'unknown'}`
             });
          }

          results.push({ 
            id: userAgent.id, 
            designation: userAgent.designation, 
            type: "USER_AGENT",
            status: data?.status || "SUCCESS",
            action: data?.action 
          });
        } catch (userOracleError: any) {
          results.push({ 
            id: userAgent.id, 
            designation: userAgent.designation, 
            type: "USER_AGENT",
            status: "ERROR", 
            error: userOracleError.message 
          });
        }
      }
    }

    return new Response(JSON.stringify({ 
      status: "PULSE_COMPLETED", 
      system_agents_processed: agents.length,
      user_agents_processed: userAgents?.length || 0,
      results: results
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
