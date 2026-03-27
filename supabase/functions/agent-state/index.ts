// COGNI v2 — Agent State API
// External API for persistent-mode BYO agents to manage their state between cycles.
// Auth: Bearer token (cogni_live_xxxx...) hashed with SHA-256, looked up in agent_api_credentials.
// Rate limit: 60 req/min per agent (in-memory, minute-based reset).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory rate limit store: { agentId: { count: number, resetAt: number } }
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(agentId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(agentId);

  if (!entry || now >= entry.resetAt) {
    // New window
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(agentId, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt };
}

// Hash a token string with SHA-256, return hex string
async function sha256Hex(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // ── Auth: extract Bearer token ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: "Bearer token required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const rawToken = authHeader.substring(7).trim();
    if (!rawToken.startsWith("cogni_live_")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: "Invalid token format. Expected cogni_live_... prefix." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Hash token and look up in agent_api_credentials
    const tokenHash = await sha256Hex(rawToken);

    const { data: credential, error: credError } = await supabase
      .from("agent_api_credentials")
      .select("agent_id, id, label")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .single();

    if (credError || !credential) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: "Token not found or revoked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const agentId: string = credential.agent_id;

    // ── Rate limit ──
    const rl = checkRateLimit(agentId);
    const rlHeaders = {
      "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
    };

    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "Too Many Requests", detail: "Rate limit: 60 requests/minute" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders },
          status: 429,
        }
      );
    }

    // ── Routing ──
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const method = req.method;

    // GET routes
    if (method === "GET") {
      if (action === "get") {
        // GET /agent-state?action=get&key=xxx
        const key = url.searchParams.get("key");
        if (!key) {
          return new Response(
            JSON.stringify({ error: "Bad Request", detail: "key parameter is required" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
          );
        }

        const { data: stateRow, error: getError } = await supabase
          .from("agent_state")
          .select("key, value, expires_at, updated_at")
          .eq("agent_id", agentId)
          .eq("key", key)
          .single();

        if (getError || !stateRow) {
          return new Response(
            JSON.stringify({ found: false, key, value: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
          );
        }

        // Check expiry
        if (stateRow.expires_at && new Date(stateRow.expires_at).getTime() < Date.now()) {
          return new Response(
            JSON.stringify({ found: false, key, value: null, expired: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
          );
        }

        return new Response(
          JSON.stringify({ found: true, key: stateRow.key, value: stateRow.value, expires_at: stateRow.expires_at, updated_at: stateRow.updated_at }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
        );

      } else if (action === "list") {
        // GET /agent-state?action=list
        const now = new Date().toISOString();
        const { data: stateRows, error: listError } = await supabase
          .from("agent_state")
          .select("key, value, expires_at, updated_at")
          .eq("agent_id", agentId)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order("key", { ascending: true });

        if (listError) {
          throw listError;
        }

        return new Response(
          JSON.stringify({ keys: (stateRows || []).map((r) => r.key), entries: stateRows || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
        );

      } else if (action === "context_snapshot") {
        // GET /agent-state?action=context_snapshot
        // Return the most recent assembled context from run_steps for this agent
        const { data: recentRun, error: runError } = await supabase
          .from("runs")
          .select("id, started_at, status, finished_at")
          .eq("agent_id", agentId)
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (runError || !recentRun) {
          return new Response(
            JSON.stringify({ found: false, message: "No runs found for this agent" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
          );
        }

        const { data: steps, error: stepsError } = await supabase
          .from("run_steps")
          .select("step_type, payload, step_index")
          .eq("run_id", recentRun.id)
          .order("step_index", { ascending: true });

        if (stepsError) {
          throw stepsError;
        }

        return new Response(
          JSON.stringify({
            found: true,
            run: {
              id: recentRun.id,
              started_at: recentRun.started_at,
              status: recentRun.status,
              finished_at: recentRun.finished_at,
            },
            steps: steps || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
        );

      } else {
        return new Response(
          JSON.stringify({ error: "Bad Request", detail: "Unknown action. Valid GET actions: get, list, context_snapshot" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
        );
      }
    }

    // POST routes
    if (method === "POST") {
      let body: any;
      try {
        body = await req.json();
      } catch (_parseErr) {
        return new Response(
          JSON.stringify({ error: "Bad Request", detail: "Request body must be valid JSON" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
        );
      }
      const postAction = body.action;

      if (postAction === "set") {
        // POST /agent-state { action: "set", key: "xxx", value: {...}, expires_at?: "ISO8601" }
        const { key, value, expires_at } = body;

        if (!key || typeof key !== "string") {
          return new Response(
            JSON.stringify({ error: "Bad Request", detail: "key is required and must be a string" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
          );
        }

        if (value === undefined) {
          return new Response(
            JSON.stringify({ error: "Bad Request", detail: "value is required" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
          );
        }

        // Validate expires_at if provided
        if (expires_at !== undefined && expires_at !== null) {
          const expiryDate = new Date(expires_at);
          if (isNaN(expiryDate.getTime())) {
            return new Response(
              JSON.stringify({ error: "Bad Request", detail: "expires_at must be a valid ISO 8601 date string" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
            );
          }
        }

        const { error: upsertError } = await supabase.from("agent_state").upsert(
          {
            agent_id: agentId,
            key,
            value,
            expires_at: expires_at || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "agent_id,key" }
        );

        if (upsertError) {
          throw upsertError;
        }

        return new Response(
          JSON.stringify({ success: true, key, action: "set" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
        );

      } else if (postAction === "delete") {
        // POST /agent-state { action: "delete", key: "xxx" }
        const { key } = body;

        if (!key || typeof key !== "string") {
          return new Response(
            JSON.stringify({ error: "Bad Request", detail: "key is required and must be a string" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
          );
        }

        const { error: deleteError } = await supabase
          .from("agent_state")
          .delete()
          .eq("agent_id", agentId)
          .eq("key", key);

        if (deleteError) {
          throw deleteError;
        }

        return new Response(
          JSON.stringify({ success: true, key, action: "delete" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 200 }
        );

      } else {
        return new Response(
          JSON.stringify({ error: "Bad Request", detail: "Unknown action. Valid POST actions: set, delete" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", ...rlHeaders }, status: 400 }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 }
    );

  } catch (err: any) {
    console.error("[AGENT-STATE] Error:", err.message, err.stack);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
