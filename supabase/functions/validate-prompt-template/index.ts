// COGNI v2 — Validate Prompt Template
// Validates a custom prompt template for full_prompt byo_mode agents.
// Checks for unrecognized variables, warns if RESPONSE_FORMAT is missing,
// and estimates token count.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// All recognized template variables
const KNOWN_VARIABLES = new Set([
  "FEED",
  "NEWS",
  "MEMORIES",
  "EVENTS",
  "KNOWLEDGE",
  "PLATFORM_KNOWLEDGE",
  "MOOD",
  "SYNAPSES",
  "DESIGNATION",
  "COMMUNITIES",
  "SATURATED_TOPICS",
  "RESPONSE_FORMAT",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }

    const body = await req.json();
    const template: string | undefined = body.template;

    if (!template || typeof template !== "string") {
      return new Response(
        JSON.stringify({
          valid: false,
          warnings: [],
          errors: ["template field is required and must be a string"],
          estimated_tokens: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for empty template
    if (template.trim().length === 0) {
      errors.push("Template is empty");
      return new Response(
        JSON.stringify({ valid: false, warnings, errors, estimated_tokens: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Find all {{...}} variables in the template
    const variablePattern = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
    const foundVariables = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = variablePattern.exec(template)) !== null) {
      foundVariables.add(match[1]);
    }

    // Check for unrecognized variables
    for (const variable of foundVariables) {
      if (!KNOWN_VARIABLES.has(variable)) {
        errors.push(`Unrecognized template variable: {{${variable}}}. Known variables are: ${Array.from(KNOWN_VARIABLES).join(", ")}`);
      }
    }

    // Warn if RESPONSE_FORMAT is missing (it will be auto-appended, but user should know)
    if (!foundVariables.has("RESPONSE_FORMAT")) {
      warnings.push("{{RESPONSE_FORMAT}} is not included in the template. It will be automatically appended at the end, but it's recommended to place it explicitly where you want the output instructions.");
    }

    // Check for potentially problematic patterns
    // Look for any {{...}} that use lowercase or mixed case (common mistake).
    // The all-uppercase pattern above only catches UPPER_SNAKE_CASE; this catches everything else.
    const mixedCaseVarPattern = /\{\{([^}]+)\}\}/g;
    let lcMatch: RegExpExecArray | null;
    while ((lcMatch = mixedCaseVarPattern.exec(template)) !== null) {
      const inner = lcMatch[1];
      // Already captured by the all-caps pattern above — skip those
      if (/^[A-Z_][A-Z0-9_]*$/.test(inner)) continue;
      warnings.push(`Found non-uppercase variable {{${inner}}} — template variables must be UPPERCASE (e.g., {{FEED}}, {{NEWS}})`);
    }

    // Estimate token count (rough approximation: chars / 4)
    const estimatedTokens = Math.ceil(template.length / 4);

    // Warn on very large templates
    if (estimatedTokens > 2000) {
      warnings.push(`Template is large (~${estimatedTokens} tokens estimated). This leaves less room for context injection and may increase latency and costs.`);
    }

    // Warn on very small templates
    if (template.trim().length < 100) {
      warnings.push("Template is very short. Consider adding more context instructions for better agent behavior.");
    }

    const valid = errors.length === 0;

    return new Response(
      JSON.stringify({
        valid,
        warnings,
        errors,
        estimated_tokens: estimatedTokens,
        found_variables: Array.from(foundVariables),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error("[VALIDATE-PROMPT-TEMPLATE] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
